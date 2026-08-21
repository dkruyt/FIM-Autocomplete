import { describe, expect, it } from "vitest";

import { AutocompleteStats } from "./AutocompleteStats";
import { AutocompleteOutcome } from "./types";

const outcome = (over: Partial<AutocompleteOutcome> = {}) =>
  ({
    time: 100,
    numLines: 2,
    cacheHit: false,
    modelProvider: "ollama",
    modelName: "granite4.1:3b",
    ...over,
  }) as AutocompleteOutcome;

describe("AutocompleteStats", () => {
  it("reports zeros before anything happens", () => {
    const s = new AutocompleteStats().summarize();
    expect(s.shown).toBe(0);
    expect(s.acceptanceRate).toBe(0);
    expect(s.latencyP50).toBe(0);
  });

  it("counts partial accepts as accepted", () => {
    // Taking a word of a suggestion means it helped.
    const stats = new AutocompleteStats();
    stats.record(outcome(), "accepted");
    stats.record(outcome(), "partial");
    stats.record(outcome(), "rejected");
    stats.record(outcome(), "rejected");

    const s = stats.summarize();
    expect(s.shown).toBe(4);
    expect(s.accepted).toBe(1);
    expect(s.partial).toBe(1);
    expect(s.acceptanceRate).toBe(0.5);
  });

  it("excludes cache hits from latency", () => {
    // A cache hit measures the cache, not the model.
    const stats = new AutocompleteStats();
    stats.record(outcome({ time: 1, cacheHit: true }), "accepted");
    stats.record(outcome({ time: 500 }), "accepted");
    expect(stats.summarize().latencyP50).toBe(500);
  });

  it("reports cache hit rate over everything shown", () => {
    const stats = new AutocompleteStats();
    stats.record(outcome({ cacheHit: true }), "accepted");
    stats.record(outcome({ cacheHit: false }), "rejected");
    expect(stats.summarize().cacheHitRate).toBe(0.5);
  });

  it("breaks results down by model, busiest first", () => {
    const stats = new AutocompleteStats();
    stats.record(outcome({ modelName: "a" }), "accepted");
    stats.record(outcome({ modelName: "a" }), "rejected");
    stats.record(outcome({ modelName: "b" }), "accepted");
    stats.record(outcome({ modelName: "b" }), "accepted");
    stats.record(outcome({ modelName: "b" }), "accepted");

    const byModel = stats.summarize().byModel;
    expect(byModel[0].model).toBe("ollama/b");
    expect(byModel[0].acceptanceRate).toBe(1);
    expect(byModel[1].acceptanceRate).toBe(0.5);
  });

  it("keeps memory bounded", () => {
    const stats = new AutocompleteStats();
    for (let i = 0; i < 2000; i++) {
      stats.record(outcome(), "accepted");
    }
    expect(stats.size).toBe(500);
    expect(stats.summarize().shown).toBe(500);
  });

  it("stores no prompt, completion or file path", () => {
    const stats = new AutocompleteStats();
    stats.record(
      outcome({
        prompt: "SECRET PROMPT",
        completion: "SECRET COMPLETION",
        filepath: "file:///secret/path.ts",
      } as Partial<AutocompleteOutcome>),
      "accepted",
    );
    const serialized = JSON.stringify((stats as any).records);
    expect(serialized).not.toContain("SECRET");
    expect(serialized).not.toContain("secret/path");
  });
});
