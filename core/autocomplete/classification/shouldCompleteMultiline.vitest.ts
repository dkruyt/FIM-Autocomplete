import { describe, expect, it } from "vitest";

import { languageForFilepath } from "../constants/AutocompleteLanguageInfo";
import { HelperVars } from "../util/HelperVars";

import { shouldCompleteMultiline } from "./shouldCompleteMultiline";

const CURSOR = "<|c|>";

/** Builds just enough of a HelperVars for the classifier. */
function helperFor(source: string, filepath = "file:///a.ts"): HelperVars {
  const [fullPrefix, fullSuffix] = source.split(CURSOR);
  return {
    options: { multilineCompletions: "auto" },
    input: { selectedCompletionInfo: undefined },
    lang: languageForFilepath(filepath),
    fullPrefix,
    fullSuffix,
    prunedPrefix: fullPrefix,
    prunedSuffix: fullSuffix,
  } as unknown as HelperVars;
}

describe("shouldCompleteMultiline and comments", () => {
  it("allows multiline at the end of a finished comment", () => {
    // The comment-then-implementation flow: this is the case the rule used to
    // block, and the reason M9 exists.
    expect(
      shouldCompleteMultiline(
        helperFor(
          `function main() {\n  // parse the config file${CURSOR}\n}\n`,
        ),
      ),
    ).toBe(true);
  });

  it("stays single-line while writing inside a comment", () => {
    expect(
      shouldCompleteMultiline(
        helperFor(
          `function main() {\n  // parse the ${CURSOR}config file\n}\n`,
        ),
      ),
    ).toBe(false);
  });

  it("allows multiline on a blank line after a comment", () => {
    expect(
      shouldCompleteMultiline(
        helperFor(
          `function main() {\n  // parse the config file\n  ${CURSOR}\n}\n`,
        ),
      ),
    ).toBe(true);
  });

  it("allows multiline on ordinary code", () => {
    expect(
      shouldCompleteMultiline(helperFor(`function main() {\n  ${CURSOR}\n}\n`)),
    ).toBe(true);
  });

  it("still honours an explicit never", () => {
    const h = helperFor(`function main() {\n  ${CURSOR}\n}\n`);
    (h as any).options.multilineCompletions = "never";
    expect(shouldCompleteMultiline(h)).toBe(false);
  });

  it("still returns single-line when an intellisense item is selected", () => {
    const h = helperFor(`function main() {\n  ${CURSOR}\n}\n`);
    (h as any).input.selectedCompletionInfo = { text: "foo", range: {} };
    expect(shouldCompleteMultiline(h)).toBe(true);
  });
});
