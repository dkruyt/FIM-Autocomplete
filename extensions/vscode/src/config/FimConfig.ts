import { ILLM, LLMOptions, TabAutocompleteOptions } from "core";
import { llmFromProviderAndOptions } from "core/llm/llms";
import { DEFAULT_AUTOCOMPLETE_OPTS } from "core/util/parameters";
import * as vscode from "vscode";

import { EXTENSION_NAME } from "../util/constants";

/**
 * Shape of the `fim.model` setting. Mirrors the subset of LLMOptions that makes
 * sense to configure by hand for a completion model.
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
      // No experimental.includeDiff: the diff snippet source is disabled in
      // core/autocomplete/snippets/getAllSnippets.ts, so the setting would do
      // nothing. Don't advertise a switch that isn't wired to anything.
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
    return this.config.get<FimModelSetting>("model") ?? {};
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
          `Unknown "${EXTENSION_NAME}.model.provider": ${desc.provider}`,
        );
      }
      return undefined;
    }
  }
}
