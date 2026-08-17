import { LLMOptions } from "../../index.js";

import OpenAI from "./OpenAI.js";

class TARS extends OpenAI {
  static providerName = "tars";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "https://api.router.tetrate.ai/v1",
    model: "gpt-5-mini",
    promptTemplates: {},
    useLegacyCompletionsEndpoint: false,
  };
}

export default TARS;
