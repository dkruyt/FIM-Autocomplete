/**
 * Live end-to-end check against a real FIM endpoint. Skipped unless FIM_LIVE=1,
 * so it never runs in a normal `npm test`.
 *
 *   FIM_LIVE=1 FIM_API_BASE=... FIM_API_KEY=... FIM_MODEL=... npx vitest run autocomplete/liveFim
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TabAutocompleteOptions } from "..";
import { llmFromProviderAndOptions } from "../llm/llms";
import { testConfig, testIde } from "../test/fixtures";
import { setUpTestDir, tearDownTestDir } from "../test/testDir";
import { joinPathsToUri } from "../util/uri";

import { CompletionProvider } from "./CompletionProvider";
import { AutocompleteSnippetType } from "./snippets/types";
import { getTemplateForModel } from "./templating/AutocompleteTemplate";
import { openedFilesLruCache } from "./util/openedFilesLruCache";
import { AutocompleteInput } from "./util/types";

const LIVE = process.env.FIM_LIVE === "1";
const API_BASE = process.env.FIM_API_BASE;
const API_KEY = process.env.FIM_API_KEY;
const MODEL = process.env.FIM_MODEL ?? "mellum-4b-sft-all";
const PROVIDER = process.env.FIM_PROVIDER ?? "openai";

const CURSOR = "<|cursor|>";

describe.skipIf(!LIVE)("live FIM endpoint", () => {
  let workspaceDir: string;

  beforeAll(async () => {
    setUpTestDir();
    [workspaceDir] = await testIde.getWorkspaceDirs();
  });
  afterAll(() => tearDownTestDir());

  function buildLlm() {
    // apiBase/apiKey are left off when unset so provider defaults apply --
    // ollama needs neither, and passing `undefined` overrides its default base.
    return llmFromProviderAndOptions(
      PROVIDER as any,
      {
        model: MODEL,
        title: `${PROVIDER}/${MODEL}`,
        ...(API_BASE ? { apiBase: API_BASE } : {}),
        ...(API_KEY ? { apiKey: API_KEY } : {}),
        uniqueId: "fim",
      } as any,
    );
  }

  async function run(
    name: string,
    filename: string,
    source: string,
    overrides: Partial<TabAutocompleteOptions> = {},
    input: Partial<AutocompleteInput> = {},
  ) {
    const [prefix] = source.split(CURSOR);
    const fileUri = joinPathsToUri(workspaceDir, filename);
    await testIde.writeFile(fileUri, source.replace(CURSOR, ""));

    const llm = buildLlm();
    const provider = new CompletionProvider(
      testConfig({ debounceDelay: 0, ...overrides }),
      testIde,
      async () => llm,
      (e) => console.error("  [onError]", e?.message ?? e),
      async () => [],
    );

    const line = prefix.split("\n").length - 1;
    const character = prefix.split("\n")[line].length;

    const started = Date.now();
    const outcome = await provider.provideInlineCompletionItems(
      {
        isUntitledFile: false,
        completionId: `live-${name}-${Date.now()}`,
        filepath: fileUri,
        pos: { line, character },
        recentlyEditedRanges: [],
        recentlyVisitedRanges: [],
        ...input,
      } as AutocompleteInput,
      undefined,
    );
    const elapsed = Date.now() - started;

    console.log(`\n===== ${name} =====`);
    console.log(`cursor      line ${line}, col ${character}`);
    console.log(
      `wall        ${elapsed}ms (outcome.time ${outcome?.time ?? "-"}ms)`,
    );
    if (!outcome) {
      console.log("RESULT      <no completion>");
      return outcome;
    }
    console.log(`cacheHit    ${outcome.cacheHit}`);
    console.log(`stats       ${JSON.stringify(outcome.contextStats)}`);
    console.log(`sentOpts    ${JSON.stringify(outcome.completionOptions)}`);
    console.log(`--- prompt ---\n${outcome.prompt}`);
    console.log(
      `--- completion (${outcome.numLines} line(s)) ---\n${outcome.completion}`,
    );
    return outcome;
  }

  it("reports which template the model maps to", () => {
    const t = getTemplateForModel(MODEL);
    console.log(
      `\nmodel "${MODEL}" -> template ${typeof t.template === "function" ? "fn" : "string"}, ` +
        `stop=${JSON.stringify(t.completionOptions?.stop)}`,
    );
    expect(t.completionOptions?.stop).toBeDefined();
  });

  it("completes a single-line expression mid-function", async () => {
    const outcome = await run(
      "single-line",
      "live_add.ts",
      `export function add(a: number, b: number): number {\n  return ${CURSOR}\n}\n`,
    );
    expect(outcome?.completion?.length).toBeGreaterThan(0);
  }, 60_000);

  it("completes an empty function body (multiline path)", async () => {
    const outcome = await run(
      "multiline-body",
      "live_fib.py",
      `def fibonacci(n):\n    """Return the nth Fibonacci number."""\n    ${CURSOR}\n\n\nprint(fibonacci(10))\n`,
    );
    expect(outcome?.completion?.length).toBeGreaterThan(0);
  }, 60_000);

  it("does not regenerate code already in the suffix", async () => {
    const outcome = await run(
      "suffix-overlap",
      "live_suffix.ts",
      `function getUser(id: string) {\n  if (!id) {\n    ${CURSOR}\n  }\n  return db.find(id);\n}\n`,
    );
    if (outcome?.completion) {
      expect(outcome.completion).not.toContain("return db.find(id);");
    }
  }, 60_000);

  it("shows how the timing budgets truncate a multi-line completion", async () => {
    const body = `def fibonacci(n):\n    """Return the nth Fibonacci number."""\n    ${CURSOR}\n\n\nprint(fibonacci(10))\n`;

    for (const [label, opts] of [
      ["defaults", {}],
      ["cutoff 30000 only", { showWhateverWeHaveAtXMs: 30000 }],
      ["modelTimeout 5000 only", { modelTimeout: 5000 }],
      ["both raised", { showWhateverWeHaveAtXMs: 30000, modelTimeout: 5000 }],
    ] as Array<[string, Partial<TabAutocompleteOptions>]>) {
      const outcome = await run(`timing :: ${label}`, "live_fib.py", body, {
        useCache: false,
        ...opts,
      });
      console.log(
        `TIMING  ${label.padEnd(42)} -> ${outcome?.numLines ?? 0} line(s), ${outcome?.time ?? 0}ms`,
      );
    }
  }, 120_000);

  it("picks up recently-edited / visited / opened context", async () => {
    // These three sources are supplied by the IDE layer; populate them the way
    // the VS Code trackers now do, to prove the payload reaches the prompt.
    const helperUri = joinPathsToUri(workspaceDir, "live_helper.ts");
    await testIde.writeFile(
      helperUri,
      "export function formatCurrency(cents: number): string {\n  return `$${(cents / 100).toFixed(2)}`;\n}\n",
    );
    openedFilesLruCache.clear();
    openedFilesLruCache.set(helperUri, helperUri);

    const outcome = await run(
      "cross-file-context",
      "live_cart.ts",
      `import { formatCurrency } from "./live_helper";\n\nexport function renderTotal(cents: number) {\n  return ${CURSOR}\n}\n`,
      {},
      {
        recentlyEditedRanges: [
          {
            filepath: helperUri,
            range: {
              start: { line: 0, character: 0 },
              end: { line: 2, character: 0 },
            },
            timestamp: Date.now(),
            lines: [
              "export function formatCurrency(cents: number): string {",
              "  return `$${(cents / 100).toFixed(2)}`;",
              "}",
            ],
            symbols: new Set<string>(["formatCurrency", "cents"]),
          },
        ],
        recentlyVisitedRanges: [
          {
            filepath: helperUri,
            content: "export function formatCurrency(cents: number): string {",
            type: AutocompleteSnippetType.Code,
          } as any,
        ],
      },
    );

    const stats = outcome?.contextStats;
    console.log("\ncontext source check:", JSON.stringify(stats, null, 2));
    expect(stats?.recentlyEdited).toBeGreaterThan(0);
    expect(stats?.recentlyVisited).toBeGreaterThan(0);
    expect(stats?.recentlyOpened).toBeGreaterThan(0);
  }, 60_000);
});
