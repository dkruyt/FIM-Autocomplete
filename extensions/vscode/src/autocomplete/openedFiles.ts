import { openedFilesLruCache } from "core/autocomplete/util/openedFilesLruCache";
import { isSecurityConcern } from "core/indexing/ignore";
import * as vscode from "vscode";

function isTrackable(uri: vscode.Uri): boolean {
  return uri.scheme === "file" && !isSecurityConcern(uri.fsPath);
}

/**
 * Keeps {@link openedFilesLruCache} in sync with the editor, in viewing order.
 *
 * Upstream Continue did this from `core/core.ts`, which does not exist in this
 * fork -- so nothing populated the cache and the recently-opened-files context
 * source silently returned nothing on every completion.
 */
export class OpenedFilesTracker {
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.seedFromOpenTabs();

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.touch(editor.document.uri);
        }
      }),
      // A closed file is no longer context the user is working in, and reading
      // it back would keep it in the prompt indefinitely.
      vscode.workspace.onDidCloseTextDocument((document) => {
        openedFilesLruCache.delete(document.uri.toString());
      }),
    );
  }

  /**
   * Populate from the tabs that are already open, so the first completion after
   * a window reload has context rather than waiting for an editor switch.
   */
  private seedFromOpenTabs() {
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input = tab.input;
        if (input instanceof vscode.TabInputText) {
          this.touch(input.uri);
        }
      }
    }
    // The active editor is the most recent of all of them.
    const active = vscode.window.activeTextEditor;
    if (active) {
      this.touch(active.document.uri);
    }
  }

  private touch(uri: vscode.Uri) {
    if (!isTrackable(uri)) {
      return;
    }
    const key = uri.toString();
    // QuickLRU only promotes on `get`; re-`set`ting an existing key leaves it
    // where it was. Delete first so recency order is actually viewing order,
    // which is what `formatOpenedFilesContext` scores against.
    openedFilesLruCache.delete(key);
    openedFilesLruCache.set(key, key);
  }

  public dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
