/**
 * A prompt must never reach the wire empty.
 *
 * The autocomplete prompt budget is `contextLength - reservedOutputTokens -
 * safetyBuffer`. That used to reserve the shared 4096-token chat default, so
 * any model whose context was at or below ~4100 produced a non-positive budget;
 * `pruneStringFromTop` then sliced past the end of the token array and returned
 * "", and the request went out with `"prompt": ""`. The model answered with
 * noise and nothing in the logs said why.
 *
 * These run the real CompletionProvider against a local capture server, so the
 * assertions are about the exact bytes sent.
 */
import * as http from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { llmFromProviderAndOptions } from "../llm/llms";
import { CompletionProvider } from "./CompletionProvider";
import { testConfig, testIde } from "../test/fixtures";
import { setUpTestDir, tearDownTestDir } from "../test/testDir";
import { joinPathsToUri } from "../util/uri";
import { AutocompleteInput } from "./util/types";

const CURSOR = "<|cursor|>";
const SOURCE = `export function add(a: number, b: number): number {\n  return ${CURSOR}\n}\n`;

describe("autocomplete never posts an empty prompt", () => {
  let server: http.Server;
  let port: number;
  let workspaceDir: string;
  const captured: any[] = [];

  beforeAll(async () => {
    setUpTestDir();
    [workspaceDir] = await testIde.getWorkspaceDirs();
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        captured.push(JSON.parse(body || "{}"));
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(
          `data: ${JSON.stringify({ choices: [{ text: "a + b;" }] })}\n\n`,
        );
        res.write("data: [DONE]\n\n");
        res.end();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as any).port;
  });
  afterAll(() => {
    server.close();
    tearDownTestDir();
  });

  async function complete(contextLength: number | undefined) {
    captured.length = 0;
    const llm = llmFromProviderAndOptions(
      "openai" as any,
      {
        model: "mellum-4b-sft-all",
        title: "t",
        apiBase: `http://127.0.0.1:${port}/v1`,
        apiKey: "x",
        ...(contextLength === undefined ? {} : { contextLength }),
        uniqueId: "fim",
      } as any,
    );

    const [prefix] = SOURCE.split(CURSOR);
    const fileUri = joinPathsToUri(workspaceDir, "b11.ts");
    await testIde.writeFile(fileUri, SOURCE.replace(CURSOR, ""));

    const errors: any[] = [];
    const provider = new CompletionProvider(
      testConfig({ debounceDelay: 0, useCache: false }),
      testIde,
      async () => llm,
      (e) => errors.push(e),
      async () => [],
    );
    const line = prefix.split("\n").length - 1;
    await provider.provideInlineCompletionItems(
      {
        isUntitledFile: false,
        completionId: `b11-${contextLength}-${Date.now()}`,
        filepath: fileUri,
        pos: { line, character: prefix.split("\n")[line].length },
        recentlyEditedRanges: [],
        recentlyVisitedRanges: [],
      } as unknown as AutocompleteInput,
      undefined,
    );
    return { sent: captured[0], errors };
  }

  // 2048 and 4096 are the cases that used to post `"prompt": ""`: with the old
  // 4096-token reservation their budget was negative.
  for (const contextLength of [undefined, 32768, 8192, 5200, 4096, 2048]) {
    it(`sends a non-empty prompt at contextLength=${contextLength}`, async () => {
      const { sent } = await complete(contextLength);
      expect(sent).toBeDefined();
      expect(sent.prompt.length).toBeGreaterThan(0);
      expect(sent.prompt).toContain("<fim_middle>");
    }, 30_000);
  }

  it("reserves ghost-text-sized output, not the 4096-token chat default", async () => {
    const { sent } = await complete(undefined);
    expect(sent.max_tokens).toBe(512);
  }, 30_000);

  it("reports an error rather than posting an empty prompt when the budget cannot be met", async () => {
    // 512 reserved + ~10 safety buffer leaves nothing at all here.
    const { sent, errors } = await complete(400);
    expect(sent).toBeUndefined();
    expect(errors.length).toBeGreaterThan(0);
    expect(String(errors[0]?.message ?? errors[0])).toMatch(
      /context|budget|prune/i,
    );
  }, 30_000);
});
