import { describe, expect, test } from "vitest";

import {
  AutocompleteCodeSnippet,
  AutocompleteSnippetType,
} from "../../snippets/types";
import { getTemplateForModel } from "../AutocompleteTemplate";

/**
 * Mellum is suffix-first and takes cross-file context as <filename> blocks.
 * These assertions are pinned to the layout in the model card:
 * https://huggingface.co/JetBrains/Mellum-4b-sft-all
 */
describe("Mellum FIM template", () => {
  const WORKSPACE = ["file:///repo"];
  const CURRENT = "file:///repo/src/Example.kt";
  const PREFIX = "fun calculateSum(a: Int, b: Int): Int {\n  return ";
  const SUFFIX = "\n}\n";

  const render = (snippets: AutocompleteCodeSnippet[]) => {
    const t = getTemplateForModel("mellum-4b-sft-all");
    const [prefix, suffix] = t.compilePrefixSuffix!(
      PREFIX,
      SUFFIX,
      CURRENT,
      "repo",
      snippets,
      WORKSPACE,
    );
    expect(typeof t.template).toBe("function");
    return (t.template as Function)(
      prefix,
      suffix,
      CURRENT,
      "repo",
      "kotlin",
      snippets,
      WORKSPACE,
    ) as string;
  };

  test("is selected for the model name", () => {
    // The old behaviour fell through to stableCode, which is prefix-first
    const t = getTemplateForModel("mellum-4b-sft-all");
    expect(t.completionOptions?.stop).toContain("<filename>");
  });

  test("puts suffix before prefix", () => {
    const prompt = render([]);
    expect(prompt.indexOf("<fim_suffix>")).toBeLessThan(
      prompt.indexOf("<fim_prefix>"),
    );
    expect(prompt.indexOf("<fim_prefix>")).toBeLessThan(
      prompt.indexOf("<fim_middle>"),
    );
  });

  test("ends with <fim_middle> and names the current file", () => {
    const prompt = render([]);
    expect(prompt).toBe(
      `<filename>Example.kt\n<fim_suffix>${SUFFIX}<fim_prefix>${PREFIX}<fim_middle>`,
    );
  });

  test("emits cross-file snippets ahead of the current file's marker", () => {
    const snippets: AutocompleteCodeSnippet[] = [
      {
        type: AutocompleteSnippetType.Code,
        filepath: "file:///repo/src/Utils.kt",
        content: "package utils\n\nfun helper() {}",
      },
    ];
    const prompt = render(snippets);

    expect(prompt).toBe(
      [
        "<filename>Utils.kt",
        "package utils",
        "",
        "fun helper() {}",
        "<filename>Example.kt",
        `<fim_suffix>${SUFFIX}<fim_prefix>${PREFIX}<fim_middle>`,
      ].join("\n"),
    );

    // The other file must not leak inside the FIM region
    const fimStart = prompt.indexOf("<fim_suffix>");
    expect(prompt.indexOf("package utils")).toBeLessThan(fimStart);
  });

  test("leaves no split sentinel in the prompt", () => {
    const snippets: AutocompleteCodeSnippet[] = [
      {
        type: AutocompleteSnippetType.Code,
        filepath: "file:///repo/src/Utils.kt",
        content: "fun helper() {}",
      },
    ];
    expect(render(snippets)).not.toContain("mellum_fim_split");
    expect(render([])).not.toContain("mellum_fim_split");
  });
});
