import * as vscode from "vscode";

import { FimCompletionProvider } from "../autocomplete/completionProvider";
import {
  StatusBarStatus,
  monitorBatteryChanges,
  setupStatusBar,
} from "../autocomplete/statusBar";
import { registerAllCommands } from "../commands";
import { FimConfig } from "../config/FimConfig";
import { migrateLegacyModelSetting } from "../config/migrateLegacyModel";
import { showTutorialOnFirstInstall } from "../tutorial";
import { Battery } from "../util/battery";
import { EXTENSION_NAME } from "../util/constants";
import { VsCodeIde } from "../VsCodeIde";

export async function activateExtension(context: vscode.ExtensionContext) {
  // Before anything reads the config: rewrites a pre-0.2.0 `fim.model` object
  // into the flat `fim.*` settings.
  await migrateLegacyModelSetting();

  const ide = new VsCodeIde(context);
  const config = new FimConfig();
  context.subscriptions.push(config);

  const enabled =
    vscode.workspace.getConfiguration(EXTENSION_NAME).get<boolean>("enabled") ??
    true;
  setupStatusBar(
    enabled ? StatusBarStatus.Enabled : StatusBarStatus.Disabled,
    false,
  );

  const battery = new Battery();
  context.subscriptions.push(battery);
  context.subscriptions.push(monitorBatteryChanges(battery));

  const provider = new FimCompletionProvider(config, ide);
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      [{ pattern: "**" }],
      provider,
    ),
  );

  registerAllCommands(context, provider, config, ide);

  // After the commands, so the "Select model" button on its prompt resolves.
  // Not awaited: nothing else should wait on an editor opening.
  void showTutorialOnFirstInstall(context, config);

  return { provider, config, ide };
}
