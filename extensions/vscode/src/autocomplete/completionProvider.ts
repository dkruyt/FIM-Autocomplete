import { CompletionProvider } from "core/autocomplete/CompletionProvider";
import { processSingleLineCompletion } from "core/autocomplete/util/processSingleLineCompletion";
import {
  type AutocompleteInput,
  type AutocompleteOutcome,
} from "core/autocomplete/util/types";
import * as URI from "uri-js";
import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";

import { FimConfigProvider } from "../config/FimConfig";
import { EXTENSION_NAME } from "../util/constants";
import { handleLLMError } from "../util/errorHandling";
import { VsCodeIde } from "../VsCodeIde";

import { AutocompleteLogger } from "./logger";
import { getDefinitionsFromLsp } from "./lsp";
import { OpenedFilesTracker } from "./openedFiles";
import { RecentlyEditedTracker } from "./recentlyEdited";
import { RecentlyVisitedRangesService } from "./RecentlyVisitedRangesService";
import {
  StatusBarStatus,
  getStatusBarStatus,
  setupStatusBar,
  stopStatusBarLoading,
} from "./statusBar";

export class FimCompletionProvider
  implements vscode.InlineCompletionItemProvider
{
  private async onError(e: unknown) {
    if (await handleLLMError(e)) {
      return;
    }
    let message = "Autocomplete Error";
    if (e instanceof Error) {
      message += `: ${e.message}`;
    }
    void vscode.window.showErrorMessage(message);
  }

  private completionProvider: CompletionProvider;

  public recentlyVisitedRanges: RecentlyVisitedRangesService;
  public recentlyEditedTracker: RecentlyEditedTracker;
  public openedFilesTracker: OpenedFilesTracker;
  public logger = new AutocompleteLogger();

  constructor(
    private readonly config: FimConfigProvider,
    private readonly ide: VsCodeIde,
  ) {
    this.recentlyEditedTracker = new RecentlyEditedTracker(ide.ideUtils);

    this.completionProvider = new CompletionProvider(
      this.config,
      this.ide,
      () => this.config.getModel(),
      this.onError.bind(this),
      getDefinitionsFromLsp,
    );

    this.recentlyVisitedRanges = new RecentlyVisitedRangesService(ide);
    this.openedFilesTracker = new OpenedFilesTracker();
  }

  public dispose() {
    this.recentlyEditedTracker.dispose();
    this.recentlyVisitedRanges.dispose();
    this.openedFilesTracker.dispose();
    this.logger.dispose();
    void this.completionProvider.dispose();
  }

  _lastShownCompletion: AutocompleteOutcome | undefined;

  /** Exposed so the accept-logging command can mark the completion accepted. */
  /** Local-only tally of how completions have fared this session. */
  public get stats() {
    return this.completionProvider.stats;
  }

  public accept(completionId: string) {
    this.completionProvider.accept(completionId);
  }

  public cancel() {
    this.completionProvider.cancel();
  }

  /**
   * The user took the next word/line of the suggestion. VS Code handles the
   * edit itself; we only need the bookkeeping so it isn't later recorded as a
   * rejection.
   */
  public partialAccept() {
    const completionId = this._lastShownCompletion?.completionId;
    if (completionId) {
      this.completionProvider.partialAccept(completionId);
    }
  }

  public async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | null | undefined> {
    const enabled = getStatusBarStatus() === StatusBarStatus.Enabled;
    if (token.isCancellationRequested || !enabled) {
      return null;
    }

    if (document.uri.scheme === "vscode-scm") {
      return null;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }
    // Don't autocomplete with multi-cursor
    if (editor.selections.length > 1) {
      return null;
    }

    const selectedCompletionInfo = context.selectedCompletionInfo;

    // If the built-in suggest widget has a selection, our completion has to
    // extend it and use the same range, otherwise VS Code won't preview it. Only
    // bother once the user has typed enough for the selection to be meaningful.
    if (selectedCompletionInfo) {
      const { text, range } = selectedCompletionInfo;
      const typedText = document.getText(range);
      const typedLength = range.end.character - range.start.character;

      if (typedLength < 4) {
        return null;
      }

      if (!text.startsWith(typedText)) {
        return null;
      }
    }

    try {
      const abortController = new AbortController();
      const signal = abortController.signal;
      const completionId = uuidv4();

      token.onCancellationRequested(() => abortController.abort());

      // Handle notebook cells: the model needs the whole notebook as one file,
      // and the cursor line has to be offset by the preceding cells.
      const pos = {
        line: position.line,
        character: position.character,
      };

      let manuallyPassFileContents: string | undefined = undefined;
      if (document.uri.scheme === "vscode-notebook-cell") {
        const notebook = vscode.workspace.notebookDocuments.find((notebook) =>
          notebook
            .getCells()
            .some((cell) =>
              URI.equal(cell.document.uri.toString(), document.uri.toString()),
            ),
        );
        if (notebook) {
          const cells = notebook.getCells();
          manuallyPassFileContents = cells
            .map((cell) => {
              const text = cell.document.getText();
              if (cell.kind === vscode.NotebookCellKind.Markup) {
                return `"""${text}"""`;
              } else {
                return text;
              }
            })
            .join("\n\n");
          for (const cell of cells) {
            if (
              URI.equal(cell.document.uri.toString(), document.uri.toString())
            ) {
              break;
            } else {
              pos.line += cell.document.getText().split("\n").length + 1;
            }
          }
        }
      }

      // Manually pass file contents for unsaved, untitled files
      if (document.isUntitled) {
        manuallyPassFileContents = document.getText();
      }

      const wasManuallyTriggered =
        context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke;

      const input: AutocompleteInput = {
        pos,
        filepath: document.uri.toString(),
        completionId,
        manuallyPassFileContents,
        manuallyPassPrefix: undefined,
        selectedCompletionInfo,
        isUntitledFile: document.isUntitled,
        recentlyVisitedRanges: this.recentlyVisitedRanges.getSnippets(),
        recentlyEditedRanges:
          await this.recentlyEditedTracker.getRecentlyEditedRanges(),
      };

      setupStatusBar(undefined, true);

      const outcome =
        await this.completionProvider.provideInlineCompletionItems(
          input,
          signal,
          wasManuallyTriggered,
        );

      if (!outcome || !outcome.completion) {
        return null;
      }

      // Inline completions must extend the selected suggest-widget item
      if (selectedCompletionInfo) {
        outcome.completion = selectedCompletionInfo.text + outcome.completion;
      }

      if (!this.willDisplay(selectedCompletionInfo, signal, outcome)) {
        return null;
      }

      // Marking the outcome as displayed is what lets `accept(completionId)`
      // find it later.
      this.completionProvider.markDisplayed(completionId, outcome);
      this._lastShownCompletion = outcome;
      this.logger.logOutcome(outcome);

      // Construct the range/text to show
      const startPos = selectedCompletionInfo?.range.start ?? position;
      let range = new vscode.Range(startPos, startPos);
      let completionText = outcome.completion;

      const isSingleLineCompletion = outcome.completion.split("\n").length <= 1;

      if (isSingleLineCompletion) {
        const lastLineOfCompletionText = completionText.split("\n").pop() || "";
        const currentText = document
          .lineAt(startPos)
          .text.substring(startPos.character);

        const result = processSingleLineCompletion(
          lastLineOfCompletionText,
          currentText,
          startPos.character,
        );

        if (result === undefined) {
          return undefined;
        }

        completionText = result.completionText;
        if (result.range) {
          range = new vscode.Range(
            new vscode.Position(startPos.line, result.range.start),
            new vscode.Position(startPos.line, result.range.end),
          );
        }
      } else {
        // Extend the range to the end of the line for multiline completions
        range = new vscode.Range(startPos, document.lineAt(startPos).range.end);
      }

      const completionItem = new vscode.InlineCompletionItem(
        completionText,
        range,
        {
          title: "Log Autocomplete Outcome",
          command: `${EXTENSION_NAME}.logAutocompleteOutcome`,
          arguments: [completionId, this.completionProvider],
        },
      );

      (completionItem as any).completeBracketPairs = true;

      return [completionItem];
    } finally {
      stopStatusBarLoading();
    }
  }

  willDisplay(
    selectedCompletionInfo: vscode.SelectedCompletionInfo | undefined,
    abortSignal: AbortSignal,
    outcome: AutocompleteOutcome,
  ): boolean {
    if (selectedCompletionInfo) {
      const { text } = selectedCompletionInfo;
      if (!outcome.completion.startsWith(text)) {
        return false;
      }
    }

    if (abortSignal.aborted) {
      return false;
    }

    return true;
  }
}
