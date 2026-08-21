import { AutocompleteOutcome } from "core/autocomplete/util/types";
import * as vscode from "vscode";

import { EXTENSION_NAME } from "../util/constants";

const CHANNEL_NAME = "FIM Autocomplete";

type StatKey = keyof NonNullable<AutocompleteOutcome["contextStats"]>;

/**
 * Each context source, in report order, with the predicate that decides whether
 * it can reach the prompt at all.
 *
 * The counts alone are misleading: every source is *gathered* on each
 * completion, but `getSnippets` drops the ones whose option is off. Clipboard,
 * for instance, is always read and always discarded unless it is enabled -- so
 * reporting a bare count would show it contributing when it never does.
 */
const SOURCES: Array<{
  key: StatKey;
  label: string;
  enabled: (o: AutocompleteOutcome) => boolean;
}> = [
  {
    key: "rootPath",
    label: "enclosing scope (tree-sitter)",
    enabled: () => true,
  },
  {
    key: "importDefinitions",
    label: "imported definitions",
    enabled: (o) => o.useImports !== false,
  },
  { key: "ideLsp", label: "LSP definitions", enabled: () => true },
  {
    key: "recentlyEdited",
    label: "recently edited ranges",
    enabled: (o) =>
      o.useRecentlyEdited !== false &&
      !!o.experimental_includeRecentlyEditedRanges,
  },
  {
    key: "recentlyVisited",
    label: "recently visited ranges",
    enabled: (o) => !!o.experimental_includeRecentlyVisitedRanges,
  },
  {
    key: "recentlyOpened",
    label: "recently opened files",
    enabled: (o) => o.useRecentlyOpened !== false,
  },
  {
    key: "clipboard",
    label: "clipboard",
    enabled: (o) => !!o.experimental_includeClipboard,
  },
  {
    key: "staticContext",
    label: "static contextualization",
    enabled: (o) => !!o.experimental_enableStaticContextualization,
  },
  {
    key: "diagnostics",
    label: "nearby diagnostics",
    enabled: (o) => o.useDiagnostics !== false,
  },
];

/**
 * Writes what went into each completion to an output channel.
 *
 * Off unless `fim.debug` is set: when disabled nothing is formatted at all, so
 * the cost on the completion path is one boolean check.
 *
 * Note the channel's own contents are excluded from future prompts -- see
 * OUTPUT_CHANNEL_URI_PREFIX in core/util/constants -- otherwise the prompts we
 * log here would be fed straight back in as "recently visited" context.
 */
export class AutocompleteLogger {
  private channel: vscode.OutputChannel | undefined;

  private get enabled(): boolean {
    return (
      vscode.workspace.getConfiguration(EXTENSION_NAME).get<boolean>("debug") ??
      false
    );
  }

  private getChannel(): vscode.OutputChannel {
    if (!this.channel) {
      this.channel = vscode.window.createOutputChannel(CHANNEL_NAME);
    }
    return this.channel;
  }

  /** Reveal the channel, creating it if the user has never had debug on. */
  public show() {
    const channel = this.getChannel();
    if (!this.enabled) {
      channel.appendLine(
        `Logging is off. Set "${EXTENSION_NAME}.debug": true in settings to record completions here.`,
      );
    }
    channel.show(true);
  }

  public logOutcome(outcome: AutocompleteOutcome) {
    if (!this.enabled) {
      return;
    }

    const channel = this.getChannel();
    const lines: string[] = [];

    lines.push(`--- ${outcome.timestamp} ---`);
    lines.push(`file       ${outcome.filepath}`);
    lines.push(`model      ${outcome.modelProvider}/${outcome.modelName}`);
    lines.push(
      `timing     ${outcome.time}ms${outcome.cacheHit ? " (cache hit)" : ""}`,
    );
    lines.push(
      `completion ${outcome.numLines} line(s), ${outcome.completion.length} chars`,
    );

    const stats = outcome.contextStats;
    if (stats) {
      lines.push("context");
      for (const { key, label, enabled } of SOURCES) {
        const count = stats[key];
        if (!enabled(outcome)) {
          lines.push(`  - ${label}: off`);
          continue;
        }
        // A tick vs cross makes a source that silently stopped firing obvious.
        lines.push(`  ${count > 0 ? "✓" : "✗"} ${label}: ${count}`);
      }
    }

    const c = outcome.confidence;
    if (c) {
      // Printed so fim.confidenceThreshold can be set from observed numbers
      // rather than guessed at.
      lines.push(
        `confidence ${c.score.toFixed(2)} ` +
          `(brackets ${c.bracketBalance.toFixed(2)}, ` +
          `novelty ${c.suffixNovelty.toFixed(2)}, ` +
          `grounding ${c.contextSupport.toFixed(2)}) ` +
          `threshold ${outcome.confidenceThreshold}`,
      );
    }

    lines.push("prompt");
    lines.push(indent(outcome.prompt));
    lines.push("completion");
    lines.push(indent(outcome.completion));
    lines.push("");

    channel.appendLine(lines.join("\n"));
  }

  public dispose() {
    this.channel?.dispose();
    this.channel = undefined;
  }
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `  | ${line}`)
    .join("\n");
}
