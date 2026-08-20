import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  EventEmitter: class {
    event = () => ({ dispose: () => {} });
    fire() {}
    dispose() {}
  },
  workspace: {
    getConfiguration: vi.fn(),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: () => {} })),
  },
}));

// Keeps the test off the whole provider registry — readModelSetting never
// builds an LLM, it only reads settings.
vi.mock("core/llm/llms", () => ({
  llmFromProviderAndOptions: vi.fn(),
}));

import { readModelSetting } from "./FimConfig";

/** A WorkspaceConfiguration whose `get` returns the given values. */
function config(values: Record<string, unknown>) {
  return {
    get: (key: string) => values[key],
  } as unknown as import("vscode").WorkspaceConfiguration;
}

describe("readModelSetting", () => {
  it("reads the flat settings", () => {
    expect(
      readModelSetting(
        config({
          provider: "ollama",
          model: "qwen2.5-coder:1.5b",
          apiBase: "http://localhost:11434",
          apiKey: "sk-123",
          template: "{{{prefix}}}",
          contextLength: 8192,
          requestOptions: { timeout: 5000 },
          completionOptions: { temperature: 0.1 },
        }),
      ),
    ).toEqual({
      provider: "ollama",
      model: "qwen2.5-coder:1.5b",
      apiBase: "http://localhost:11434",
      apiKey: "sk-123",
      template: "{{{prefix}}}",
      contextLength: 8192,
      requestOptions: { timeout: 5000 },
      completionOptions: { temperature: 0.1 },
    });
  });

  it("treats blank and empty settings as unset", () => {
    expect(
      readModelSetting(
        config({
          provider: "  ",
          model: "",
          apiBase: "",
          apiKey: "",
          template: "",
          requestOptions: {},
          completionOptions: {},
        }),
      ),
    ).toEqual({
      provider: undefined,
      model: undefined,
      apiBase: undefined,
      apiKey: undefined,
      template: undefined,
      contextLength: undefined,
      requestOptions: undefined,
      completionOptions: undefined,
    });
  });

  it("trims what the user typed", () => {
    const setting = readModelSetting(
      config({ provider: " ollama ", model: " codellama:7b " }),
    );
    expect(setting.provider).toBe("ollama");
    expect(setting.model).toBe("codellama:7b");
  });

  it("still reads a pre-0.2.5 fim.model object", () => {
    expect(
      readModelSetting(
        config({
          model: {
            provider: "mistral",
            model: "codestral-latest",
            apiKey: "sk-legacy",
            contextLength: 4096,
            requestOptions: { verifySsl: false },
          },
        }),
      ),
    ).toEqual({
      provider: "mistral",
      model: "codestral-latest",
      apiBase: undefined,
      apiKey: "sk-legacy",
      template: undefined,
      contextLength: 4096,
      requestOptions: { verifySsl: false },
      completionOptions: undefined,
    });
  });

  it("lets a flat setting win over the legacy object, key by key", () => {
    const setting = readModelSetting(
      config({
        provider: "ollama",
        apiBase: "http://localhost:11434",
        model: { provider: "mistral", model: "codestral-latest", apiKey: "sk" },
      }),
    );
    expect(setting.provider).toBe("ollama");
    expect(setting.apiBase).toBe("http://localhost:11434");
    // Not overridden, so the legacy values still apply
    expect(setting.model).toBe("codestral-latest");
    expect(setting.apiKey).toBe("sk");
  });
});
