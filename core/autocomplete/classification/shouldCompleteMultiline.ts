import { AutocompleteLanguageInfo } from "../constants/AutocompleteLanguageInfo";
import { HelperVars } from "../util/HelperVars";

function isMidlineCompletion(prefix: string, suffix: string): boolean {
  return !suffix.startsWith("\n");
}

function shouldCompleteMultilineBasedOnLanguage(
  language: AutocompleteLanguageInfo,
  prefix: string,
  suffix: string,
) {
  return language.useMultiline?.({ prefix, suffix }) ?? true;
}

export function shouldCompleteMultiline(helper: HelperVars) {
  switch (helper.options.multilineCompletions) {
    case "always":
      return true;
    case "never":
      return false;
    default:
      break;
  }

  // Always single-line if an intellisense option is selected
  if (helper.input.selectedCompletionInfo) {
    return true;
  }

  // // Don't complete multi-line if you are mid-line
  // if (isMidlineCompletion(helper.fullPrefix, helper.fullSuffix)) {
  //   return false;
  // }

  // Writing *inside* a comment is prose, and a multi-line suggestion there
  // tends to ramble, so stay on one line.
  //
  // But sitting at the *end* of a finished comment is the opposite situation:
  // "// parse the config file" followed by a cursor is a description of code
  // the user wants written, and capping it at one line throws away the most
  // valuable completion the plugin can offer. The whole rule used to apply to
  // both, which meant the comment-then-implementation flow never worked unless
  // you pressed Enter first.
  if (
    helper.lang.singleLineComment &&
    isMidlineCompletion(helper.fullPrefix, helper.fullSuffix) &&
    helper.fullPrefix
      .split("\n")
      .slice(-1)[0]
      ?.trimStart()
      .startsWith(helper.lang.singleLineComment)
  ) {
    return false;
  }

  return shouldCompleteMultilineBasedOnLanguage(
    helper.lang,
    helper.prunedPrefix,
    helper.prunedSuffix,
  );
}
