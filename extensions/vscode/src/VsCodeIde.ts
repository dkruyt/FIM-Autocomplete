import { exec } from "node:child_process";

import { Range } from "core";
import { EXTENSION_NAME } from "./util/constants";
import * as URI from "uri-js";
import * as vscode from "vscode";

import {
  executeGotoProvider,
  executeSignatureHelpProvider,
  executeSymbolProvider,
} from "./autocomplete/lsp";
import { Repository } from "./otherExtensions/git";
import { SecretStorage } from "./stubs/SecretStorage";
import { VsCodeIdeUtils } from "./util/ideUtils";
import { getExtensionVersion, isExtensionPrerelease } from "./util/util";
import { openEditorAndRevealRange } from "./util/vscode";

import type {
  DocumentSymbol,
  FileStatsMap,
  FileType,
  IDE,
  IdeInfo,
  IndexTag,
  Location,
  Problem,
  RangeInFile,
  SignatureHelp,
  TerminalOptions,
  Thread,
} from "core";

class VsCodeIde implements IDE {
  ideUtils: VsCodeIdeUtils;
  secretStorage: SecretStorage;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.ideUtils = new VsCodeIdeUtils();
    this.secretStorage = new SecretStorage(context);
  }

  async readSecrets(keys: string[]): Promise<Record<string, string>> {
    const secretValuePromises = keys.map((key) => this.secretStorage.get(key));
    const secretValues = await Promise.all(secretValuePromises);

    return keys.reduce(
      (acc, key, index) => {
        if (secretValues[index] === undefined) {
          return acc;
        }

        acc[key] = secretValues[index];
        return acc;
      },
      {} as Record<string, string>,
    );
  }

  async writeSecrets(secrets: { [key: string]: string }): Promise<void> {
    for (const [key, value] of Object.entries(secrets)) {
      await this.secretStorage.store(key, value);
    }
  }

  async fileExists(uri: string): Promise<boolean> {
    try {
      const stat = await this.ideUtils.stat(vscode.Uri.parse(uri));
      return stat !== null;
    } catch (error) {
      if (error instanceof vscode.FileSystemError) {
        return false;
      }
      throw error;
    }
  }

  async gotoDefinition(location: Location): Promise<RangeInFile[]> {
    const result = await executeGotoProvider({
      uri: vscode.Uri.parse(location.filepath),
      line: location.position.line,
      character: location.position.character,
      name: "vscode.executeDefinitionProvider",
    });

    return result;
  }

  async gotoTypeDefinition(location: Location): Promise<RangeInFile[]> {
    const result = await executeGotoProvider({
      uri: vscode.Uri.parse(location.filepath),
      line: location.position.line,
      character: location.position.character,
      name: "vscode.executeTypeDefinitionProvider",
    });

    return result;
  }

  async getSignatureHelp(location: Location): Promise<SignatureHelp | null> {
    const result = await executeSignatureHelpProvider({
      uri: vscode.Uri.parse(location.filepath),
      line: location.position.line,
      character: location.position.character,
      name: "vscode.executeSignatureHelpProvider",
    });

    return result;
  }

  async getReferences(location: Location): Promise<RangeInFile[]> {
    const result = await executeGotoProvider({
      uri: vscode.Uri.parse(location.filepath),
      line: location.position.line,
      character: location.position.character,
      name: "vscode.executeReferenceProvider",
    });

    return result;
  }

  async getDocumentSymbols(
    textDocumentIdentifier: string, // uri
  ): Promise<DocumentSymbol[]> {
    const result = await executeSymbolProvider({
      uri: vscode.Uri.parse(textDocumentIdentifier),
      name: "vscode.executeDocumentSymbolProvider",
    });

    return result;
  }

  onDidChangeActiveTextEditor(callback: (uri: string) => void): void {
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        callback(editor.document.uri.toString());
      }
    });
  }

  showToast: IDE["showToast"] = async (...params) => {
    const [type, message, ...otherParams] = params;
    const { showErrorMessage, showWarningMessage, showInformationMessage } =
      vscode.window;

    switch (type) {
      case "error":
        return showErrorMessage(message, "Show logs").then((selection) => {
          if (selection === "Show logs") {
            vscode.commands.executeCommand("workbench.action.toggleDevTools");
          }
        });
      case "info":
        return showInformationMessage(message, ...otherParams);
      case "warning":
        return showWarningMessage(message, ...otherParams);
    }
  };

  async getRepoName(dir: string): Promise<string | undefined> {
    const repo = await this.getRepo(dir);
    const remotes = repo?.state.remotes;
    if (!remotes) {
      return undefined;
    }
    const remote =
      remotes?.find((r: any) => r.name === "origin") ?? remotes?.[0];
    if (!remote) {
      return undefined;
    }
    const ownerAndRepo = remote.fetchUrl
      ?.replace(".git", "")
      .split("/")
      .slice(-2);
    return ownerAndRepo?.join("/");
  }

  async getTags(artifactId: string): Promise<IndexTag[]> {
    const workspaceDirs = await this.getWorkspaceDirs();

    const branches = await Promise.all(
      workspaceDirs.map((dir) => this.getBranch(dir)),
    );

    const tags: IndexTag[] = workspaceDirs.map((directory, i) => ({
      directory,
      branch: branches[i],
      artifactId,
    }));

    return tags;
  }

  getIdeInfo(): Promise<IdeInfo> {
    return Promise.resolve({
      ideType: "vscode",
      name: vscode.env.appName,
      version: vscode.version,
      remoteName: vscode.env.remoteName || "local",
      extensionVersion: getExtensionVersion(),
      isPrerelease: isExtensionPrerelease(),
    });
  }

  readRangeInFile(fileUri: string, range: Range): Promise<string> {
    return this.ideUtils.readRangeInFile(
      vscode.Uri.parse(fileUri),
      new vscode.Range(
        new vscode.Position(range.start.line, range.start.character),
        new vscode.Position(range.end.line, range.end.character),
      ),
    );
  }

  async getFileStats(files: string[]): Promise<FileStatsMap> {
    const pathToLastModified: FileStatsMap = {};
    await Promise.all(
      files.map(async (file) => {
        const stat = await this.ideUtils.stat(
          vscode.Uri.parse(file),
          false /* No need to catch ENOPRO exceptions */,
        );
        pathToLastModified[file] = {
          lastModified: stat!.mtime,
          size: stat!.size,
        };
      }),
    );

    return pathToLastModified;
  }

  async getRepo(dir: string): Promise<Repository | undefined> {
    return this.ideUtils.getRepo(vscode.Uri.parse(dir));
  }

  isWorkspaceRemote(): Promise<boolean> {
    return Promise.resolve(vscode.env.remoteName !== undefined);
  }

  getUniqueId(): Promise<string> {
    return Promise.resolve(vscode.env.machineId);
  }

  async getDiff(includeUnstaged: boolean): Promise<string[]> {
    return await this.ideUtils.getDiff(includeUnstaged);
  }

  async getClipboardContent() {
    return {
      text: await vscode.env.clipboard.readText(),
      copiedAt: new Date().toISOString(),
    };
  }

  async getTerminalContents(): Promise<string> {
    return await this.ideUtils.getTerminalContents(1);
  }

  async getWorkspaceDirs(): Promise<string[]> {
    return this.ideUtils.getWorkspaceDirectories().map((uri) => uri.toString());
  }

  async writeFile(fileUri: string, contents: string): Promise<void> {
    await vscode.workspace.fs.writeFile(
      vscode.Uri.parse(fileUri),
      Buffer.from(contents),
    );
  }

  async removeFile(fileUri: string): Promise<void> {
    await vscode.workspace.fs.delete(vscode.Uri.parse(fileUri));
  }

  async openFile(fileUri: string): Promise<void> {
    await this.ideUtils.openFile(vscode.Uri.parse(fileUri));
  }

  async showLines(
    fileUri: string,
    startLine: number,
    endLine: number,
  ): Promise<void> {
    const range = new vscode.Range(
      new vscode.Position(startLine, 0),
      new vscode.Position(endLine, 0),
    );
    openEditorAndRevealRange(vscode.Uri.parse(fileUri), range).then(
      (editor) => {
        // Select the lines
        editor.selection = new vscode.Selection(
          new vscode.Position(startLine, 0),
          new vscode.Position(endLine, 0),
        );
      },
    );
  }

  async runCommand(
    command: string,
    options: TerminalOptions = { reuseTerminal: true },
  ): Promise<void> {
    let terminal: vscode.Terminal | undefined;
    if (vscode.window.terminals.length && options.reuseTerminal) {
      if (options.terminalName) {
        terminal = vscode.window.terminals.find(
          (t) => t?.name === options.terminalName,
        );
      } else {
        terminal = vscode.window.activeTerminal ?? vscode.window.terminals[0];
      }
    }

    if (!terminal) {
      terminal = vscode.window.createTerminal(options?.terminalName);
    }
    terminal.show();
    terminal.sendText(command, false);
  }

  async saveFile(fileUri: string): Promise<void> {
    await this.ideUtils.saveFile(vscode.Uri.parse(fileUri));
  }

  private static MAX_BYTES = 100000;

  async readFile(fileUri: string): Promise<string> {
    try {
      const uri = vscode.Uri.parse(fileUri);

      // First, check whether it's a notebook document
      // Need to iterate over the cells to get full contents
      const notebook =
        vscode.workspace.notebookDocuments.find((doc) =>
          URI.equal(doc.uri.toString(), uri.toString()),
        ) ??
        (uri.path.endsWith("ipynb")
          ? await vscode.workspace.openNotebookDocument(uri)
          : undefined);
      if (notebook) {
        return notebook
          .getCells()
          .map((cell) => cell.document.getText())
          .join("\n\n");
      }

      // Check whether it's an open document
      const openTextDocument = vscode.workspace.textDocuments.find((doc) =>
        URI.equal(doc.uri.toString(), uri.toString()),
      );
      if (openTextDocument !== undefined) {
        return openTextDocument.getText();
      }

      const fileStats = await this.ideUtils.stat(uri);
      if (fileStats === null || fileStats.size > 10 * VsCodeIde.MAX_BYTES) {
        return "";
      }

      const bytes = await this.ideUtils.readFile(uri);
      if (bytes === null) {
        return "";
      }

      // Truncate the buffer to the first MAX_BYTES
      const truncatedBytes = bytes.slice(0, VsCodeIde.MAX_BYTES);
      const contents = new TextDecoder().decode(truncatedBytes);
      return contents;
    } catch (e) {
      return "";
    }
  }

  async openUrl(url: string): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  async getExternalUri(uri: string): Promise<string> {
    const vsCodeUri = vscode.Uri.parse(uri);
    const externalUri = await vscode.env.asExternalUri(vsCodeUri);
    return externalUri.toString(true);
  }

  async getOpenFiles(): Promise<string[]> {
    return this.ideUtils.getOpenFiles().map((uri) => uri.toString());
  }

  async getCurrentFile() {
    if (!vscode.window.activeTextEditor) {
      return undefined;
    }
    return {
      isUntitled: vscode.window.activeTextEditor.document.isUntitled,
      path: vscode.window.activeTextEditor.document.uri.toString(),
      contents: vscode.window.activeTextEditor.document.getText(),
    };
  }

  async getPinnedFiles(): Promise<string[]> {
    const tabArray = vscode.window.tabGroups.all[0].tabs;

    return tabArray
      .filter((t) => t.isPinned)
      .map((t) => (t.input as vscode.TabInputText).uri.toString());
  }

  async getProblems(fileUri?: string | undefined): Promise<Problem[]> {
    const uri = fileUri
      ? vscode.Uri.parse(fileUri)
      : vscode.window.activeTextEditor?.document.uri;
    if (!uri) {
      return [];
    }
    return vscode.languages.getDiagnostics(uri).map((d) => {
      return {
        filepath: uri.toString(),
        range: {
          start: {
            line: d.range.start.line,
            character: d.range.start.character,
          },
          end: { line: d.range.end.line, character: d.range.end.character },
        },
        message: d.message,
      };
    });
  }

  async subprocess(command: string, cwd?: string): Promise<[string, string]> {
    return new Promise((resolve, reject) => {
      exec(command, { cwd }, (error, stdout, stderr) => {
        if (error) {
          console.warn(error);
          reject(stderr);
        }
        resolve([stdout, stderr]);
      });
    });
  }

  async getBranch(dir: string): Promise<string> {
    return this.ideUtils.getBranch(vscode.Uri.parse(dir));
  }

  async getGitRootPath(dir: string): Promise<string | undefined> {
    const root = await this.ideUtils.getGitRoot(vscode.Uri.parse(dir));
    return root?.toString();
  }

  async listDir(dir: string): Promise<[string, FileType][]> {
    const entries = await this.ideUtils.readDirectory(vscode.Uri.parse(dir));
    return entries === null ? [] : (entries as any);
  }
}

export { VsCodeIde };
