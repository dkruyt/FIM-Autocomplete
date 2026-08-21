import { describe, expect, it } from "vitest";

import { AutocompleteSnippetType } from "./types";
import { getAllSnippets } from "./getAllSnippets";

const problem = (line: number, message: string) => ({
  filepath: "file:///a.ts",
  range: {
    start: { line, character: 0 },
    end: { line, character: 5 },
  },
  message,
});

function fixture({
  problems = [] as ReturnType<typeof problem>[],
  caretLine = 20,
  useDiagnostics = true,
}) {
  const helper: any = {
    filepath: "file:///a.ts",
    pos: { line: caretLine, character: 0 },
    fullPrefix: "",
    fullSuffix: "",
    lang: { name: "TypeScript" },
    options: {
      useDiagnostics,
      useRecentlyEdited: false,
      useRecentlyOpened: false,
      experimental_includeClipboard: false,
      experimental_enableStaticContextualization: false,
    },
    input: {
      filepath: "file:///a.ts",
      recentlyEditedRanges: [],
      recentlyVisitedRanges: [],
    },
  };
  const ide: any = {
    getProblems: async () => problems,
    getClipboardContent: async () => ({ text: "", copiedAt: "" }),
    readFile: async () => "",
    getWorkspaceDirs: async () => [],
  };
  const contextRetrievalService: any = {
    getRootPathSnippets: async () => [],
    getSnippetsFromImportDefinitions: async () => [],
    getStaticContextSnippets: async () => [],
  };
  return getAllSnippets({
    helper,
    ide,
    getDefinitionsFromLsp: async () => [],
    contextRetrievalService,
  });
}

describe("diagnostics context", () => {
  it("includes an error next to the cursor", async () => {
    const { diagnosticsSnippets } = await fixture({
      problems: [problem(19, "Cannot find name 'formatCurrency'.")],
    });
    expect(diagnosticsSnippets).toHaveLength(1);
    expect(diagnosticsSnippets[0].type).toBe(
      AutocompleteSnippetType.Diagnostics,
    );
    expect(diagnosticsSnippets[0].content).toContain("formatCurrency");
    // Lines are reported 1-based, matching what the editor shows.
    expect(diagnosticsSnippets[0].content).toContain("Line 20:");
  });

  it("ignores errors far from the cursor", async () => {
    const { diagnosticsSnippets } = await fixture({
      problems: [problem(400, "Unrelated error elsewhere in the file.")],
    });
    expect(diagnosticsSnippets).toHaveLength(0);
  });

  it("keeps only the closest few", async () => {
    const { diagnosticsSnippets } = await fixture({
      problems: Array.from({ length: 12 }, (_, i) =>
        problem(20 + i, `err${i}`),
      ),
    });
    const content = diagnosticsSnippets[0].content;
    expect(content.split("\n").length - 1).toBe(5);
    expect(content).toContain("err0");
    expect(content).not.toContain("err9");
  });

  it("collapses a multi-line message to its first line", async () => {
    const { diagnosticsSnippets } = await fixture({
      problems: [
        problem(20, "Type 'A' is not assignable.\n  Detail line.\n  More."),
      ],
    });
    expect(diagnosticsSnippets[0].content).not.toContain("Detail line");
  });

  it("returns nothing when disabled", async () => {
    const { diagnosticsSnippets } = await fixture({
      problems: [problem(20, "Cannot find name 'x'.")],
      useDiagnostics: false,
    });
    expect(diagnosticsSnippets).toHaveLength(0);
  });
});

describe("a failing context source does not sink the completion", () => {
  it("degrades to no snippets from that source", async () => {
    const helper: any = {
      filepath: "file:///a.ts",
      pos: { line: 0, character: 0 },
      fullPrefix: "",
      fullSuffix: "",
      lang: { name: "TypeScript" },
      options: {
        useDiagnostics: true,
        useRecentlyEdited: false,
        useRecentlyOpened: false,
        experimental_includeClipboard: false,
        experimental_enableStaticContextualization: false,
      },
      input: {
        filepath: "file:///a.ts",
        recentlyEditedRanges: [],
        recentlyVisitedRanges: [],
      },
    };
    const ide: any = {
      getProblems: async () => {
        throw new Error("language server is restarting");
      },
      getClipboardContent: async () => ({ text: "", copiedAt: "" }),
      readFile: async () => "",
      getWorkspaceDirs: async () => [],
    };
    const payload = await getAllSnippets({
      helper,
      ide,
      getDefinitionsFromLsp: async () => [],
      contextRetrievalService: {
        getRootPathSnippets: async () => [],
        getSnippetsFromImportDefinitions: async () => [],
        getStaticContextSnippets: async () => [],
      } as any,
    });
    expect(payload.diagnosticsSnippets).toEqual([]);
  });
});

describe("the file being edited is not fed back as context", () => {
  it("drops recently-edited ranges from the current file", async () => {
    const helper: any = {
      filepath: "file:///config.py",
      pos: { line: 0, character: 0 },
      fullPrefix: "",
      fullSuffix: "",
      lang: { name: "Python" },
      options: {
        useDiagnostics: false,
        useRecentlyEdited: true,
        useRecentlyOpened: false,
        experimental_includeClipboard: false,
        experimental_enableStaticContextualization: false,
      },
      input: {
        filepath: "file:///config.py",
        recentlyVisitedRanges: [],
        recentlyEditedRanges: [
          // Same file as the cursor: already in the caret window, only staler.
          { filepath: "file:///config.py", lines: ["ROWS = 6"] },
          { filepath: "file:///other.py", lines: ["def helper(): pass"] },
        ],
      },
    };
    const payload = await getAllSnippets({
      helper,
      ide: {
        getProblems: async () => [],
        getClipboardContent: async () => ({ text: "", copiedAt: "" }),
        readFile: async () => "",
        getWorkspaceDirs: async () => [],
      } as any,
      getDefinitionsFromLsp: async () => [],
      contextRetrievalService: {
        getRootPathSnippets: async () => [],
        getSnippetsFromImportDefinitions: async () => [],
        getStaticContextSnippets: async () => [],
      } as any,
    });
    expect(payload.recentlyEditedRangeSnippets).toHaveLength(1);
    expect(payload.recentlyEditedRangeSnippets[0].filepath).toBe(
      "file:///other.py",
    );
  });
});
