import * as vscode from "vscode";

import { FimCompletionProvider } from "../autocomplete/completionProvider";
import {
  StatusBarStatus,
  monitorBatteryChanges,
  setupStatusBar,
} from "../autocomplete/statusBar";
import { registerAllCommands } from "../commands";
import { FimConfig } from "../config/FimConfig";
import { Battery } from "../util/battery";
import { EXTENSION_NAME } from "../util/constants";
import { VsCodeIde } from "../VsCodeIde";

export async function activateExtension(context: vscode.ExtensionContext) {
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

  return { provider, config, ide };
}
