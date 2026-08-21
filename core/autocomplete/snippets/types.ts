export enum AutocompleteSnippetType {
  Code = "code",
  Clipboard = "clipboard",
  Static = "static",
  Diagnostics = "diagnostics",
}

interface BaseAutocompleteSnippet {
  content: string;
  type: AutocompleteSnippetType;
}

export interface AutocompleteCodeSnippet extends BaseAutocompleteSnippet {
  filepath: string;
  type: AutocompleteSnippetType.Code;
}

export interface AutocompleteClipboardSnippet extends BaseAutocompleteSnippet {
  type: AutocompleteSnippetType.Clipboard;
  copiedAt: string;
}

export interface AutocompleteStaticSnippet extends BaseAutocompleteSnippet {
  type: AutocompleteSnippetType.Static;
  filepath: string;
}

/**
 * Compiler and linter errors near the cursor.
 *
 * Carries no filepath: it always describes the file being edited, and the
 * snippet pipeline treats a filepath as "this snippet came from another file"
 * for deduplication purposes.
 */
export interface AutocompleteDiagnosticsSnippet extends BaseAutocompleteSnippet {
  type: AutocompleteSnippetType.Diagnostics;
}

export type AutocompleteSnippet =
  | AutocompleteCodeSnippet
  | AutocompleteClipboardSnippet
  | AutocompleteStaticSnippet
  | AutocompleteDiagnosticsSnippet;
