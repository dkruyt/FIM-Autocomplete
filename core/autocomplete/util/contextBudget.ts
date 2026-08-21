import { ILLM, TabAutocompleteOptions } from "../..";
import { getTokenCountingBufferSafety } from "../../llm/countTokens";

/**
 * Never shrink the prompt below this, however small the model claims to be.
 * A caret window of a few hundred tokens is the floor at which completions are
 * still worth requesting; below it, failing loudly is more useful than sending
 * a prompt with no context in it.
 */
export const MIN_PROMPT_TOKENS = 256;

/**
 * Resolve the prompt budget against the model actually being used.
 *
 * `maxPromptTokens` is a user preference, not a fact about the model: it caps
 * the caret window and, through `getRemainingTokenCount`, the snippet budget on
 * top of it. Left unchecked it can exceed what the model can hold, which is how
 * an oversized prompt reaches an endpoint that then silently truncates it --
 * usually from the wrong end, discarding the code nearest the cursor.
 *
 * So the effective budget is the smaller of what the user asked for and what
 * the model can hold once the completion's own tokens are reserved.
 */
export function resolveContextBudget(
  options: TabAutocompleteOptions,
  llm: Pick<ILLM, "contextLength">,
): TabAutocompleteOptions {
  const modelCeiling =
    llm.contextLength -
    options.maxCompletionTokens -
    getTokenCountingBufferSafety(llm.contextLength);

  const maxPromptTokens = Math.max(
    MIN_PROMPT_TOKENS,
    Math.min(options.maxPromptTokens, Math.floor(modelCeiling)),
  );

  if (maxPromptTokens === options.maxPromptTokens) {
    return options;
  }
  return { ...options, maxPromptTokens };
}
