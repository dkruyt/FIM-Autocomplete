import { IDE } from "../../index";
import { findUriInDirs } from "../../util/uri";
import { ContextRetrievalService } from "../context/ContextRetrievalService";
import { GetLspDefinitionsFunction } from "../types";
import { HelperVars } from "../util/HelperVars";
import { openedFilesLruCache } from "../util/openedFilesLruCache";

import {
  AutocompleteClipboardSnippet,
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

  return Promise.race([promise, timeoutPromise]);
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

  return helper.input.recentlyEditedRanges.map((range) => {
    return {
      filepath: range.filepath,
      content: range.lines.join("\n"),
      type: AutocompleteSnippetType.Code,
    };
  });
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
  };
};
