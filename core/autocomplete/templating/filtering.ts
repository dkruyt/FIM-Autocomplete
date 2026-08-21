import { countTokens } from "../../llm/countTokens";
import { SnippetPayload } from "../snippets";
import {
  AutocompleteCodeSnippet,
  AutocompleteSnippet,
  AutocompleteSnippetType,
  AutocompleteStaticSnippet,
} from "../snippets/types";
import { getSymbolsForSnippet } from "../context/ranking";
import { HelperVars } from "../util/HelperVars";
import { formatOpenedFilesContext } from "./formatOpenedFilesContext";

import { isValidSnippet } from "./validation";

const getRemainingTokenCount = (helper: HelperVars): number => {
  const tokenCount = countTokens(helper.prunedCaretWindow, helper.modelName);

  return helper.options.maxPromptTokens - tokenCount;
};

const TOKEN_BUFFER = 10; // We may need extra tokens for snippet description etc.

/**
 * Orders snippets by how much their symbols overlap the code around the caret.
 *
 * The token budget routinely truncates this list, so ordering decides which
 * context actually reaches the model. This used to be `shuffleArray`, which
 * made that a coin flip: the same cursor position could produce a good
 * completion or a bad one depending on which snippets happened to survive.
 *
 * Overlap is normalised by the square root of the snippet's symbol count.
 * Dividing by the raw count over-punishes a large, genuinely relevant file;
 * not normalising at all lets any big file win on volume. The square root is
 * the usual compromise (it is what TF-IDF length normalisation does).
 *
 * Sorting is stable, so equal scores keep their original source order --
 * root-path, then import definitions, then static context -- which is a
 * meaningful fallback rather than an arbitrary one.
 */
export const rankSnippetsByRelevance = <T extends AutocompleteSnippet>(
  snippets: T[],
  caretWindow: string,
): T[] => {
  if (snippets.length < 2) {
    return snippets;
  }

  const caretSymbols = getSymbolsForSnippet(caretWindow);
  if (caretSymbols.size === 0) {
    return snippets;
  }

  const scored = snippets.map((snippet, index) => {
    const symbols = getSymbolsForSnippet(snippet.content);
    let overlap = 0;
    for (const symbol of symbols) {
      if (caretSymbols.has(symbol)) {
        overlap++;
      }
    }
    return {
      snippet,
      index,
      score: symbols.size === 0 ? 0 : overlap / Math.sqrt(symbols.size),
    };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ snippet }) => snippet);
};

function filterSnippetsAlreadyInCaretWindow(
  snippets: (AutocompleteCodeSnippet | AutocompleteStaticSnippet)[],
  caretWindow: string,
): (AutocompleteCodeSnippet | AutocompleteStaticSnippet)[] {
  return snippets.filter(
    (s) => s.content.trim() !== "" && !caretWindow.includes(s.content.trim()),
  );
}

export const getSnippets = (
  helper: HelperVars,
  payload: SnippetPayload,
): AutocompleteSnippet[] => {
  const snippets = {
    clipboard: payload.clipboardSnippets,
    recentlyVisitedRanges: payload.recentlyVisitedRangesSnippets,
    recentlyEditedRanges: payload.recentlyEditedRangeSnippets,
    recentlyOpenedFiles: payload.recentlyOpenedFileSnippets,
    base: rankSnippetsByRelevance(
      filterSnippetsAlreadyInCaretWindow(
        [
          ...payload.rootPathSnippets,
          ...payload.importDefinitionSnippets,
          ...payload.staticSnippet,
        ],
        helper.prunedCaretWindow,
      ),
      helper.prunedCaretWindow,
    ),
  };

  // Define snippets with their priorities.
  //
  // Deliberately carries no `snippets` field: the loop below reads
  // `snippets[key]`, so a copy here was never read -- but it was still
  // evaluated, which meant the base bucket was filtered and ordered twice on
  // every keystroke.
  const snippetConfigs: {
    key: keyof typeof snippets;
    enabledOrPriority: boolean | number;
    defaultPriority: number;
  }[] = [
    {
      key: "clipboard",
      enabledOrPriority: helper.options.experimental_includeClipboard,
      defaultPriority: 1,
    },
    {
      key: "recentlyOpenedFiles",
      enabledOrPriority: helper.options.useRecentlyOpened,
      defaultPriority: 2,
    },
    {
      key: "recentlyVisitedRanges",
      enabledOrPriority:
        helper.options.experimental_includeRecentlyVisitedRanges,
      defaultPriority: 3,
      /* TODO: recentlyVisitedRanges also contain contents from other windows like terminal or output
      if they are visible. We should handle them separately so that we can control their priority
      and whether they should be included or not. */
    },
    {
      key: "recentlyEditedRanges",
      enabledOrPriority:
        helper.options.experimental_includeRecentlyEditedRanges,
      defaultPriority: 4,
    },

    {
      key: "base",
      enabledOrPriority: true,
      defaultPriority: 99, // make sure it's the last one to be processed, but still possible to override
    },
  ];

  // Create a readable order of enabled snippets
  const snippetOrder = snippetConfigs
    .filter(({ enabledOrPriority }) => enabledOrPriority)
    .map(({ key, enabledOrPriority, defaultPriority }) => ({
      key,
      priority:
        typeof enabledOrPriority === "number"
          ? enabledOrPriority
          : defaultPriority,
    }))
    .sort((a, b) => a.priority - b.priority);

  const finalSnippets = [];
  let remainingTokenCount = getRemainingTokenCount(helper);

  // tracks already added filepaths for deduplication
  const addedFilepaths = new Set<string>();

  // Process snippets in priority order
  for (const { key } of snippetOrder) {
    // Special handling for recentlyOpenedFiles
    if (key === "recentlyOpenedFiles" && helper.options.useRecentlyOpened) {
      // Custom trimming
      const processedSnippets = formatOpenedFilesContext(
        payload.recentlyOpenedFileSnippets,
        remainingTokenCount,
        helper,
        finalSnippets,
        TOKEN_BUFFER,
      );

      // Add processed snippets to finalSnippets respecting token limits
      for (const snippet of processedSnippets) {
        if (!isValidSnippet(snippet)) continue;

        const snippetSize =
          countTokens(snippet.content, helper.modelName) + TOKEN_BUFFER;

        if (remainingTokenCount >= snippetSize) {
          finalSnippets.push(snippet);
          addedFilepaths.add(snippet.filepath);
          remainingTokenCount -= snippetSize;
        } else {
          continue; // Not enough tokens, try again with next snippet
        }
      }
    } else {
      // Normal processing for other snippet types
      const snippetsToProcess = snippets[key].filter(
        (snippet) =>
          snippet.type !== AutocompleteSnippetType.Code ||
          !addedFilepaths.has(snippet.filepath),
      );

      for (const snippet of snippetsToProcess) {
        if (!isValidSnippet(snippet)) continue;

        const snippetSize =
          countTokens(snippet.content, helper.modelName) + TOKEN_BUFFER;

        if (remainingTokenCount >= snippetSize) {
          finalSnippets.push(snippet);

          if ((snippet as AutocompleteCodeSnippet).filepath) {
            addedFilepaths.add((snippet as AutocompleteCodeSnippet).filepath);
          }

          remainingTokenCount -= snippetSize;
        } else {
          continue; // Not enough tokens, try again with next snippet
        }
      }
    }

    // If we're out of tokens, no need to process more snippet types
    if (remainingTokenCount <= 0) break;
  }

  return finalSnippets;
};
