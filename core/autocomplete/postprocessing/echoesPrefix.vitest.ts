import { describe, expect, it } from "vitest";

import { postprocessCompletion } from ".";

const llm = { model: "granite4.1:3b" } as any;

function run(completion: string, prefix: string, suffix = "\n}\n") {
  return postprocessCompletion({ completion, llm, prefix, suffix });
}

describe("rejects completions that replay the prefix", () => {
  // Verbatim output from codegemma:2b asked to complete `  return ` -- it
  // restated the whole function header instead of finishing the expression.
  it("drops a real multi-line echo from a weak model", () => {
    const prefix =
      "export function add(a: number, b: number): number {\n  return ";
    const completion =
      "\nexport function add(a: number, b: number): number {\n  return ";
    expect(run(completion, prefix)).toBeUndefined();
  });

  it("drops an echo that starts partway up the prefix", () => {
    const prefix =
      "class Cart {\n  private items: Item[] = [];\n\n  total(): number {\n    ";
    const completion =
      "private items: Item[] = [];\n\n  total(): number {\n    ";
    expect(run(completion, prefix)).toBeUndefined();
  });

  it("keeps a genuine continuation", () => {
    const prefix =
      "export function add(a: number, b: number): number {\n  return ";
    expect(run("a + b;", prefix)).toBe("a + b;");
  });

  it("keeps a multi-line body that does not restate the prefix", () => {
    const prefix =
      'def fibonacci(n):\n    """Return the nth Fibonacci number."""\n    ';
    const completion =
      "a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a";
    expect(run(completion, prefix)).toBe(completion);
  });

  it("does not trip on a run of closing brackets", () => {
    // Structural lines repeat all the time; an echo needs real content.
    const prefix = "if (a) {\n  if (b) {\n    doThing();\n  }\n}\n";
    const completion = "  }\n}";
    expect(run(completion, prefix)).toBe(completion);
  });

  it("does not trip on a single repeated substantial line", () => {
    // One line matching is rewritesLineAbove's job and is often legitimate.
    const prefix =
      "const total = items.reduce((a, b) => a + b, 0);\nconst x = ";
    const completion = "const total = items.reduce((a, b) => a + b, 0);";
    expect(run(completion, prefix)).toBe(completion);
  });
});
