import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: vi.mock is lifted above the imports, so its factory cannot close
// over ordinary top-level consts.
const { showInformationMessage, getConfiguration } = vi.hoisted(() => ({
  showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
  getConfiguration: vi.fn(),
}));

vi.mock("vscode", () => ({
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  EventEmitter: class {
    event = () => ({ dispose: () => {} });
    fire() {}
    dispose() {}
  },
  commands: { executeCommand: vi.fn() },
  window: { showInformationMessage },
  workspace: {
    getConfiguration,
    onDidChangeConfiguration: vi.fn(() => ({ dispose: () => {} })),
  },
}));

vi.mock("core/llm/llms", () => ({
  llmFromProviderAndOptions: vi.fn(),
}));

import { migrateLegacyModelSetting } from "./migrateLegacyModel";

type Inspection = Record<string, unknown>;

/** Records what the migration writes, and to which scope. */
function stubConfig(inspections: Record<string, Inspection>) {
  const updates: [key: string, value: unknown, target: number][] = [];
  getConfiguration.mockReturnValue({
    inspect: (key: string) => inspections[key],
    update: vi.fn((key: string, value: unknown, target: number) => {
      updates.push([key, value, target]);
      return Promise.resolve();
    }),
  });
  return updates;
}

describe("migrateLegacyModelSetting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("splits a global fim.model object into the flat settings", async () => {
    const updates = stubConfig({
      model: {
        globalValue: {
          provider: "ollama",
          model: "qwen2.5-coder:1.5b",
          apiBase: "http://localhost:11434",
          contextLength: 8192,
        },
      },
      provider: {},
    });

    await migrateLegacyModelSetting();

    expect(updates).toEqual([
      ["provider", "ollama", 1],
      ["apiBase", "http://localhost:11434", 1],
      ["contextLength", 8192, 1],
      // Last, because it overwrites the object itself
      ["model", "qwen2.5-coder:1.5b", 1],
    ]);
    expect(showInformationMessage).toHaveBeenCalledOnce();
  });

  it("writes to the scope the object came from", async () => {
    const updates = stubConfig({
      model: { workspaceValue: { provider: "vllm", model: "starcoder2" } },
      provider: {},
    });

    await migrateLegacyModelSetting();

    expect(updates).toEqual([
      ["provider", "vllm", 2],
      ["model", "starcoder2", 2],
    ]);
  });

  it("does nothing once fim.model is a plain string", async () => {
    const updates = stubConfig({
      model: { globalValue: "qwen2.5-coder:1.5b" },
      provider: { globalValue: "ollama" },
    });

    await migrateLegacyModelSetting();

    expect(updates).toEqual([]);
    expect(showInformationMessage).not.toHaveBeenCalled();
  });

  it("leaves a scope alone when it already has a flat provider", async () => {
    const updates = stubConfig({
      model: { globalValue: { provider: "mistral", model: "codestral" } },
      provider: { globalValue: "ollama" },
    });

    await migrateLegacyModelSetting();

    expect(updates).toEqual([]);
    expect(showInformationMessage).not.toHaveBeenCalled();
  });
});
