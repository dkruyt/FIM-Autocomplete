import { TabAutocompleteOptions } from "../index.js";

export const DEFAULT_AUTOCOMPLETE_OPTS: TabAutocompleteOptions = {
  disable: false,
  // Was 1024, which left a caret window of only ~307 prefix + ~205 suffix
  // tokens. Clamped down at runtime by resolveContextBudget when the model
  // cannot hold this much.
  maxPromptTokens: 2048,
  // Ghost text is a few lines, not an essay. The shared LLM default reserves
  // 4096 output tokens, which both wastes prompt budget and -- on any model
  // whose context is at or below that -- drives the prompt budget negative and
  // silently blanks the request. See renderPromptWithTokenLimit.
  maxCompletionTokens: 512,
  // Conservative on purpose: at 0.35 only completions failing more than
  // one signal are dropped. The right value depends on the model, so the
  // score is reported in the fim.debug channel for tuning against real use.
  confidenceThreshold: 0.35,
  prefixPercentage: 0.3,
  maxSuffixPercentage: 0.2,
  debounceDelay: 350,
  // Multiplied by HARD_STOP_TIMEOUT_MULTIPLIER (2.5) to cap generation time.
  // At the old 150ms this fired routinely against any non-local endpoint and
  // truncated completions mid-expression; it is meant as an emergency brake.
  modelTimeout: 1000,
  multilineCompletions: "auto",
  // @deprecated TO BE REMOVED
  slidingWindowPrefixPercentage: 0.75,
  // @deprecated TO BE REMOVED
  slidingWindowSize: 500,
  useCache: true,
  onlyMyCode: true,
  useRecentlyEdited: true,
  useRecentlyOpened: true,
  useDiagnostics: true,
  disableInFiles: undefined,
  useImports: true,
  transform: true,
  showWhateverWeHaveAtXMs: 300,
  // Experimental options: true = enabled, false = disabled, number = enabled w priority
  experimental_includeClipboard: false,
  experimental_includeRecentlyVisitedRanges: true,
  experimental_includeRecentlyEditedRanges: true,
  experimental_enableStaticContextualization: false,
};

export const COUNT_COMPLETION_REJECTED_AFTER = 10_000;
export const DO_NOT_COUNT_REJECTED_BEFORE = 250;
