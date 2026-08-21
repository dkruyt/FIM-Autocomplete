import { ILLM, ModelInstaller } from "core";
import { CompletionProvider } from "core/autocomplete/CompletionProvider";
import { isModelInstaller } from "core/llm";
import { startLocalLemonade } from "core/util/lemonadeHelper";
import { startLocalOllama } from "core/util/ollamaHelper";
import * as vscode from "vscode";

import { FimCompletionProvider } from "./autocomplete/completionProvider";
import {
  StatusBarStatus,
  getStatusBarStatus,
  getStatusBarStatusFromQuickPickItemLabel,
  quickPickStatusText,
  setupStatusBar,
} from "./autocomplete/statusBar";
import { FimConfig } from "./config/FimConfig";
import { selectModel } from "./config/modelQuickPick";
import { openTutorial } from "./tutorial";
import { EXTENSION_NAME } from "./util/constants";
import { VsCodeIde } from "./VsCodeIde";

const ns = (name: string) => `${EXTENSION_NAME}.${name}`;

async function installModelWithProgress(
  modelName: string,
  modelInstaller: ModelInstaller,
) {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Installing model '${modelName}'`,
      cancellable: true,
    },
    async (windowProgress, token) => {
      let currentProgress: number = 0;
      const progressWrapper = (
        details: string,
        worked?: number,
        total?: number,
      ) => {
        let increment = 0;
        if (worked && total) {
          const progressValue = Math.round((worked / total) * 100);
          increment = progressValue - currentProgress;
          currentProgress = progressValue;
        }
        windowProgress.report({ message: details, increment });
      };
      const abortController = new AbortController();
      token.onCancellationRequested(() => {
        console.log(`Pulling ${modelName} model was cancelled`);
        abortController.abort();
      });
      await modelInstaller.installModel(
        modelName,
        abortController.signal,
        progressWrapper,
      );
    },
  );
}

export function registerAllCommands(
  context: vscode.ExtensionContext,
  provider: FimCompletionProvider,
  config: FimConfig,
  ide: VsCodeIde,
) {
  const commands: Record<string, (...args: any[]) => any> = {
    [ns("toggleEnabled")]: () => {
      const c = vscode.workspace.getConfiguration(EXTENSION_NAME);
      const enabled = c.get<boolean>("enabled");
      void c.update("enabled", !enabled, vscode.ConfigurationTarget.Global);
      setupStatusBar(
        enabled ? StatusBarStatus.Disabled : StatusBarStatus.Enabled,
      );
    },

    [ns("forceAutocomplete")]: async () => {
      // Cancel whatever is in flight, then ask VS Code to re-request. The
      // re-request arrives with triggerKind === Invoke, which skips the
      // debounce. The prefilters and the cache still apply.
      provider.cancel();
      await vscode.commands.executeCommand(
        "editor.action.inlineSuggest.trigger",
      );
    },

    // These shadow the built-in partial-accept commands so we can observe them.
    // The built-in still does the editing; we only add bookkeeping, and it runs
    // in a `finally` so a failure here can never swallow the keystroke.
    [ns("acceptNextWord")]: async () => {
      try {
        provider.partialAccept();
      } finally {
        await vscode.commands.executeCommand(
          "editor.action.inlineSuggest.acceptNextWord",
        );
      }
    },

    [ns("acceptNextLine")]: async () => {
      try {
        provider.partialAccept();
      } finally {
        await vscode.commands.executeCommand(
          "editor.action.inlineSuggest.acceptNextLine",
        );
      }
    },

    // Fired by the InlineCompletionItem's command when the user accepts.
    [ns("logAutocompleteOutcome")]: (
      completionId: string,
      completionProvider: CompletionProvider,
    ) => {
      completionProvider.accept(completionId);
    },

    [ns("showLogs")]: () => provider.logger.show(),

    [ns("showStats")]: () =>
      provider.logger.showStats(provider.stats.summarize()),

    [ns("selectModel")]: () => selectModel(),

    [ns("openTutorial")]: () => openTutorial(context),

    [ns("openConfigMenu")]: async () => {
      const quickPick = vscode.window.createQuickPick();

      const model = await config.getModel();
      const autocompleteStatus = getStatusBarStatus();

      const modelLabel = "$(server) Select model…";
      const settingsLabel = "$(gear) Open settings";
      const tutorialLabel = "$(book) Open tutorial";
      quickPick.items = [
        {
          label: modelLabel,
          detail: model
            ? `Current: ${model.providerName}/${model.model}`
            : "No model configured yet",
        },
        {
          label: quickPickStatusText(
            autocompleteStatus === StatusBarStatus.Enabled
              ? StatusBarStatus.Disabled
              : StatusBarStatus.Enabled,
          ),
        },
        { label: "", kind: vscode.QuickPickItemKind.Separator },
        {
          label: tutorialLabel,
          detail: "A file to try autocomplete in",
        },
        {
          label: settingsLabel,
          detail: "All autocomplete options",
        },
      ];
      quickPick.title = "Autocomplete";

      quickPick.onDidAccept(() => {
        const label = quickPick.selectedItems[0]?.label;
        quickPick.dispose();

        if (label === modelLabel) {
          void selectModel();
          return;
        }

        if (label === tutorialLabel) {
          void openTutorial(context);
          return;
        }

        if (label === settingsLabel) {
          void vscode.commands.executeCommand(
            "workbench.action.openSettings",
            EXTENSION_NAME,
          );
          return;
        }

        const newStatus = getStatusBarStatusFromQuickPickItemLabel(label);
        if (newStatus === undefined) {
          return;
        }

        void vscode.workspace
          .getConfiguration(EXTENSION_NAME)
          .update(
            "enabled",
            newStatus === StatusBarStatus.Enabled,
            vscode.ConfigurationTarget.Global,
          );
        setupStatusBar(newStatus);
      });

      quickPick.onDidHide(() => quickPick.dispose());
      quickPick.show();
    },

    // The three below are offered as buttons on LLM error toasts
    // (see util/errorHandling.ts) when a local server isn't up.
    [ns("startLocalOllama")]: () => startLocalOllama(ide),

    [ns("startLocalLemonade")]: () => startLocalLemonade(ide),

    [ns("installModel")]: async (
      modelName: string,
      llmProvider: ILLM | undefined,
    ) => {
      try {
        if (!isModelInstaller(llmProvider)) {
          const msg = llmProvider
            ? `LLM provider '${llmProvider.providerName}' does not support installing models`
            : "Missing LLM Provider";
          throw new Error(msg);
        }
        await installModelWithProgress(modelName, llmProvider);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        void vscode.window.showErrorMessage(
          `Failed to install '${modelName}': ${message}`,
        );
      }
    },
  };

  for (const [name, handler] of Object.entries(commands)) {
    context.subscriptions.push(
      vscode.commands.registerCommand(name, handler as any),
    );
  }
}
