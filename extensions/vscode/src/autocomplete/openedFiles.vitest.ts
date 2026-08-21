import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  class FakeTabInputText {
    constructor(public uri: any) {}
  }
  return {
    FakeTabInputText,
    listeners: {} as {
      activeEditor?: (editor: any) => void;
      closeDoc?: (doc: any) => void;
    },
    tabGroups: { all: [] as any[] },
    windowState: { activeTextEditor: undefined as any },
  };
});

vi.mock("vscode", () => ({
  TabInputText: h.FakeTabInputText,
  window: {
    get tabGroups() {
      return h.tabGroups;
    },
    get activeTextEditor() {
      return h.windowState.activeTextEditor;
    },
    onDidChangeActiveTextEditor: (cb: (editor: any) => void) => {
      h.listeners.activeEditor = cb;
      return { dispose: () => {} };
    },
  },
  workspace: {
    onDidCloseTextDocument: (cb: (doc: any) => void) => {
      h.listeners.closeDoc = cb;
      return { dispose: () => {} };
    },
  },
}));

import { openedFilesLruCache } from "core/autocomplete/util/openedFilesLruCache";

import { OpenedFilesTracker } from "./openedFiles";

/** Minimal stand-in for a vscode.Uri. */
function uri(fsPath: string, scheme = "file") {
  return { scheme, fsPath, toString: () => `${scheme}://${fsPath}` };
}

function cachedPaths() {
  return [...openedFilesLruCache.entriesDescending()].map(([k]) => k);
}

describe("OpenedFilesTracker", () => {
  beforeEach(() => {
    openedFilesLruCache.clear();
    h.tabGroups.all = [];
    h.windowState.activeTextEditor = undefined;
    h.listeners.activeEditor = undefined;
    h.listeners.closeDoc = undefined;
  });

  it("seeds from tabs that are already open", () => {
    h.tabGroups.all = [
      {
        tabs: [
          { input: new h.FakeTabInputText(uri("/ws/a.ts")) },
          { input: new h.FakeTabInputText(uri("/ws/b.ts")) },
        ],
      },
    ];

    new OpenedFilesTracker();

    expect(cachedPaths()).toContain("file:///ws/a.ts");
    expect(cachedPaths()).toContain("file:///ws/b.ts");
  });

  it("ranks the active editor as most recent", () => {
    h.tabGroups.all = [
      {
        tabs: [
          { input: new h.FakeTabInputText(uri("/ws/a.ts")) },
          { input: new h.FakeTabInputText(uri("/ws/b.ts")) },
        ],
      },
    ];
    h.windowState.activeTextEditor = { document: { uri: uri("/ws/a.ts") } };

    new OpenedFilesTracker();

    expect(cachedPaths()[0]).toBe("file:///ws/a.ts");
  });

  it("promotes a file when it becomes the active editor", () => {
    h.tabGroups.all = [
      {
        tabs: [
          { input: new h.FakeTabInputText(uri("/ws/a.ts")) },
          { input: new h.FakeTabInputText(uri("/ws/b.ts")) },
        ],
      },
    ];
    new OpenedFilesTracker();
    expect(cachedPaths()[0]).toBe("file:///ws/b.ts");

    h.listeners.activeEditor!({ document: { uri: uri("/ws/a.ts") } });

    expect(cachedPaths()[0]).toBe("file:///ws/a.ts");
  });

  it("drops a file once it is closed", () => {
    h.tabGroups.all = [
      { tabs: [{ input: new h.FakeTabInputText(uri("/ws/a.ts")) }] },
    ];
    new OpenedFilesTracker();
    expect(cachedPaths()).toContain("file:///ws/a.ts");

    h.listeners.closeDoc!({ uri: uri("/ws/a.ts") });

    expect(cachedPaths()).not.toContain("file:///ws/a.ts");
  });

  it("ignores non-file schemes and sensitive files", () => {
    h.tabGroups.all = [
      {
        tabs: [
          { input: new h.FakeTabInputText(uri("/ws/output", "output")) },
          { input: new h.FakeTabInputText(uri("/ws/.env")) },
          { input: new h.FakeTabInputText(uri("/ws/ok.ts")) },
        ],
      },
    ];

    new OpenedFilesTracker();

    expect(cachedPaths()).toEqual(["file:///ws/ok.ts"]);
  });
});
