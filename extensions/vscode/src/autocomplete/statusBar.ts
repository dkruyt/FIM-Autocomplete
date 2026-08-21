import type {
  AutocompleteStats,
  AutocompleteStatsSummary,
} from "core/autocomplete/util/AutocompleteStats";
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

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Where the live tally comes from, once a provider has been bound. */
let statsSource: (() => AutocompleteStatsSummary) | undefined = undefined;

const statsEnabled = () =>
  vscode.workspace
    .getConfiguration(EXTENSION_NAME)
    .get<boolean>("showStatsInStatusBar") ?? true;

/**
 * The counters appended to the label: shown / accepted / acceptance / cache.
 *
 * Empty until something has actually been recorded, so a fresh window shows a
 * plain `FIM` rather than a row of zeroes.
 */
const statsText = (): string => {
  if (!statsSource || !statsEnabled()) {
    return "";
  }
  const summary = statsSource();
  if (summary.shown === 0) {
    return "";
  }
  return ` ${summary.shown}/${summary.accepted}/${pct(
    summary.acceptanceRate,
  )}/${pct(summary.cacheHitRate)}`;
};

/**
 * The numbers that do not fit in the label, on hover.
 *
 * A plain string rather than a MarkdownString: VS Code renders the newlines,
 * and a Markdown tooltip would need every value escaped for the sake of
 * formatting nobody asked for.
 */
const statsTooltip = (): string => {
  if (!statsSource || !statsEnabled()) {
    return "";
  }
  const summary = statsSource();
  if (summary.shown === 0) {
    return "";
  }
  const lines = [
    "",
    `${summary.shown} shown, ${summary.accepted} accepted in full, ${summary.partial} in part, ${summary.rejected} dismissed`,
    `${pct(summary.acceptanceRate)} acceptance, ${pct(summary.cacheHitRate)} from cache`,
    `${summary.latencyP50}ms median (uncached), ${summary.meanLines.toFixed(1)} line(s) each`,
    "",
    "Run FIM: Show Completion Stats for the full breakdown.",
  ];
  return lines.join("\n");
};

let statusBarStatus: StatusBarStatus | undefined = undefined;
let statusBarItem: vscode.StatusBarItem | undefined = undefined;
let statusBarFalseTimeout: NodeJS.Timeout | undefined = undefined;
let configListenerRegistered = false;
/**
 * The last (status, loading) pair setupStatusBar was called with.
 *
 * Kept so the item can be repainted when only the *stats* changed, without
 * disturbing the enabled/paused state or cancelling a running spinner --
 * calling setupStatusBar again would do both.
 */
let lastPaint: { status: StatusBarStatus | undefined; loading?: boolean } = {
  status: undefined,
};

function paintStatusBar() {
  if (!statusBarItem) {
    return;
  }
  const { status, loading } = lastPaint;
  statusBarItem.text = statusBarItemText(status, loading) + statsText();
  statusBarItem.tooltip =
    (statusBarItemTooltip(status ?? statusBarStatus) ?? "") + statsTooltip();
  statusBarItem.command = `${EXTENSION_NAME}.openConfigMenu`;
}

/**
 * Show a live tally on the status bar item, updated as completions resolve.
 *
 * Dismissals only land ten seconds after a suggestion was shown, so the
 * counters move without any editor activity -- hence a subscription rather
 * than a repaint at the point of use.
 */
export function bindStatusBarStats(
  stats: AutocompleteStats,
): vscode.Disposable {
  statsSource = () => stats.summarize();
  const unsubscribe = stats.onChange(paintStatusBar);
  paintStatusBar();
  return new vscode.Disposable(() => {
    unsubscribe();
    statsSource = undefined;
    paintStatusBar();
  });
}

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

  lastPaint = { status, loading };
  paintStatusBar();

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
          // Still repaint: the change may have been to the stats setting, and
          // a paused status bar should honour it too.
          paintStatusBar();
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
