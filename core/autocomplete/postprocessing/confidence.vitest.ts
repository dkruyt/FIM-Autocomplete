import { describe, expect, it } from "vitest";

import { countStrayClosers, scoreCompletion } from "./confidence";

describe("countStrayClosers", () => {
  it("counts a closer with nothing to close", () => {
    expect(countStrayClosers("", "doWork();\n}")).toBe(1);
  });

  it("allows closing what the prefix left open", () => {
    expect(countStrayClosers("function f() {\n", "  return 1;\n}")).toBe(0);
  });

  it("allows closing what the completion itself opened", () => {
    expect(countStrayClosers("", "wrap(inner())")).toBe(0);
  });
});

describe("scoreCompletion", () => {
  const prefix =
    "export function add(a: number, b: number): number {\n  return ";
  const suffix = "\n}\n";

  it("scores a clean continuation highly", () => {
    const s = scoreCompletion({ completion: "a + b;", prefix, suffix });
    expect(s.bracketBalance).toBe(1);
    expect(s.suffixNovelty).toBe(1);
    expect(s.score).toBeGreaterThan(0.8);
  });

  it("penalises stray closing brackets", () => {
    const clean = scoreCompletion({ completion: "a + b;", prefix, suffix });
    const stray = scoreCompletion({
      completion: "a + b;\n}\n}\n}",
      prefix,
      suffix,
    });
    expect(stray.bracketBalance).toBeLessThan(clean.bracketBalance);
    expect(stray.score).toBeLessThan(clean.score);
  });

  it("penalises regenerating the code below the cursor", () => {
    const longSuffix =
      "\n  const alreadyWrittenValue = compute(a, b);\n  return alreadyWrittenValue;\n}\n";
    const s = scoreCompletion({
      completion:
        "  const alreadyWrittenValue = compute(a, b);\n  return alreadyWrittenValue;",
      prefix,
      suffix: longSuffix,
    });
    expect(s.suffixNovelty).toBe(0);
  });

  it("does not punish short structural lines shared with the suffix", () => {
    // `}` appears in both but is not evidence of anything.
    const s = scoreCompletion({ completion: "a + b;\n}", prefix, suffix });
    expect(s.suffixNovelty).toBe(1);
  });

  it("rates invented identifiers below grounded ones", () => {
    const grounded = scoreCompletion({ completion: "a + b", prefix, suffix });
    const invented = scoreCompletion({
      completion: "zqx1 + zqx2 + zqx3 + zqx4 + zqx5",
      prefix,
      suffix,
    });
    expect(invented.contextSupport).toBeLessThan(grounded.contextSupport);
  });

  it("counts identifiers from the supplied context as grounded", () => {
    const withoutCtx = scoreCompletion({
      completion: "formatCurrency(cents)",
      prefix,
      suffix,
    });
    const withCtx = scoreCompletion({
      completion: "formatCurrency(cents)",
      prefix,
      suffix,
      contextText: "export function formatCurrency(cents: number) {}",
    });
    expect(withCtx.contextSupport).toBeGreaterThan(withoutCtx.contextSupport);
  });

  it("keeps every signal inside 0..1", () => {
    for (const completion of ["", "}}}}}}}}}}", "a", "x".repeat(500)]) {
      const s = scoreCompletion({ completion, prefix, suffix });
      for (const v of [
        s.bracketBalance,
        s.suffixNovelty,
        s.contextSupport,
        s.score,
      ]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});
