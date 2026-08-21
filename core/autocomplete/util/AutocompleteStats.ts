import { AutocompleteOutcome } from "./types";

/**
 * How many completions to remember. Enough to make a rate meaningful over a
 * working session, small enough that the whole thing stays a rounding error in
 * memory (each record is a handful of numbers, not the completion text).
 */
const MAX_RECORDS = 500;

export type CompletionVerdict = "accepted" | "partial" | "rejected";

interface CompletionRecord {
  verdict: CompletionVerdict;
  timeMs: number;
  numLines: number;
  cacheHit: boolean;
  model: string;
  confidence?: number;
}

export interface AutocompleteStatsSummary {
  shown: number;
  accepted: number;
  partial: number;
  rejected: number;
  /** Accepted, in full or in part, as a share of completions shown. */
  acceptanceRate: number;
  cacheHitRate: number;
  latencyP50: number;
  latencyP90: number;
  meanLines: number;
  byModel: Array<{ model: string; shown: number; acceptanceRate: number }>;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[index];
}

/**
 * Local-only record of how completions fared.
 *
 * Deliberately nothing more than a bounded in-memory buffer: it holds no
 * prompts, no completion text and no file paths, and nothing here is sent
 * anywhere. The point is to answer "is this model actually helping me" from the
 * user's own session, not to collect anything.
 */
export class AutocompleteStats {
  private records: CompletionRecord[] = [];
  private listeners = new Set<() => void>();

  /**
   * Subscribe to changes in the tally. Returns an unsubscribe function.
   *
   * Exists so a live display can repaint exactly when a number moves. Polling
   * would be the obvious alternative and is worse: a rejection is only recorded
   * ten seconds after the suggestion was shown, so a poll interval fast enough
   * to look live would be running constantly for the sake of one event.
   */
  public onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public record(outcome: AutocompleteOutcome, verdict: CompletionVerdict) {
    this.records.push({
      verdict,
      timeMs: outcome.time ?? 0,
      numLines: outcome.numLines ?? 0,
      cacheHit: !!outcome.cacheHit,
      model: `${outcome.modelProvider}/${outcome.modelName}`,
      confidence: outcome.confidence?.score,
    });
    if (this.records.length > MAX_RECORDS) {
      this.records.shift();
    }
    this.notify();
  }

  public clear() {
    this.records = [];
    this.notify();
  }

  public get size() {
    return this.records.length;
  }

  public summarize(): AutocompleteStatsSummary {
    const shown = this.records.length;
    const accepted = this.records.filter(
      (r) => r.verdict === "accepted",
    ).length;
    const partial = this.records.filter((r) => r.verdict === "partial").length;
    const rejected = this.records.filter(
      (r) => r.verdict === "rejected",
    ).length;

    // Latency is only meaningful for completions the model actually produced.
    const latencies = this.records
      .filter((r) => !r.cacheHit)
      .map((r) => r.timeMs)
      .sort((a, b) => a - b);

    const byModelMap = new Map<string, { shown: number; good: number }>();
    for (const r of this.records) {
      const entry = byModelMap.get(r.model) ?? { shown: 0, good: 0 };
      entry.shown++;
      if (r.verdict !== "rejected") {
        entry.good++;
      }
      byModelMap.set(r.model, entry);
    }

    return {
      shown,
      accepted,
      partial,
      rejected,
      acceptanceRate: shown === 0 ? 0 : (accepted + partial) / shown,
      cacheHitRate:
        shown === 0 ? 0 : this.records.filter((r) => r.cacheHit).length / shown,
      latencyP50: percentile(latencies, 50),
      latencyP90: percentile(latencies, 90),
      meanLines:
        shown === 0
          ? 0
          : this.records.reduce((sum, r) => sum + r.numLines, 0) / shown,
      byModel: [...byModelMap.entries()]
        .map(([model, e]) => ({
          model,
          shown: e.shown,
          acceptanceRate: e.shown === 0 ? 0 : e.good / e.shown,
        }))
        .sort((a, b) => b.shown - a.shown),
    };
  }
}
