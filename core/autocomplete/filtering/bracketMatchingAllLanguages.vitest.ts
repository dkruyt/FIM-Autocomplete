import { describe, expect, it } from "vitest";

import { languageForFilepath } from "../constants/AutocompleteLanguageInfo";

import {
  BracketMatchingService,
  unmatchedOpeningBrackets,
} from "./BracketMatchingService";

async function* chars(s: string) {
  for (const c of s) yield c;
}

async function filtered(
  completion: string,
  prefix: string,
  { multiline = true, suffix = "" } = {},
) {
  let out = "";
  for await (const chunk of new BracketMatchingService().stopOnUnmatchedClosingBracket(
    chars(completion),
    prefix,
    suffix,
    multiline,
  )) {
    out += chunk;
  }
  return out;
}

describe("unmatchedOpeningBrackets", () => {
  it("reports what is left open, outermost first", () => {
    expect(unmatchedOpeningBrackets("class A {\n  m() {\n")).toEqual([
      "{",
      "{",
    ]);
  });

  it("ignores a closing bracket that matches nothing", () => {
    // Source mid-edit is routinely unbalanced.
    expect(unmatchedOpeningBrackets("})]  foo(")).toEqual(["("]);
  });

  it("is empty for balanced text", () => {
    expect(unmatchedOpeningBrackets("a(b[c]{d})")).toEqual([]);
  });
});

describe("bracket matching with prefix context", () => {
  it("lets a completion close a block the prefix opened", () => {
    // The most common multi-line completion there is: finish the function body
    // and close the brace that the signature above opened.
    return expect(
      filtered("  return a + b;\n}", "function add(a, b) {\n"),
    ).resolves.toContain("}");
  });

  it("still stops at a bracket that closes nothing", async () => {
    const out = await filtered("doWork();\n}\nSTRAY", "");
    expect(out).not.toContain("STRAY");
  });

  it("allows brackets the completion opened itself", async () => {
    expect(await filtered("wrap(inner())", "")).toBe("wrap(inner())");
  });
});

describe("language coverage", () => {
  it.each([
    ["file:///a.ts", "TypeScript"],
    ["file:///a.py", "Python"],
    ["file:///a.go", "Go"],
    ["file:///a.rs", "Rust"],
    ["file:///a.java", "Java"],
    ["file:///a.json", "JSON"],
  ])("%s (%s) uses bracket matching", (path, name) => {
    const lang = languageForFilepath(path);
    expect(lang.name).toBe(name);
    expect(lang.skipBracketMatching).toBeFalsy();
  });

  it.each([
    ["file:///a.md", "Markdown"],
    ["file:///a.yaml", "YAML"],
    ["file:///a.sql", "SQL"],
  ])("%s (%s) opts out", (path, name) => {
    const lang = languageForFilepath(path);
    expect(lang.name).toBe(name);
    expect(lang.skipBracketMatching).toBe(true);
  });
});
