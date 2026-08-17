import * as vscode from "vscode";

import { Battery } from "../util/battery";
import { EXTENSION_NAME } from "../util/constants";

export enum StatusBarStatus {
  Disabled,
  Enabled,
  Paused,
}

export const quickPickStatusText = (status: StatusBarStatus | undefined) => {
  switch (status) {
    case undefined:
    case StatusBarStatus.Disabled:
      return "$(circle-slash) Disable autocomplete";
    case StatusBarStatus.Enabled:
      return "$(check) Enable autocomplete";
    case StatusBarStatus.Paused:
      return "$(debug-pause) Pause autocomplete";
  }
};

export const getStatusBarStatusFromQuickPickItemLabel = (
  label: string,
): StatusBarStatus | undefined => {
  switch (label) {
    case "$(circle-slash) Disable autocomplete":
      return StatusBarStatus.Disabled;
    case "$(check) Enable autocomplete":
      return StatusBarStatus.Enabled;
    case "$(debug-pause) Pause autocomplete":
      return StatusBarStatus.Paused;
    default:
      return undefined;
  }
};

const LABEL = "FIM";

const statusBarItemText = (
  status: StatusBarStatus | undefined,
  loading?: boolean,
) => {
  switch (status) {
    case undefined:
      return loading ? `$(loading~spin) ${LABEL}` : LABEL;
    case StatusBarStatus.Disabled:
      return `$(circle-slash) ${LABEL}`;
    case StatusBarStatus.Enabled:
      return `$(check) ${LABEL}`;
    case StatusBarStatus.Paused:
      return `$(debug-pause) ${LABEL}`;
    default:
      return LABEL;
  }
};

const statusBarItemTooltip = (status: StatusBarStatus | undefined) => {
  switch (status) {
    case undefined:
    case StatusBarStatus.Disabled:
      return "Click to enable autocomplete";
    case StatusBarStatus.Enabled:
      return "Autocomplete is enabled";
    case StatusBarStatus.Paused:
      return "Autocomplete is paused";
  }
};

let statusBarStatus: StatusBarStatus | undefined = undefined;
let statusBarItem: vscode.StatusBarItem | undefined = undefined;
let statusBarFalseTimeout: NodeJS.Timeout | undefined = undefined;
let configListenerRegistered = false;

export function stopStatusBarLoading() {
  statusBarFalseTimeout = setTimeout(() => {
    setupStatusBar(StatusBarStatus.Enabled, false);
  }, 100);
}

export function setupStatusBar(
  status: StatusBarStatus | undefined,
  loading?: boolean,
) {
  if (loading !== false) {
    clearTimeout(statusBarFalseTimeout);
    statusBarFalseTimeout = undefined;
  }

  if (!statusBarItem) {
    statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
    );
  }

  statusBarItem.text = statusBarItemText(status, loading);
  statusBarItem.tooltip = statusBarItemTooltip(status ?? statusBarStatus);
  statusBarItem.command = `${EXTENSION_NAME}.openConfigMenu`;

  statusBarItem.show();
  if (status !== undefined) {
    statusBarStatus = status;
  }

  // Guard: only register this listener once. Previously it was registered on
  // every setupStatusBar() call, causing unbounded listener accumulation.
  if (!configListenerRegistered) {
    configListenerRegistered = true;
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(EXTENSION_NAME)) {
        const enabled = vscode.workspace
          .getConfiguration(EXTENSION_NAME)
          .get<boolean>("enabled");
        if (enabled && statusBarStatus === StatusBarStatus.Paused) {
          return;
        }
        setupStatusBar(
          enabled ? StatusBarStatus.Enabled : StatusBarStatus.Disabled,
        );
      }
    });
  }
}

export function getStatusBarStatus(): StatusBarStatus | undefined {
  return statusBarStatus;
}

export function monitorBatteryChanges(battery: Battery): vscode.Disposable {
  return battery.onChangeAC((acConnected: boolean) => {
    const config = vscode.workspace.getConfiguration(EXTENSION_NAME);
    const enabled = config.get<boolean>("enabled");
    if (!!enabled) {
      const pauseOnBattery = config.get<boolean>("pauseOnBattery");
      setupStatusBar(
        acConnected || !pauseOnBattery
          ? StatusBarStatus.Enabled
          : StatusBarStatus.Paused,
      );
    }
  });
}
