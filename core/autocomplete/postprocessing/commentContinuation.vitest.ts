import { describe, expect, it } from "vitest";

import { postprocessCompletion } from ".";

const llm = { model: "mellum-4b-sft-all" } as any;

const run = (completion: string, prefix: string, suffix = "\n") =>
  postprocessCompletion({
    completion,
    llm,
    prefix,
    suffix,
    singleLineComment: "#",
  });

describe("completions that continue a comment", () => {
  it("cuts back prose the model tacked onto an unfinished comment", () => {
    // Verbatim from a real session: the user was still typing the comment.
    const prefix = "import json\nfrom pathlib import Path\n\n# This function ";
    const completion =
      "is not in the file, but it is used in the completion.\n# It is not a part of the extension, so it is not in the settings.";
    expect(run(completion, prefix)).toBe(
      "is not in the file, but it is used in the completion.",
    );
  });

  it("cuts back a run of invented comment lines on the next line", () => {
    // Also verbatim: this one starts with a newline, so a test of "does the
    // completion continue the cursor's line" misses it entirely.
    const prefix =
      "# This is the main training loop.\n# It handles the training loop logic, including:\n# - Training loop logic";
    const completion =
      "\n# - Model saving\n# - Model loading\n# - Model evaluation\n# - Model visualization\n# - Model training";
    expect(run(completion, prefix)).toBe("\n# - Model saving");
  });

  it("keeps a comment line that introduces code", () => {
    // Mixed output is the model explaining what it then writes; that is useful.
    const prefix = "def load(path):\n    # read the file";
    const completion =
      "\n    # open it first\n    with open(path) as f:\n        return f.read()";
    expect(run(completion, prefix)).toBe(completion);
  });

  it("leaves comment-only output alone when the cursor is not in a comment", () => {
    const prefix = "def load(path):\n    ";
    const completion = "# TODO: implement\n# and test it";
    expect(run(completion, prefix)).toBe(completion);
  });

  it("leaves code answering a comment alone", () => {
    // The M9 case: a newline then an indented block is code, not prose.
    const prefix =
      "def load_config(path):\n    # read the file at path and parse it as JSON";
    const completion =
      "\n    with open(path) as f:\n        return json.load(f)";
    expect(run(completion, prefix)).toBe(completion);
  });

  it("leaves ordinary multi-line code alone", () => {
    const prefix = "def fibonacci(n):\n    ";
    const completion =
      "a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b";
    expect(run(completion, prefix)).toBe(completion);
  });

  it("does nothing when the language has no line comment", () => {
    const prefix = "# This function ";
    const completion = "keeps going\nand going";
    expect(
      postprocessCompletion({
        completion,
        llm,
        prefix,
        suffix: "\n",
        singleLineComment: undefined,
      }),
    ).toBe(completion);
  });

  it("uses the language's own comment marker", () => {
    const prefix = "// Steps:\n// - parse the input";
    const completion = "\n// - validate it\n// - write the output\n// - log it";
    expect(
      postprocessCompletion({
        completion,
        llm,
        prefix,
        suffix: "\n",
        singleLineComment: "//",
      }),
    ).toBe("\n// - validate it");
  });

  it("treats an unmarked line after a comment as code, and keeps it", () => {
    // Nothing marks it as a comment, so in every language here it *is* code --
    // a rule that guessed otherwise would eat real completions.
    const prefix = "// set up the client\n";
    const completion = "const client = new Client();\nclient.connect();";
    expect(
      postprocessCompletion({
        completion,
        llm,
        prefix,
        suffix: "\n",
        singleLineComment: "//",
      }),
    ).toBe(completion);
  });
});
