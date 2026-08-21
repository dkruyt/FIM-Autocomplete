import { IDE } from "../../index";
import { findUriInDirs } from "../../util/uri";
import { ContextRetrievalService } from "../context/ContextRetrievalService";
import { GetLspDefinitionsFunction } from "../types";
import { HelperVars } from "../util/HelperVars";
import { openedFilesLruCache } from "../util/openedFilesLruCache";

import {
  AutocompleteClipboardSnippet,
  AutocompleteDiagnosticsSnippet,
  AutocompleteCodeSnippet,
  AutocompleteSnippetType,
  AutocompleteStaticSnippet,
} from "./types";

// LSP-derived definitions around the cursor. Time-boxed like every other
// source (see racePromise below), so a slow language server degrades the
// completion's context rather than stalling the request.
const IDE_SNIPPETS_ENABLED = true;

export interface SnippetPayload {
  rootPathSnippets: AutocompleteCodeSnippet[];
  importDefinitionSnippets: AutocompleteCodeSnippet[];
  ideSnippets: AutocompleteCodeSnippet[];
  recentlyEditedRangeSnippets: AutocompleteCodeSnippet[];
  recentlyVisitedRangesSnippets: AutocompleteCodeSnippet[];
  clipboardSnippets: AutocompleteClipboardSnippet[];
  recentlyOpenedFileSnippets: AutocompleteCodeSnippet[];
  staticSnippet: AutocompleteStaticSnippet[];
  diagnosticsSnippets: AutocompleteDiagnosticsSnippet[];
}

/** Budget for a single context source before we give up and complete without it. */
const DEFAULT_SNIPPET_TIMEOUT_MS = 100;

/**
 * Static contextualization is opt-in and deliberately expensive (it resolves the
 * type of the hole via hover, then crawls transitively relevant types). It gets a
 * larger budget than the other sources -- but still a bounded one.
 */
const STATIC_CONTEXT_TIMEOUT_MS = 1000;

/**
 * Upper bound on how many recently-opened files we read per completion.
 * Matches `numFilesConsidered` in `formatOpenedFilesContext`, which is the
 * most that can survive ranking.
 */
const MAX_OPENED_FILES_TO_READ = 10;

function racePromise<T>(
  promise: Promise<T[]>,
  timeout = DEFAULT_SNIPPET_TIMEOUT_MS,
): Promise<T[]> {
  const timeoutPromise = new Promise<T[]>((resolve) => {
    setTimeout(() => resolve([]), timeout);
  });

  // Context is best-effort by definition -- these sources already give up on a
  // timeout. A source that throws instead must degrade the same way: without
  // this, one failure rejects the Promise.all below and the user gets no
  // completion at all rather than one with less context.
  const settled = promise.catch((e) => {
    console.error("Autocomplete context source failed:", e);
    return [] as T[];
  });

  return Promise.race([settled, timeoutPromise]);
}

// Some IDEs might have special ways of finding snippets (e.g. JetBrains and VS Code have different "LSP-equivalent" systems,
// or they might separately track recently edited ranges)
async function getIdeSnippets(
  helper: HelperVars,
  ide: IDE,
  getDefinitionsFromLsp: GetLspDefinitionsFunction,
): Promise<AutocompleteCodeSnippet[]> {
  const ideSnippets = await getDefinitionsFromLsp(
    helper.input.filepath,
    helper.fullPrefix + helper.fullSuffix,
    helper.fullPrefix.length,
    ide,
    helper.lang,
  );

  if (helper.options.onlyMyCode) {
    const workspaceDirs = await ide.getWorkspaceDirs();

    return ideSnippets.filter((snippet) =>
      workspaceDirs.some(
        (dir) => !!findUriInDirs(snippet.filepath, [dir]).foundInDir,
      ),
    );
  }

  return ideSnippets;
}

function getSnippetsFromRecentlyEditedRanges(
  helper: HelperVars,
): AutocompleteCodeSnippet[] {
  if (helper.options.useRecentlyEdited === false) {
    return [];
  }

  return (
    helper.input.recentlyEditedRanges
      // Ranges in the file being edited are already in the caret window, only
      // staler. Sending them back duplicates the prompt's own subject and, worse,
      // shows the model an out-of-date copy of code it can already see.
      .filter((range) => range.filepath !== helper.filepath)
      .map((range) => {
        return {
          filepath: range.filepath,
          content: range.lines.join("\n"),
          type: AutocompleteSnippetType.Code,
        };
      })
  );
}

const getClipboardSnippets = async (
  ide: IDE,
): Promise<AutocompleteClipboardSnippet[]> => {
  const content = await ide.getClipboardContent();

  return [content].map((item) => {
    return {
      content: item.text,
      copiedAt: item.copiedAt,
      type: AutocompleteSnippetType.Clipboard,
    };
  });
};

const getSnippetsFromRecentlyOpenedFiles = async (
  helper: HelperVars,
  ide: IDE,
): Promise<AutocompleteCodeSnippet[]> => {
  if (helper.options.useRecentlyOpened === false) {
    return [];
  }

  try {
    const currentFileUri = `${helper.filepath}`;

    // Most-recent first, excluding the current file. Only the top
    // `MAX_OPENED_FILES_TO_READ` can ever reach the prompt (see
    // `formatOpenedFilesContext`), so reading the whole cache is wasted I/O on
    // every keystroke.
    const fileUrisToRead = [...openedFilesLruCache.entriesDescending()]
      .filter(([fileUri, _]) => fileUri !== currentFileUri)
      .map(([fileUri, _]) => fileUri)
      .slice(0, MAX_OPENED_FILES_TO_READ);

    // Create an array of promises that each read a file with timeout
    const fileReadPromises = fileUrisToRead.map((fileUri) => {
      // Create a promise that resolves to a snippet or null
      const readPromise = new Promise<AutocompleteCodeSnippet | null>(
        (resolve) => {
          ide
            .readFile(fileUri)
            .then((fileContent) => {
              if (!fileContent || fileContent.trim() === "") {
                resolve(null);
                return;
              }

              resolve({
                filepath: fileUri,
                content: fileContent,
                type: AutocompleteSnippetType.Code,
              });
            })
            .catch((e) => {
              console.error(`Failed to read file ${fileUri}:`, e);
              resolve(null);
            });
        },
      );
      // Cut off at 80ms via racing promises
      return Promise.race([
        readPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 80)),
      ]);
    });

    // Execute all file reads in parallel
    const results = await Promise.all(fileReadPromises);

    // Filter out null results
    return results.filter(Boolean) as AutocompleteCodeSnippet[];
  } catch (e) {
    console.error("Error processing opened files cache:", e);
    return [];
  }
};

/** How far either side of the cursor a diagnostic has to be to be worth mentioning. */
const DIAGNOSTICS_LINE_RADIUS = 15;
/** More than a handful is noise, and crowds out actual code. */
const MAX_DIAGNOSTICS = 5;

/**
 * Compiler and linter errors around the cursor.
 *
 * A model that can see "Cannot find name 'formatCurrency'" writes the import,
 * and one that can see a type error tends to stop repeating it. Errors far from
 * the cursor are unrelated to what is being typed, so only a window either side
 * counts.
 */
const getDiagnosticsSnippets = async (
  helper: HelperVars,
  ide: IDE,
): Promise<AutocompleteDiagnosticsSnippet[]> => {
  if (!helper.options.useDiagnostics) {
    return [];
  }

  const problems = await ide.getProblems(helper.filepath);
  if (problems.length === 0) {
    return [];
  }

  const caretLine = helper.pos.line;
  const nearby = problems
    .filter(
      (p) =>
        Math.abs(p.range.start.line - caretLine) <= DIAGNOSTICS_LINE_RADIUS,
    )
    .sort(
      (a, b) =>
        Math.abs(a.range.start.line - caretLine) -
        Math.abs(b.range.start.line - caretLine),
    )
    .slice(0, MAX_DIAGNOSTICS);

  if (nearby.length === 0) {
    return [];
  }

  // 1-based lines, to match what the editor shows the user.
  const content = nearby
    .map(
      (p) =>
        `Line ${p.range.start.line + 1}: ${p.message.split("\n")[0].trim()}`,
    )
    .join("\n");

  return [
    {
      type: AutocompleteSnippetType.Diagnostics,
      content: `Problems in this file:\n${content}`,
    },
  ];
};

export const getAllSnippets = async ({
  helper,
  ide,
  getDefinitionsFromLsp,
  contextRetrievalService,
}: {
  helper: HelperVars;
  ide: IDE;
  getDefinitionsFromLsp: GetLspDefinitionsFunction;
  contextRetrievalService: ContextRetrievalService;
}): Promise<SnippetPayload> => {
  const recentlyEditedRangeSnippets =
    getSnippetsFromRecentlyEditedRanges(helper);

  const [
    rootPathSnippets,
    importDefinitionSnippets,
    ideSnippets,
    clipboardSnippets,
    recentlyOpenedFileSnippets,
    staticSnippet,
    diagnosticsSnippets,
  ] = await Promise.all([
    racePromise(contextRetrievalService.getRootPathSnippets(helper)),
    racePromise(
      contextRetrievalService.getSnippetsFromImportDefinitions(helper),
    ),
    IDE_SNIPPETS_ENABLED
      ? racePromise(getIdeSnippets(helper, ide, getDefinitionsFromLsp))
      : [],
    racePromise(getClipboardSnippets(ide)),
    racePromise(getSnippetsFromRecentlyOpenedFiles(helper, ide)),
    helper.options.experimental_enableStaticContextualization
      ? racePromise(
          contextRetrievalService.getStaticContextSnippets(helper),
          STATIC_CONTEXT_TIMEOUT_MS,
        )
      : [],
    racePromise(getDiagnosticsSnippets(helper, ide)),
  ]);

  return {
    rootPathSnippets,
    importDefinitionSnippets,
    ideSnippets,
    recentlyEditedRangeSnippets,
    clipboardSnippets,
    recentlyVisitedRangesSnippets: helper.input.recentlyVisitedRanges,
    recentlyOpenedFileSnippets,
    staticSnippet,
    diagnosticsSnippets,
  };
};
