import { describe, expect, it } from "vitest";

import { SnippetPayload } from "../snippets";
import { AutocompleteSnippetType } from "../snippets/types";
import { HelperVars } from "../util/HelperVars";

import { getSnippets } from "./filtering";

const CARET_WINDOW = `class Config:
    BATCH_SIZE = 64
    MEMORY_SIZE = 10000
    TARGET_UPDATE = 1000
`;

const code = (content: string, filepath: string) => ({
  content,
  filepath,
  type: AutocompleteSnippetType.Code as const,
});

function emptyPayload(): SnippetPayload {
  return {
    rootPathSnippets: [],
    importDefinitionSnippets: [],
    ideSnippets: [],
    recentlyEditedRangeSnippets: [],
    recentlyVisitedRangesSnippets: [],
    clipboardSnippets: [],
    recentlyOpenedFileSnippets: [],
    staticSnippet: [],
    diagnosticsSnippets: [],
  };
}

function helper(): HelperVars {
  return {
    prunedCaretWindow: CARET_WINDOW,
    modelName: "test-model",
    filepath: "file:///config.py",
    options: {
      maxPromptTokens: 2048,
      useRecentlyOpened: true,
      useDiagnostics: true,
      experimental_includeClipboard: false,
      experimental_includeRecentlyVisitedRanges: true,
      experimental_includeRecentlyEditedRanges: true,
      experimental_enableStaticContextualization: false,
    },
  } as unknown as HelperVars;
}

describe("context already visible around the cursor is not sent twice", () => {
  it("drops a recently-edited range that is still in the caret window", () => {
    const payload = emptyPayload();
    payload.recentlyEditedRangeSnippets = [
      code(
        "    MEMORY_SIZE = 10000\n    TARGET_UPDATE = 1000",
        "file:///other.py",
      ),
      code("def unrelated():\n    return 1", "file:///other.py"),
    ];

    const result = getSnippets(helper(), payload);
    const contents = result.map((s) => s.content);
    expect(contents.some((c) => c.includes("MEMORY_SIZE"))).toBe(false);
    expect(contents.some((c) => c.includes("unrelated"))).toBe(true);
  });

  it("drops a recently-visited range that is still in the caret window", () => {
    const payload = emptyPayload();
    payload.recentlyVisitedRangesSnippets = [
      code("    BATCH_SIZE = 64", "file:///other.py"),
    ];
    expect(getSnippets(helper(), payload)).toHaveLength(0);
  });

  it("drops a recently-opened file whose content is already visible", () => {
    const payload = emptyPayload();
    payload.recentlyOpenedFileSnippets = [
      code("    TARGET_UPDATE = 1000", "file:///other.py"),
    ];
    const contents = getSnippets(helper(), payload).map((s) => s.content);
    expect(contents.some((c) => c.includes("TARGET_UPDATE"))).toBe(false);
  });
});
