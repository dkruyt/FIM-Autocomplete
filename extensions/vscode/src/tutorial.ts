import * as fs from "fs";
import * as path from "path";

import { getGlobalPath } from "core/util/paths";
import * as vscode from "vscode";

import { FimConfigProvider } from "./config/FimConfig";
import { EXTENSION_NAME } from "./util/constants";

const TUTORIAL_FILENAME = "tutorial.py";

/** globalState key. Set once the tutorial has been opened on this machine. */
const SHOWN_KEY = "fim.tutorialShown";

/**
 * Opens the tutorial, copying it out of the bundle into the global dir the
 * first time. The copy is never overwritten: it is a scratchpad, so whatever
 * the user typed in it has to survive an extension update.
 */
export async function openTutorial(
  context: vscode.ExtensionContext,
): Promise<void> {
  try {
    const destination = path.join(getGlobalPath(), TUTORIAL_FILENAME);

    if (!fs.existsSync(destination)) {
      const source = vscode.Uri.joinPath(
        context.extensionUri,
        "tutorial",
        TUTORIAL_FILENAME,
      );
      fs.copyFileSync(source.fsPath, destination);
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
