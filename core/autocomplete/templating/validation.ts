import {
  AutocompleteClipboardSnippet,
  AutocompleteCodeSnippet,
  AutocompleteSnippet,
  AutocompleteSnippetType,
} from "../snippets/types";
import { OUTPUT_CHANNEL_URI_PREFIX } from "../../util/constants";

const MAX_CLIPBOARD_AGE = 5 * 60 * 1000;

const isValidClipboardSnippet = (
  snippet: AutocompleteClipboardSnippet,
): boolean => {
  const currDate = new Date();

  const isTooOld =
    currDate.getTime() - new Date(snippet.copiedAt).getTime() >
    MAX_CLIPBOARD_AGE;

  return !isTooOld;
};

export const isValidSnippet = (snippet: AutocompleteSnippet): boolean => {
  if (snippet.content.trim() === "") return false;

  if (snippet.type === AutocompleteSnippetType.Clipboard) {
    return isValidClipboardSnippet(snippet);
  }

  if (
    (snippet as AutocompleteCodeSnippet).filepath?.startsWith(
      OUTPUT_CHANNEL_URI_PREFIX,
    )
  ) {
    return false;
  }

  return true;
};
