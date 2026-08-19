import { llmFromProviderAndOptions } from "core/llm/llms";
import * as vscode from "vscode";

import { EXTENSION_NAME } from "../util/constants";

import { FimModelSetting, readModelSetting } from "./FimConfig";

interface ProviderChoice {
  /** Must match a `static providerName` in core/llm/llms. */
  id: string;
  label: string;
  detail: string;
  /** Provider has a real fill-in-the-middle endpoint. */
  fim: boolean;
  /** Prompt for an API key. */
  needsApiKey: boolean;
  /**
   * Default to prefill in the apiBase prompt. Omitted means don't ask — the
   * provider's own `defaultOptions.apiBase` is correct.
   */
  apiBase?: string;
  /** Offered when the provider can't list its own models. */
  suggestedModels?: string[];
}

const LOCAL: ProviderChoice[] = [
  {
    id: "ollama",
    label: "Ollama",
    detail: "Local models. Native FIM support.",
    fim: true,
    needsApiKey: false,
    apiBase: "http://localhost:11434",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    detail: "Local models via an OpenAI-compatible server.",
    fim: false,
    needsApiKey: false,
    apiBase: "http://localhost:1234/v1",
  },
  {
    id: "vllm",
    label: "vLLM",
    detail: "Self-hosted inference server. Native FIM support.",
    fim: true,
    needsApiKey: false,
    apiBase: "http://localhost:8000/v1",
  },
  {
    id: "llama.cpp",
    label: "llama.cpp",
    detail: "Self-hosted llama.cpp server.",
    fim: false,
    needsApiKey: false,
    apiBase: "http://127.0.0.1:8080",
  },
  {
    id: "lemonade",
    label: "Lemonade",
    detail: "Local server with NPU/GPU acceleration.",
    fim: false,
    needsApiKey: false,
    apiBase: "http://localhost:8000/api/v1",
  },
];

const HOSTED: ProviderChoice[] = [
  {
    id: "mistral",
    label: "Mistral / Codestral",
    detail: "Codestral is purpose-built for FIM.",
    fim: true,
    needsApiKey: true,
    suggestedModels: ["codestral-latest", "codestral-2405"],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    detail: "deepseek-coder has native FIM support.",
    fim: true,
    needsApiKey: true,
    suggestedModels: ["deepseek-coder"],
  },
  {
    id: "inception",
    label: "Inception",
    detail: "Mercury Coder, a diffusion code model.",
    fim: true,
    needsApiKey: true,
    suggestedModels: ["mercury-coder-small"],
  },
  {
    id: "siliconflow",
    label: "SiliconFlow",
    detail: "Hosted open models with FIM support.",
    fim: true,
    needsApiKey: true,
  },
  {
    id: "moonshot",
    label: "Moonshot",
    detail: "Hosted models with FIM support.",
    fim: true,
    needsApiKey: true,
  },
  {
    id: "openai",
    label: "OpenAI / OpenAI-compatible",
    detail: "Also any gateway speaking the OpenAI API — set apiBase.",
    fim: true,
    needsApiKey: true,
    apiBase: "https://api.openai.com/v1",
  },
];

/** Model names that suggest a code model likely to do well at FIM. */
const CODE_MODEL_HINTS = [
  "coder",
  "code",
  "codestral",
  "starcoder",
  "codegemma",
  "codellama",
  "granite",
  "mercury",
  "seed-coder",
  "qwen2.5-coder",
  "deepseek-coder",
];

function looksLikeCodeModel(model: string): boolean {
  const m = model.toLowerCase();
  return CODE_MODEL_HINTS.some((h) => m.includes(h));
}

interface ProviderItem extends vscode.QuickPickItem {
  choice?: ProviderChoice;
  custom?: boolean;
}

async function pickProvider(
  current: string | undefined,
): Promise<ProviderChoice | "custom" | undefined> {
  const toItem = (c: ProviderChoice): ProviderItem => ({
    label: c.id === current ? `$(check) ${c.label}` : c.label,
    detail: c.detail,
    description: c.fim ? "FIM" : undefined,
    choice: c,
  });

  const items: ProviderItem[] = [
    {
      label: "Local",
      kind: vscode.QuickPickItemKind.Separator,
    },
    ...LOCAL.map(toItem),
    {
      label: "Hosted",
      kind: vscode.QuickPickItemKind.Separator,
    },
    ...HOSTED.map(toItem),
    { label: "", kind: vscode.QuickPickItemKind.Separator },
    {
      label: "$(pencil) Enter a provider id manually…",
      detail: "Any of the ~60 providers this extension supports.",
      custom: true,
    },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: "Autocomplete model — 1/3: provider",
    placeHolder:
      "Providers marked FIM have a native fill-in-the-middle endpoint",
    matchOnDetail: true,
  });

  if (!picked) {
    return undefined;
  }
  return picked.custom ? "custom" : picked.choice;
}

/**
 * Asks the provider what it can serve. Only some providers implement
 * listModels(); the rest return an empty array, and a few will throw if the
 * server isn't reachable.
 */
async function fetchModels(desc: FimModelSetting): Promise<string[]> {
  try {
    const llm = llmFromProviderAndOptions(desc.provider!, {
      model: desc.model ?? "placeholder",
      apiBase: desc.apiBase,
      apiKey: desc.apiKey,
      uniqueId: "fim-model-picker",
    });
    return await llm.listModels();
  } catch {
    return [];
  }
}

async function pickModel(
  desc: FimModelSetting,
  choice: ProviderChoice | undefined,
): Promise<string | undefined> {
  const available = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Asking ${desc.provider} which models are available…`,
    },
    () => fetchModels(desc),
  );

  const names = available.length ? available : (choice?.suggestedModels ?? []);

  if (names.length) {
    const items: (vscode.QuickPickItem & { manual?: boolean })[] = [
      ...names.map((n) => ({
        label: n,
        description: looksLikeCodeModel(n) ? "code model" : undefined,
      })),
      { label: "", kind: vscode.QuickPickItemKind.Separator },
      { label: "$(pencil) Enter a model name manually…", manual: true },
    ];

    const picked = await vscode.window.showQuickPick(items, {
      title: "Autocomplete model — 3/3: model",
      placeHolder: available.length
        ? "Models reported by the provider"
        : "Suggested models for this provider",
    });
    if (!picked) {
      return undefined;
    }
    if (!picked.manual) {
      return picked.label;
    }
  }

  return vscode.window.showInputBox({
    title: "Autocomplete model — 3/3: model",
    prompt: names.length
      ? "Model name"
      : `Could not list models for "${desc.provider}". Enter the model name as the provider expects it.`,
    value: desc.model ?? choice?.suggestedModels?.[0],
    placeHolder: "e.g. qwen2.5-coder:1.5b",
    ignoreFocusOut: true,
    validateInput: (v) => (v.trim() ? undefined : "Model name is required"),
  });
}

/**
 * Writes the wizard's answers to the flat `fim.*` settings. Anything it did not
 * collect is cleared rather than left behind — an apiKey belonging to the
 * previous provider is worse than no key at all. The settings the wizard never
 * asks about (template, contextLength, requestOptions, completionOptions) are
 * separate keys now, so they survive untouched.
 */
async function writeModelSettings(
  config: vscode.WorkspaceConfiguration,
  desc: FimModelSetting,
): Promise<void> {
  for (const key of ["provider", "model", "apiBase", "apiKey"] as const) {
    await config.update(key, desc[key], vscode.ConfigurationTarget.Global);
  }
}

/**
 * Guided setup for the `fim.*` model settings. Native QuickPicks only — this
 * extension has no webview.
 */
export async function selectModel(): Promise<void> {
  const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
  const current = readModelSetting(config);

  const providerPick = await pickProvider(current.provider);
  if (!providerPick) {
    return;
  }

  let choice: ProviderChoice | undefined;
  let providerId: string;

  if (providerPick === "custom") {
    const entered = await vscode.window.showInputBox({
      title: "Autocomplete model — 1/3: provider",
      prompt: "Provider id",
      value: current.provider,
      placeHolder: "e.g. openrouter, groq, together, azure, vertexai",
      ignoreFocusOut: true,
      validateInput: (v) => (v.trim() ? undefined : "Provider id is required"),
    });
    if (!entered) {
      return;
    }
    providerId = entered.trim();
  } else {
    choice = providerPick;
    providerId = choice.id;
  }

  const desc: FimModelSetting = { provider: providerId };

  // Step 2: connection details. Only asked when the port/host actually varies
  // or the provider needs a key — otherwise the provider's own default applies.
  const askApiBase = choice ? choice.apiBase !== undefined : true;
  if (askApiBase) {
    const apiBase = await vscode.window.showInputBox({
      title: "Autocomplete model — 2/3: API base URL",
      prompt: "Leave blank to use the provider's default",
      value: current.provider === providerId ? current.apiBase : undefined,
      placeHolder: choice?.apiBase ?? "https://…",
      ignoreFocusOut: true,
    });
    if (apiBase === undefined) {
      return;
    }
    if (apiBase.trim()) {
      desc.apiBase = apiBase.trim();
    } else if (choice?.apiBase) {
      desc.apiBase = choice.apiBase;
    }
  }

  if (choice?.needsApiKey ?? true) {
    const apiKey = await vscode.window.showInputBox({
      title: "Autocomplete model — 2/3: API key",
      prompt: "Leave blank if this provider doesn't need one",
      value: current.provider === providerId ? current.apiKey : undefined,
      password: true,
      ignoreFocusOut: true,
    });
    if (apiKey === undefined) {
      return;
    }
    if (apiKey.trim()) {
      desc.apiKey = apiKey.trim();
    }
  }

  const model = await pickModel({ ...desc, model: current.model }, choice);
  if (!model) {
    return;
  }
  desc.model = model.trim();

  await writeModelSettings(config, desc);
  await config.update("enabled", true, vscode.ConfigurationTarget.Global);

  if (looksLikeCodeModel(desc.model)) {
    void vscode.window.showInformationMessage(
      `Autocomplete is using ${desc.provider}/${desc.model}.`,
    );
    return;
  }

  // Worth flagging: a general chat model usually produces nothing useful here,
  // because the autodetected prompt uses raw FIM sentinel tokens it has never
  // been trained on.
  void vscode.window
    .showWarningMessage(
      `"${desc.model}" doesn't look like a code model. Autocomplete works best with a fill-in-the-middle model such as qwen2.5-coder, codestral or deepseek-coder.`,
      "Keep it",
      "Pick another",
    )
    .then((selection) => {
      if (selection === "Pick another") {
        void selectModel();
      }
    });
}
