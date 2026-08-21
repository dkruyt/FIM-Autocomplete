import type { AutocompleteOutcome } from "core/autocomplete/util/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  item: {
    text: "",
    tooltip: "" as string | undefined,
    command: "",
    shown: false,
    show() {
      this.shown = true;
    },
  },
  settings: {} as Record<string, unknown>,
  configListeners: [] as Array<(event: any) => void>,
}));

vi.mock("vscode", () => ({
  StatusBarAlignment: { Right: 2 },
  Disposable: class {
    constructor(private readonly onDispose: () => void) {}
    dispose() {
      this.onDispose();
    }
  },
  window: {
    createStatusBarItem: () => h.item,
  },
  workspace: {
    getConfiguration: () => ({
      get: (key: string) => h.settings[key],
    }),
    onDidChangeConfiguration: (cb: (event: any) => void) => {
      h.configListeners.push(cb);
      return { dispose: () => {} };
    },
  },
}));

import { AutocompleteStats } from "core/autocomplete/util/AutocompleteStats";

import {
  StatusBarStatus,
  bindStatusBarStats,
  setupStatusBar,
} from "./statusBar";

const outcome = (overrides: Partial<AutocompleteOutcome> = {}) =>
  ({
    time: 1000,
    numLines: 2,
    cacheHit: false,
    modelProvider: "ollama",
    modelName: "mellum",
    ...overrides,
  }) as AutocompleteOutcome;

describe("status bar completion stats", () => {
  let stats: AutocompleteStats;
  let unbind: { dispose: () => void };

  beforeEach(() => {
    h.item.text = "";
    h.item.tooltip = "";
    h.settings = { enabled: true };
    // Not cleared: the module registers its config listener exactly once, on
    // the first setupStatusBar call, so dropping it would leave later tests
    // with nothing to fire.
    stats = new AutocompleteStats();
    setupStatusBar(StatusBarStatus.Enabled, false);
    unbind = bindStatusBarStats(stats);
  });

  it("shows a plain label until something has been recorded", () => {
    expect(h.item.text).toBe("$(check) FIM");
  });

  it("appends shown/accepted/acceptance/cache as completions resolve", () => {
    stats.record(outcome(), "accepted");
    expect(h.item.text).toBe("$(check) FIM 1/1/100%/0%");

    stats.record(outcome(), "rejected");
    expect(h.item.text).toBe("$(check) FIM 2/1/50%/0%");

    stats.record(outcome({ cacheHit: true }), "accepted");
    expect(h.item.text).toBe("$(check) FIM 3/2/67%/33%");
  });

  it("counts a partial accept toward the rate but not the accepted column", () => {
    stats.record(outcome(), "partial");
    expect(h.item.text).toBe("$(check) FIM 1/0/100%/0%");
  });

  it("repaints without disturbing the spinner", () => {
    setupStatusBar(undefined, true);
    stats.record(outcome(), "accepted");
    expect(h.item.text).toBe("$(loading~spin) FIM 1/1/100%/0%");
  });

  it("keeps the state icon when the tally changes", () => {
    setupStatusBar(StatusBarStatus.Paused, false);
    stats.record(outcome(), "accepted");
    expect(h.item.text).toBe("$(debug-pause) FIM 1/1/100%/0%");
  });

  it("puts latency and length in the tooltip", () => {
    stats.record(outcome({ time: 1500, numLines: 3 }), "accepted");
    expect(h.item.tooltip).toContain("Autocomplete is enabled");
    expect(h.item.tooltip).toContain("1 shown, 1 accepted in full");
    expect(h.item.tooltip).toContain("1500ms median (uncached)");
    expect(h.item.tooltip).toContain("3.0 line(s) each");
  });

  it("hides the tally when showStatsInStatusBar is off", () => {
    stats.record(outcome(), "accepted");
    expect(h.item.text).toBe("$(check) FIM 1/1/100%/0%");

    h.settings.showStatsInStatusBar = false;
    for (const listener of h.configListeners) {
      listener({ affectsConfiguration: () => true });
    }

    expect(h.item.text).toBe("$(check) FIM");
    expect(h.item.tooltip).toBe("Autocomplete is enabled");
  });

  it("defaults to on when the setting is unset", () => {
    expect(h.settings.showStatsInStatusBar).toBeUndefined();
    stats.record(outcome(), "accepted");
    expect(h.item.text).toBe("$(check) FIM 1/1/100%/0%");
  });

  it("stops listening once unbound", () => {
    unbind.dispose();
    stats.record(outcome(), "accepted");
    expect(h.item.text).toBe("$(check) FIM");
  });
});
