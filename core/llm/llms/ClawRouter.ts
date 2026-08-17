import { LLMOptions } from "../../index.js";

import OpenAI from "./OpenAI.js";

// Extension version, resolved from package.json at build time
const CLIENT_VERSION = process.env.npm_package_version || "unknown";

/**
 * ClawRouter LLM Provider
 *
 * ClawRouter is an open-source LLM router that automatically selects the
 * cheapest capable model for each request based on prompt complexity,
 * providing 78-96% cost savings on blended inference costs.
 *
 * Features:
 * - 15-dimension prompt complexity scoring
 * - Automatic model selection (cheap → capable based on task)
 * - OpenAI-compatible API at localhost:1337
 * - Support for multiple routing tiers (auto, free, eco)
 *
 * @see https://github.com/BlockRunAI/ClawRouter
 */
class ClawRouter extends OpenAI {
  static providerName = "clawrouter";

  // ClawRouter can route to models that support reasoning fields
  protected supportsReasoningField = true;
  protected supportsReasoningDetailsField = true;

  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "http://localhost:1337/v1/",
    model: "blockrun/auto",
    promptTemplates: {},
    useLegacyCompletionsEndpoint: false,
  };

  /**
   * Identify ourselves so ClawRouter can track integration usage.
   */
  protected _getHeaders() {
    return {
      ...super._getHeaders(),
      "User-Agent": `FimAutocomplete/${CLIENT_VERSION}`,
      "X-Client-Provider": "clawrouter",
    };
  }
}

export default ClawRouter;
