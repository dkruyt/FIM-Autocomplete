import * as fs from "fs";
import * as crypto from "crypto";
import * as path from "path";

import { getGlobalPath } from "core/util/paths";
import * as vscode from "vscode";

import { FimConfigProvider } from "./config/FimConfig";
import { EXTENSION_NAME } from "./util/constants";

const TUTORIAL_FILENAME = "tutorial.py";

/** globalState key. Set once the tutorial has been opened on this machine. */
const SHOWN_KEY = "fim.tutorialShown";
/** globalState key. Hash of the tutorial copy as we last wrote it. */
const COPY_HASH_KEY = "fim.tutorialCopyHash";

function hashFile(filepath: string): string {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filepath))
    .digest("hex");
}

/**
 * Whether the copy on disk is still exactly what we put there.
 *
 * A missing hash means the copy predates this bookkeeping, so there is no way
 * to tell whether it was edited -- and overwriting someone's notes is worse
 * than showing them a stale tutorial, so those are left alone.
 */
function isUntouchedCopy(
  destination: string,
  context: vscode.ExtensionContext,
): boolean {
  const recorded = context.globalState.get<string>(COPY_HASH_KEY);
  if (!recorded) {
    return false;
  }
  try {
    return hashFile(destination) === recorded;
  } catch {
    return false;
  }
}

/**
 * Opens the tutorial, copying it out of the bundle into the global dir.
 *
 * The copy is a scratchpad, so anything the user typed into it has to survive
 * an extension update -- but leaving it alone unconditionally meant a tutorial
 * rewritten to cover new features never reached anyone who had opened the old
 * one, which is exactly the audience it is written for. So the copy is
 * refreshed only while it is still byte-for-byte what we wrote: the moment the
 * user changes a character it is theirs, and we stop touching it.
 */
export async function openTutorial(
  context: vscode.ExtensionContext,
): Promise<void> {
  try {
    const destination = path.join(getGlobalPath(), TUTORIAL_FILENAME);
    const source = vscode.Uri.joinPath(
      context.extensionUri,
      "tutorial",
      TUTORIAL_FILENAME,
    );

    if (!fs.existsSync(destination) || isUntouchedCopy(destination, context)) {
      fs.copyFileSync(source.fsPath, destination);
      void context.globalState.update(COPY_HASH_KEY, hashFile(destination));
    }

    const doc = await vscode.workspace.openTextDocument(destination);
    await vscode.window.showTextDocument(doc, { preview: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    void vscode.window.showErrorMessage(
      `Could not open the tutorial: ${message}`,
    );
  }
}

/**
 * Opens the tutorial once, on the first activation after install. Everything
 * this extension does is invisible until a completion appears, so a new user
 * otherwise has nothing to look at and nothing to press.
 */
export async function showTutorialOnFirstInstall(
  context: vscode.ExtensionContext,
  config: FimConfigProvider,
): Promise<void> {
  if (context.globalState.get<boolean>(SHOWN_KEY)) {
    return;
  }

  // Recorded before opening, so a failure that repeats cannot mean a toast on
  // every single start. "FIM: Open Tutorial" is always there to retry.
  await context.globalState.update(SHOWN_KEY, true);
  await openTutorial(context);

  if (await config.getModel()) {
    return;
  }

  // Nothing can complete until a model is configured, which is exactly what the
  // tutorial's first section says — offer the wizard instead of making them
  // read it.
  const selectModel = "Select model";
  void vscode.window
    .showInformationMessage(
      "FIM Autocomplete needs a model before it can suggest anything.",
      selectModel,
    )
    .then((choice) => {
      if (choice === selectModel) {
        void vscode.commands.executeCommand(`${EXTENSION_NAME}.selectModel`);
      }
    });
}
