import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  showTextDocument: vi.fn(() => Promise.resolve()),
  openTextDocument: vi.fn((p: string) => Promise.resolve({ uri: p })),
  showInformationMessage: vi.fn(() => Promise.resolve(undefined as unknown)),
  showErrorMessage: vi.fn(),
  executeCommand: vi.fn(),
  existsSync: vi.fn(() => false),
  copyFileSync: vi.fn(),
  readFileSync: vi.fn(() => Buffer.from("bundled tutorial")),
  getGlobalPath: vi.fn(() => "/global"),
}));

vi.mock("vscode", () => ({
  Uri: {
    joinPath: (base: { fsPath: string }, ...parts: string[]) => ({
      fsPath: [base.fsPath, ...parts].join("/"),
    }),
  },
  commands: { executeCommand: mocks.executeCommand },
  window: {
    showTextDocument: mocks.showTextDocument,
    showInformationMessage: mocks.showInformationMessage,
    showErrorMessage: mocks.showErrorMessage,
  },
  workspace: { openTextDocument: mocks.openTextDocument },
}));

vi.mock("fs", () => ({
  existsSync: mocks.existsSync,
  copyFileSync: mocks.copyFileSync,
  readFileSync: mocks.readFileSync,
  default: {
    existsSync: mocks.existsSync,
    copyFileSync: mocks.copyFileSync,
    readFileSync: mocks.readFileSync,
  },
}));

vi.mock("core/util/paths", () => ({ getGlobalPath: mocks.getGlobalPath }));

import { createHash } from "crypto";

import { openTutorial, showTutorialOnFirstInstall } from "./tutorial";

const DESTINATION = "/global/tutorial.py";

/** sha256 of what the fs mock returns, i.e. an untouched copy. */
const UNTOUCHED_HASH = createHash("sha256")
  .update(Buffer.from("bundled tutorial"))
  .digest("hex");

function fakeContext(shown = false, copyHash?: string) {
  const state = new Map<string, unknown>([["fim.tutorialShown", shown]]);
  if (copyHash) {
    state.set("fim.tutorialCopyHash", copyHash);
  }
  return {
    extensionUri: { fsPath: "/ext" },
    globalState: {
      get: (key: string) => state.get(key),
      update: vi.fn((key: string, value: unknown) => {
        state.set(key, value);
        return Promise.resolve();
      }),
    },
  } as unknown as import("vscode").ExtensionContext;
}

/** A config with, or without, a usable model. */
function fakeConfig(hasModel: boolean) {
  return {
    getModel: () => Promise.resolve(hasModel ? {} : undefined),
    getOptions: () => ({}),
  } as unknown as import("./config/FimConfig").FimConfigProvider;
}

describe("openTutorial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existsSync.mockReturnValue(false);
  });

  it("copies the tutorial out of the bundle when it isn't there yet", async () => {
    await openTutorial(fakeContext());

    expect(mocks.copyFileSync).toHaveBeenCalledWith(
      "/ext/tutorial/tutorial.py",
      DESTINATION,
    );
    expect(mocks.openTextDocument).toHaveBeenCalledWith(DESTINATION);
    expect(mocks.showTextDocument).toHaveBeenCalledWith(
      { uri: DESTINATION },
      { preview: false },
    );
  });

  it("keeps a copy the user has edited", async () => {
    mocks.existsSync.mockReturnValue(true);
    // Recorded hash is of something else, so the file on disk has been changed.
    const context = fakeContext(false, "a-hash-of-something-else");

    await openTutorial(context);

    expect(mocks.copyFileSync).not.toHaveBeenCalled();
    expect(mocks.showTextDocument).toHaveBeenCalled();
  });

  it("keeps a copy predating the hash bookkeeping", async () => {
    // No recorded hash means there is no way to know whether it was edited, and
    // destroying someone's notes is worse than showing them a stale tutorial.
    mocks.existsSync.mockReturnValue(true);

    await openTutorial(fakeContext());

    expect(mocks.copyFileSync).not.toHaveBeenCalled();
  });

  it("refreshes a copy that is still exactly what we wrote", async () => {
    // Otherwise a tutorial rewritten for new features never reaches the people
    // who opened the old one.
    mocks.existsSync.mockReturnValue(true);
    const context = fakeContext(false, UNTOUCHED_HASH);

    await openTutorial(context);

    expect(mocks.copyFileSync).toHaveBeenCalledWith(
      "/ext/tutorial/tutorial.py",
      DESTINATION,
    );
    expect(mocks.showTextDocument).toHaveBeenCalled();
  });

  it("reports a failure rather than throwing at the caller", async () => {
    // Once, so the implementation doesn't leak into the next test
    mocks.copyFileSync.mockImplementationOnce(() => {
      throw new Error("EACCES");
    });

    await expect(openTutorial(fakeContext())).resolves.toBeUndefined();
    expect(mocks.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("EACCES"),
    );
  });
});

describe("showTutorialOnFirstInstall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existsSync.mockReturnValue(false);
  });

  it("opens once and remembers it did", async () => {
    const context = fakeContext(false);

    await showTutorialOnFirstInstall(context, fakeConfig(true));

    expect(context.globalState.update).toHaveBeenCalledWith(
      "fim.tutorialShown",
      true,
    );
    expect(mocks.showTextDocument).toHaveBeenCalledOnce();
    // A model is configured, so nothing to nag about
    expect(mocks.showInformationMessage).not.toHaveBeenCalled();
  });

  it("does nothing on later starts", async () => {
    await showTutorialOnFirstInstall(fakeContext(true), fakeConfig(true));

    expect(mocks.showTextDocument).not.toHaveBeenCalled();
  });

  it("offers the model wizard when nothing is configured", async () => {
    mocks.showInformationMessage.mockResolvedValue("Select model");

    await showTutorialOnFirstInstall(fakeContext(false), fakeConfig(false));

    await vi.waitFor(() =>
      expect(mocks.executeCommand).toHaveBeenCalledWith("fim.selectModel"),
    );
  });
});
