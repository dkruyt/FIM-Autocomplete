import { LLMOptions } from "../..";

import OpenAI from "./OpenAI";

/**
 * Upstream Continue sent `kindo-token-transaction-type: CONTINUE`, an
 * attribution tag Kindo issued to them. We send our own rather than claim
 * theirs. If Kindo doesn't recognise it, override with a value they issue you:
 *
 *   "fim.model": {
 *     "provider": "kindo",
 *     "requestOptions": { "headers": { "kindo-token-transaction-type": "..." } }
 *   }
 */
class Kindo extends OpenAI {
  static providerName = "kindo";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "https://llm.kindo.ai/v1/",
    requestOptions: {
      headers: {
        "kindo-token-transaction-type": "FIM_AUTOCOMPLETE",
      },
    },
  };
}

export default Kindo;
