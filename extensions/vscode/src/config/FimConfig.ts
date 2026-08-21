import { ILLM, LLMOptions, TabAutocompleteOptions } from "core";
import { llmFromProviderAndOptions } from "core/llm/llms";
import { DEFAULT_AUTOCOMPLETE_OPTS } from "core/util/parameters";
import * as vscode from "vscode";

import { EXTENSION_NAME } from "../util/constants";

/**
 * The completion model, assembled from the `fim.*` settings. Mirrors the subset
 * of LLMOptions that makes sense to configure by hand.
 */
export interface FimModelSetting {
  provider?: string;
  model?: string;
  apiBase?: string;
  apiKey?: string;
  /** Overrides the autodetected FIM prompt template. */
  template?: string;
  contextLength?: number;
  requestOptions?: LLMOptions["requestOptions"];
  completionOptions?: LLMOptions["completionOptions"];
}

/** Trims a string setting, treating blank as unset. */
function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Treats the `{}` default of an object setting as unset. */
function nonEmptyObject<T extends object>(value: T | undefined): T | undefined {
  return value && Object.keys(value).length > 0 ? value : undefined;
}

/**
 * Reads the completion model out of the flat `fim.provider` / `fim.model` /
 * `fim.apiBase` / ... settings, so all of it is editable in the Settings UI.
 *
 * Before 0.2.5 the whole thing was one `fim.model` object. That shape is still
 * honoured as a fallback — migrateLegacyModelSetting() rewrites it on startup,
 * but a scope it skipped, or a window that has not reloaded yet, must keep
 * working. Flat keys win over it, key by key.
 */
export function readModelSetting(
  config: vscode.WorkspaceConfiguration,
): FimModelSetting {
  const raw = config.get<unknown>("model");
  const legacy: FimModelSetting =
    typeof raw === "object" && raw !== null ? (raw as FimModelSetting) : {};

  return {
    provider: text(config.get<string>("provider")) ?? text(legacy.provider),
    model:
      (typeof raw === "string" ? text(raw) : undefined) ?? text(legacy.model),
    apiBase: text(config.get<string>("apiBase")) ?? text(legacy.apiBase),
    apiKey: text(config.get<string>("apiKey")) ?? text(legacy.apiKey),
    template: text(config.get<string>("template")) ?? text(legacy.template),
    contextLength: config.get<number>("contextLength") ?? legacy.contextLength,
    requestOptions:
      nonEmptyObject(
        config.get<LLMOptions["requestOptions"]>("requestOptions"),
      ) ?? legacy.requestOptions,
    completionOptions:
      nonEmptyObject(
        config.get<LLMOptions["completionOptions"]>("completionOptions"),
      ) ?? legacy.completionOptions,
  };
}

/**
 * The config surface the completion pipeline needs. Replaces Continue's
 * ConfigHandler, which existed to serve profiles, hub assistants and the chat
 * config UI — none of which this extension has.
 */
export interface FimConfigProvider {
  getModel(): Promise<ILLM | undefined>;
  getOptions(): TabAutocompleteOptions;
}

/** Reads `fim.*` out of VS Code settings and builds the completion model. */
export class FimConfig implements FimConfigProvider {
  private cachedModel: ILLM | undefined;
  private cachedModelKey: string | undefined;

  private readonly onChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onChangeEmitter.event;

  private readonly disposable: vscode.Disposable;

  constructor() {
    this.disposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(EXTENSION_NAME)) {
        // Force the model to be rebuilt on next use
        this.cachedModel = undefined;
        this.cachedModelKey = undefined;
        this.onChangeEmitter.fire();
      }
    });
  }

  dispose() {
    this.disposable.dispose();
    this.onChangeEmitter.dispose();
  }

  private get config() {
    return vscode.workspace.getConfiguration(EXTENSION_NAME);
  }

  getOptions(): TabAutocompleteOptions {
    const c = this.config;
    // `disable` is the inverse of the user-facing `fim.enabled`, which matches
    // how the status bar and the toggle command think about it.
    const overrides: Partial<TabAutocompleteOptions> = {
      disable: c.get<boolean>("enabled") === false,
      maxPromptTokens: c.get<number>("maxPromptTokens"),
      debounceDelay: c.get<number>("debounceDelay"),
      modelTimeout: c.get<number>("modelTimeout"),
      showWhateverWeHaveAtXMs: c.get<number>("showWhateverWeHaveAtXMs"),
      multilineCompletions: c.get<
        TabAutocompleteOptions["multilineCompletions"]
      >("multilineCompletions"),
      useCache: c.get<boolean>("useCache"),
      onlyMyCode: c.get<boolean>("onlyMyCode"),
      useRecentlyEdited: c.get<boolean>("useRecentlyEdited"),
      useRecentlyOpened: c.get<boolean>("useRecentlyOpened"),
      useImports: c.get<boolean>("useImports"),
      disableInFiles: c.get<string[]>("disableInFiles"),
      transform: c.get<boolean>("transform"),
      experimental_includeClipboard: c.get<boolean>(
        "experimental.includeClipboard",
      ),
      experimental_includeRecentlyVisitedRanges: c.get<boolean>(
        "experimental.includeRecentlyVisitedRanges",
      ),
      experimental_includeRecentlyEditedRanges: c.get<boolean>(
        "experimental.includeRecentlyEditedRanges",
      ),

      experimental_enableStaticContextualization: c.get<boolean>(
        "experimental.staticContextualization",
      ),
    };

    // A setting the user has not touched comes back as undefined from
    // `get<T>()` when it has no declared default; those must not clobber the
    // defaults, so drop them before merging.
    for (const key of Object.keys(overrides)) {
      if (overrides[key as keyof TabAutocompleteOptions] === undefined) {
        delete overrides[key as keyof TabAutocompleteOptions];
      }
    }

    // `template` is only meaningful when set — an empty string means "autodetect"
    const template = this.getModelSetting().template;
    if (template) {
      overrides.template = template;
    }

    return { ...DEFAULT_AUTOCOMPLETE_OPTS, ...overrides };
  }

  private getModelSetting(): FimModelSetting {
    return readModelSetting(this.config);
  }

  async getModel(): Promise<ILLM | undefined> {
    const desc = this.getModelSetting();
    if (!desc.provider || !desc.model) {
      return undefined;
    }

    const key = JSON.stringify(desc);
    if (this.cachedModel && this.cachedModelKey === key) {
      return this.cachedModel;
    }

    const options: LLMOptions = {
      model: desc.model,
      title: `${desc.provider}/${desc.model}`,
      apiBase: desc.apiBase,
      apiKey: desc.apiKey,
      contextLength: desc.contextLength,
      requestOptions: desc.requestOptions,
      completionOptions: desc.completionOptions,
      uniqueId: "fim",
    };

    try {
      const llm = llmFromProviderAndOptions(desc.provider, options);
      this.cachedModel = llm;
      this.cachedModelKey = key;
      return llm;
    } catch (e) {
      // Unknown provider name — surface it once rather than on every keystroke
      if (this.cachedModelKey !== key) {
        this.cachedModelKey = key;
        void vscode.window.showErrorMessage(
          `Unknown "${EXTENSION_NAME}.provider": ${desc.provider}`,
        );
      }
      return undefined;
    }
  }
}
