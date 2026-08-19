import * as vscode from "vscode";

import { EXTENSION_NAME } from "../util/constants";

import { FimModelSetting } from "./FimConfig";

/**
 * Fields of the pre-0.2.0 `fim.model` object that each become their own
 * setting. `model` is handled separately — it keeps the same key, so it has to
 * be written last.
 */
const FIELDS = [
  "provider",
  "apiBase",
  "apiKey",
  "template",
  "contextLength",
  "requestOptions",
  "completionOptions",
] as const;

type Scope = [
  legacy: unknown,
  provider: string | undefined,
  target: vscode.ConfigurationTarget,
];

/**
 * Until 0.2.0 the whole completion model was one `fim.model` object, which the
 * Settings UI refuses to render. Rewrite it into the flat `fim.*` keys, in
 * whichever scopes the user set it.
 *
 * Runs on activation, before anything reads the config. Idempotent: once the
 * object is gone there is nothing left to match.
 */
export async function migrateLegacyModelSetting(): Promise<void> {
  const config = vscode.workspace.getConfiguration(EXTENSION_NAME);

  // inspect() rather than get(): `fim.model` is declared a string now, and what
  // we are looking for is the raw object still sitting in settings.json.
  const model = config.inspect<unknown>("model");
  const provider = config.inspect<string>("provider");

  const scopes: Scope[] = [
    [
      model?.globalValue,
      provider?.globalValue,
      vscode.ConfigurationTarget.Global,
    ],
    [
      model?.workspaceValue,
      provider?.workspaceValue,
      vscode.ConfigurationTarget.Workspace,
    ],
    [
      model?.workspaceFolderValue,
      provider?.workspaceFolderValue,
      vscode.ConfigurationTarget.WorkspaceFolder,
    ],
  ];

  let migrated = false;

  for (const [raw, providerValue, target] of scopes) {
    if (typeof raw !== "object" || raw === null) {
      continue;
    }

    // Flat settings already exist at this scope, so the object is leftovers the
    // user has since moved past. Reading still falls back to it (see
    // readModelSetting), so leave it rather than overwrite a newer choice.
    if (providerValue) {
      continue;
    }

    const legacy = raw as FimModelSetting;

    try {
      for (const field of FIELDS) {
        const value = legacy[field];
        if (value !== undefined) {
          await config.update(field, value, target);
        }
      }
      // Last: this replaces the object itself, so a failure part-way through
      // leaves it in place to be retried on the next activation.
      await config.update("model", legacy.model, target);
      migrated = true;
    } catch (e) {
      console.error(`Could not migrate "${EXTENSION_NAME}.model"`, e);
    }
  }

  if (!migrated) {
    return;
  }

  // Not awaited: activation should not wait on the user dismissing a toast.
  const openSettings = "Open Settings";
  void vscode.window
    .showInformationMessage(
      `"${EXTENSION_NAME}.model" is now one setting per field — ${EXTENSION_NAME}.provider, ${EXTENSION_NAME}.model, ${EXTENSION_NAME}.apiBase and ${EXTENSION_NAME}.apiKey — so they can be edited in the Settings UI. Your model was moved across.`,
      openSettings,
    )
    .then((choice) => {
      if (choice === openSettings) {
        void vscode.commands.executeCommand(
          "workbench.action.openSettings",
          EXTENSION_NAME,
        );
      }
    });
}
