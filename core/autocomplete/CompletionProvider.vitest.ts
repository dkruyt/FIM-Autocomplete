import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import MockLLM from "../llm/llms/Mock";
import { testConfig, testIde } from "../test/fixtures";
import { setUpTestDir, tearDownTestDir } from "../test/testDir";
import { joinPathsToUri } from "../util/uri";

import { CompletionProvider } from "./CompletionProvider";
import { AutocompleteInput } from "./util/types";

describe("CompletionProvider caching", () => {
  let llm: MockLLM;
  let provider: CompletionProvider;
  let fileUri: string;

  beforeAll(() => setUpTestDir());
  afterAll(() => tearDownTestDir());

  const PREFIX = "function add(a: number, b: number) {\n  ";
  const SUFFIX = "\n}\n";

  async function complete(completionId: string) {
    const line = PREFIX.split("\n").length - 1;
    const character = PREFIX.split("\n")[line].length;
    const input: AutocompleteInput = {
      isUntitledFile: false,
      completionId,
      filepath: fileUri,
      pos: { line, character },
      recentlyEditedRanges: [],
      recentlyVisitedRanges: [],
    };
    return provider.provideInlineCompletionItems(input, undefined);
  }

  beforeEach(async () => {
    llm = new MockLLM({ model: "mock" });
    llm.completion = "return a + b;";

    const [workspaceDir] = await testIde.getWorkspaceDirs();
    // Unique per run so a previously cached prefix can't satisfy this test.
    fileUri = joinPathsToUri(workspaceDir, `cacheTest-${Date.now()}.ts`);
    await testIde.writeFile(fileUri, PREFIX + SUFFIX);

    provider = new CompletionProvider(
      // Debounce would otherwise add 350ms per call for no benefit here.
      testConfig({ debounceDelay: 0 }),
      testIde,
      async () => llm,
      () => {},
      async () => [],
    );
  });

  it("misses on the first request and hits on an identical repeat", async () => {
    const first = await complete("first");
    expect(first?.completion).toEqual("return a + b;");
    expect(first?.cacheHit).toBe(false);

    // If the cache is working, this value must NOT reach the caller: the second
    // request should be served from the entry the first one wrote. Before the
    // key fix, the write used the compiled prefix (snippet blob + a
    // `// path/to/file` comment) while the read used the raw pruned prefix, so
    // the lookup could never match and every request was a miss.
    llm.completion = "throw new Error('cache was bypassed');";

    const second = await complete("second");
    expect(second?.cacheHit).toBe(true);
    expect(second?.completion).toEqual("return a + b;");
  });

  // Note: this only asserts `cacheHit`, not the completion text. A repeated
  // request is also served by GeneratorReuseManager, which replays the buffered
  // output of the previous generation regardless of the cache setting -- so the
  // text is expected to be identical either way.
  it("does not consult the cache when useCache is disabled", async () => {
    provider = new CompletionProvider(
      testConfig({ debounceDelay: 0, useCache: false }),
      testIde,
      async () => llm,
      () => {},
      async () => [],
    );

    const first = await complete("no-cache-first");
    expect(first?.cacheHit).toBe(false);

    const second = await complete("no-cache-second");
    expect(second?.cacheHit).toBe(false);
  });
});
