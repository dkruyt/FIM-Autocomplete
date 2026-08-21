import { describe, expect, it } from "vitest";

import { DEFAULT_AUTOCOMPLETE_OPTS } from "../../util/parameters";

import { MIN_PROMPT_TOKENS, resolveContextBudget } from "./contextBudget";

const opts = (over: Partial<typeof DEFAULT_AUTOCOMPLETE_OPTS> = {}) => ({
  ...DEFAULT_AUTOCOMPLETE_OPTS,
  ...over,
});

describe("resolveContextBudget", () => {
  it("leaves the budget alone when the model can hold it", () => {
    const o = opts({ maxPromptTokens: 2048, maxCompletionTokens: 512 });
    expect(resolveContextBudget(o, { contextLength: 32768 })).toBe(o);
  });

  it("clamps the budget to what a small model can hold", () => {
    // 4096 - 512 reserved - ~82 buffer leaves ~3502.
    const o = opts({ maxPromptTokens: 8192, maxCompletionTokens: 512 });
    const r = resolveContextBudget(o, { contextLength: 4096 });
    expect(r.maxPromptTokens).toBeLessThan(4096 - 512);
    expect(r.maxPromptTokens).toBeGreaterThan(3000);
  });

  it("never returns less than the floor, even for an absurd model", () => {
    const o = opts({ maxPromptTokens: 2048, maxCompletionTokens: 512 });
    expect(
      resolveContextBudget(o, { contextLength: 100 }).maxPromptTokens,
    ).toBe(MIN_PROMPT_TOKENS);
  });

  it("accounts for a larger completion reservation", () => {
    const small = resolveContextBudget(
      opts({ maxPromptTokens: 8192, maxCompletionTokens: 512 }),
      { contextLength: 8192 },
    ).maxPromptTokens;
    const large = resolveContextBudget(
      opts({ maxPromptTokens: 8192, maxCompletionTokens: 4096 }),
      { contextLength: 8192 },
    ).maxPromptTokens;
    expect(large).toBeLessThan(small);
  });

  it("does not mutate the options it is given", () => {
    const o = opts({ maxPromptTokens: 8192 });
    resolveContextBudget(o, { contextLength: 2048 });
    expect(o.maxPromptTokens).toBe(8192);
  });
});
