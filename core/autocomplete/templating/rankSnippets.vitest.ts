import { describe, expect, it } from "vitest";

import { AutocompleteSnippetType } from "../snippets/types";

import { rankSnippetsByRelevance } from "./filtering";

function snippet(content: string, filepath = "file:///a.ts") {
  return { content, filepath, type: AutocompleteSnippetType.Code as const };
}

describe("rankSnippetsByRelevance", () => {
  const caretWindow = `
    import { formatCurrency } from "./money";
    export function renderTotal(cents: number) {
      return formatCurrency(
    }
  `;

  it("puts the snippet sharing the caret's symbols first", () => {
    const relevant = snippet(
      "export function formatCurrency(cents: number): string { return String(cents); }",
    );
    const unrelated = snippet(
      "export class HttpRetryPolicy { backoffMillis = 250; jitter = true; }",
    );

    const ranked = rankSnippetsByRelevance([unrelated, relevant], caretWindow);

    expect(ranked[0]).toBe(relevant);
  });

  it("is deterministic - the same input always gives the same order", () => {
    const snippets = [
      snippet("alpha beta gamma"),
      snippet("formatCurrency cents"),
      snippet("delta epsilon"),
    ];
    const first = rankSnippetsByRelevance([...snippets], caretWindow);
    for (let i = 0; i < 20; i++) {
      expect(rankSnippetsByRelevance([...snippets], caretWindow)).toEqual(
        first,
      );
    }
  });

  it("keeps source order when nothing matches", () => {
    // Equal scores must fall back to the order the sources were concatenated
    // in (root-path, imports, static), not to an arbitrary one.
    const a = snippet("zzz1 zzz2");
    const b = snippet("zzz3 zzz4");
    const c = snippet("zzz5 zzz6");
    expect(rankSnippetsByRelevance([a, b, c], caretWindow)).toEqual([a, b, c]);
  });

  it("does not let a large irrelevant snippet outrank a small relevant one", () => {
    // Raw overlap count would favour the big file; the sqrt normalisation is
    // what stops volume alone from winning.
    const big = snippet(
      "formatCurrency " +
        Array.from({ length: 400 }, (_, i) => `noise${i}`).join(" "),
    );
    const small = snippet("formatCurrency cents renderTotal");

    expect(rankSnippetsByRelevance([big, small], caretWindow)[0]).toBe(small);
  });

  it("returns short lists untouched", () => {
    const only = snippet("anything");
    expect(rankSnippetsByRelevance([only], caretWindow)).toEqual([only]);
    expect(rankSnippetsByRelevance([], caretWindow)).toEqual([]);
  });

  it("returns the input order when the caret window has no symbols", () => {
    const a = snippet("one");
    const b = snippet("two");
    expect(rankSnippetsByRelevance([a, b], "   \n  ")).toEqual([a, b]);
  });
});
