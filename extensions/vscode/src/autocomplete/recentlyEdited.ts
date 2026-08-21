import { RangeInFileWithContents } from "core";
import { getSymbolsForSnippet } from "core/autocomplete/context/ranking";
import { RecentlyEditedRange } from "core/autocomplete/util/types";
import { isSecurityConcern } from "core/indexing/ignore";
import * as vscode from "vscode";

import { VsCodeIdeUtils } from "../util/ideUtils";

type VsCodeRecentlyEditedRange = {
  uri: vscode.Uri;
  range: vscode.Range;
} & Omit<RecentlyEditedRange, "filepath" | "range">;

interface VsCodeRecentlyEditedDocument {
  timestamp: number;
  uri: vscode.Uri;
}

export class RecentlyEditedTracker {
  private static staleTime = 1000 * 60 * 2;
  private static maxRecentlyEditedRanges = 3;
  private recentlyEditedRanges: VsCodeRecentlyEditedRange[] = [];

  private recentlyEditedDocuments: VsCodeRecentlyEditedDocument[] = [];
  private static maxRecentlyEditedDocuments = 10;

  private disposables: vscode.Disposable[] = [];

  /**
   * `insertRange` reads and rewrites `recentlyEditedRanges`, so concurrent calls
   * would interleave and lose entries. A single edit can carry many content
   * changes, so serialize them all onto one tail promise.
   */
  private queue: Promise<void> = Promise.resolve();

  constructor(private ideUtils: VsCodeIdeUtils) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.scheme !== "file") {
          return;
        }
        // Edited content is fed straight into the completion prompt, so apply
        // the same exclusion the other context sources use.
        if (isSecurityConcern(event.document.uri.fsPath)) {
          return;
        }
        if (event.contentChanges.length === 0) {
          return;
        }

        for (const change of event.contentChanges) {
          const editedRange = {
            uri: event.document.uri,
            range: new vscode.Range(
              new vscode.Position(change.range.start.line, 0),
              new vscode.Position(change.range.end.line + 1, 0),
            ),
            timestamp: Date.now(),
          };
          this.queue = this.queue.then(() =>
            this.insertRange(editedRange).catch((e) =>
              console.error("Failed to track recently edited range:", e),
            ),
          );
        }
        this.insertDocument(event.document.uri);
      }),
    );

    const interval = setInterval(() => {
      this.removeOldEntries();
    }, 1000 * 15);
    this.disposables.push(new vscode.Disposable(() => clearInterval(interval)));
  }

  public dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }

  private async insertRange(
    editedRange: Omit<VsCodeRecentlyEditedRange, "lines" | "symbols">,
  ): Promise<void> {
    if (editedRange.uri.scheme !== "file") {
      return;
    }

    // Check for overlap with any existing ranges
    for (let i = 0; i < this.recentlyEditedRanges.length; i++) {
      let range = this.recentlyEditedRanges[i];
      if (range.range.intersection(editedRange.range)) {
        const union = range.range.union(editedRange.range);
        const contents = await this._getContentsForRange({
          ...range,
          range: union,
        });
        range = {
          ...range,
          range: union,
          lines: contents.split("\n"),
          symbols: getSymbolsForSnippet(contents),
        };
        this.recentlyEditedRanges[i] = range;
        return;
      }
    }

    // Otherwise, just add the new and maintain max size
    const contents = await this._getContentsForRange(editedRange);
    const newLength = this.recentlyEditedRanges.unshift({
      ...editedRange,
      lines: contents.split("\n"),
      symbols: getSymbolsForSnippet(contents),
    });
    if (newLength >= RecentlyEditedTracker.maxRecentlyEditedRanges) {
      this.recentlyEditedRanges = this.recentlyEditedRanges.slice(
        0,
        RecentlyEditedTracker.maxRecentlyEditedRanges,
      );
    }
  }

  private insertDocument(uri: vscode.Uri): void {
    // Don't add a duplicate. Compare by string -- vscode.Uri instances are
    // recreated per event, so reference equality never holds here.
    const key = uri.toString();
    if (
      this.recentlyEditedDocuments.some((doc) => doc.uri.toString() === key)
    ) {
      return;
    }

    const newLength = this.recentlyEditedDocuments.unshift({
      uri,
      timestamp: Date.now(),
    });
    if (newLength >= RecentlyEditedTracker.maxRecentlyEditedDocuments) {
      this.recentlyEditedDocuments = this.recentlyEditedDocuments.slice(
        0,
        RecentlyEditedTracker.maxRecentlyEditedDocuments,
      );
    }
  }

  private removeOldEntries() {
    this.recentlyEditedRanges = this.recentlyEditedRanges.filter(
      (entry) => entry.timestamp > Date.now() - RecentlyEditedTracker.staleTime,
    );
  }

  private async _getContentsForRange(
    entry: Omit<VsCodeRecentlyEditedRange, "lines" | "symbols">,
  ): Promise<string> {
    const content = await this.ideUtils.readFile(entry.uri);
    if (content === null) {
      return "";
    }
    return content
      .toString()
      .split("\n")
      .slice(entry.range.start.line, entry.range.end.line + 1)
      .join("\n");
  }

  public async getRecentlyEditedRanges(): Promise<RecentlyEditedRange[]> {
    return this.recentlyEditedRanges.map((entry) => {
      return {
        ...entry,
        filepath: entry.uri.toString(),
      };
    });
  }

  public async getRecentlyEditedDocuments(): Promise<
    RangeInFileWithContents[]
  > {
    const results = await Promise.all(
      this.recentlyEditedDocuments.map(async (entry) => {
        try {
          const contents = await vscode.workspace.fs
            .readFile(entry.uri)
            .then((content) => content.toString());
          const lines = contents.split("\n");

          return {
            filepath: entry.uri.toString(),
            contents,
            range: {
              start: { line: 0, character: 0 },
              end: {
                line: lines.length - 1,
                character: lines[lines.length - 1].length,
              },
            },
          };
        } catch (e) {
          return null;
        }
      }),
    );

    return results.filter((result) => result !== null) as any;
  }
}
