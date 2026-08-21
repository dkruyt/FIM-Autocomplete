import Handlebars from "handlebars";

import { CompletionOptions } from "../..";
import { AutocompleteLanguageInfo } from "../constants/AutocompleteLanguageInfo";
import { HelperVars } from "../util/HelperVars";

import { ILLM } from "../../index.js";
import {
  countTokens,
  getTokenCountingBufferSafety,
  pruneLinesFromBottom,
  pruneLinesFromTop,
} from "../../llm/countTokens";
import { DEFAULT_AUTOCOMPLETE_OPTS } from "../../util/parameters";
import { getUriPathBasename } from "../../util/uri";
import { SnippetPayload } from "../snippets";
import { AutocompleteSnippet } from "../snippets/types";
import {
  AutocompleteTemplate,
  getTemplateForModel,
} from "./AutocompleteTemplate";
import { getSnippets } from "./filtering";
import { formatSnippets } from "./formatting";
import { getStopTokens } from "./getStopTokens";

function getTemplate(helper: HelperVars): AutocompleteTemplate {
  if (helper.options.template) {
    // A custom template still targets the same model, so keep that model's stop
    // tokens. Dropping them let generation run until the hard processing
    // timeout aborted it mid-stream, which surfaced as client disconnections in
    // provider logs. Users can still add their own via `completionOptions.stop`
    // (mergeJson concatenates arrays).
    const modelTemplate = getTemplateForModel(helper.modelName);
    return {
      template: helper.options.template,
      completionOptions: modelTemplate.completionOptions,
      compilePrefixSuffix: undefined,
    };
  }
  return getTemplateForModel(helper.modelName);
}

function renderStringTemplate(
  template: string,
  prefix: string,
  suffix: string,
  lang: AutocompleteLanguageInfo,
  filepath: string,
  reponame: string,
) {
  const filename = getUriPathBasename(filepath);
  const compiledTemplate = Handlebars.compile(template);

  return compiledTemplate({
    prefix,
    suffix,
    filename,
    reponame,
    language: lang.name,
  });
}

/** Consolidates shared setup between renderPrompt and renderPromptWithTokenLimit. */
function preparePromptContext({
  snippetPayload,
  workspaceDirs,
  helper,
}: {
  snippetPayload: SnippetPayload;
  workspaceDirs: string[];
  helper: HelperVars;
}): {
  prefix: string;
  suffix: string;
  reponame: string;
  template: AutocompleteTemplate["template"];
  compilePrefixSuffix: AutocompleteTemplate["compilePrefixSuffix"] | undefined;
  completionOptions: Partial<CompletionOptions> | undefined;
  snippets: AutocompleteSnippet[];
} {
  // Determine base prefix/suffix, accounting for any manually supplied prefix.
  let prefix = helper.input.manuallyPassPrefix || helper.prunedPrefix;
  let suffix = helper.input.manuallyPassPrefix ? "" : helper.prunedSuffix;
  if (suffix === "") {
    suffix = "\n";
  }

  const reponame = getUriPathBasename(workspaceDirs[0] ?? "myproject");

  const { template, compilePrefixSuffix, completionOptions } =
    getTemplate(helper);

  const snippets = getSnippets(helper, snippetPayload);

  return {
    prefix,
    suffix,
    reponame,
    template,
    compilePrefixSuffix,
    completionOptions,
    snippets,
  };
}

export function renderPrompt({
  snippetPayload,
  workspaceDirs,
  helper,
}: {
  snippetPayload: SnippetPayload;
  workspaceDirs: string[];
  helper: HelperVars;
}): {
  prompt: string;
  prefix: string;
  suffix: string;
  completionOptions: Partial<CompletionOptions> | undefined;
} {
  const {
    prefix,
    suffix,
    reponame,
    template,
    compilePrefixSuffix,
    completionOptions,
    snippets,
  } = preparePromptContext({ snippetPayload, workspaceDirs, helper });

  // Delegate prompt construction to buildPrompt to avoid duplication.
  const {
    prompt,
    prefix: compiledPrefix,
    suffix: compiledSuffix,
  } = buildPrompt(
    template,
    compilePrefixSuffix,
    prefix,
    suffix,
    helper,
    snippets,
    workspaceDirs,
    reponame,
  );

  const stopTokens = getStopTokens(
    completionOptions,
    helper.lang,
    helper.modelName,
  );

  return {
    prompt,
    prefix: compiledPrefix,
    suffix: compiledSuffix,
    completionOptions: {
      ...completionOptions,
      maxTokens: reservedCompletionTokens(completionOptions, helper),
      stop: stopTokens,
    },
  };
}

/** Builds the final prompt by applying prefix/suffix compilation or snippet formatting, then rendering the template. */
function buildPrompt(
  template: AutocompleteTemplate["template"],
  compilePrefixSuffix: AutocompleteTemplate["compilePrefixSuffix"] | undefined,
  prefix: string,
  suffix: string,
  helper: HelperVars,
  snippets: AutocompleteSnippet[],
  workspaceDirs: string[],
  reponame: string,
): { prompt: string; prefix: string; suffix: string } {
  if (compilePrefixSuffix) {
    [prefix, suffix] = compilePrefixSuffix(
      prefix,
      suffix,
      helper.filepath,
      reponame,
      snippets,
      helper.workspaceUris,
    );
  } else {
    const formatted = formatSnippets(helper, snippets, workspaceDirs);
    prefix = [formatted, prefix].join("\n");
  }
  const prompt =
    typeof template === "string"
      ? renderStringTemplate(
          template,
          prefix,
          suffix,
          helper.lang,
          helper.filepath,
          reponame,
        )
      : template(
          prefix,
          suffix,
          helper.filepath,
          reponame,
          helper.lang.name,
          snippets,
          helper.workspaceUris,
        );
  return { prompt, prefix, suffix };
}

/**
 * Output tokens to reserve for the completion. Deliberately *not*
 * `llm.completionOptions.maxTokens`, whose 4096 default is sized for chat: for
 * ghost text that both wastes prompt budget and, on a model whose context is at
 * or below the reservation, drives the prompt budget negative.
 */
function reservedCompletionTokens(
  completionOptions: Partial<CompletionOptions> | undefined,
  helper: HelperVars,
): number {
  const reserved =
    completionOptions?.maxTokens ?? helper.options.maxCompletionTokens;
  // A missing or nonsensical value must not become NaN: every downstream
  // comparison against NaN is false, so a negative budget would sail past the
  // guard below and prune the prompt to "".
  return Number.isFinite(reserved) && reserved > 0
    ? reserved
    : DEFAULT_AUTOCOMPLETE_OPTS.maxCompletionTokens;
}

/**
 * Tokens the prompt may occupy, after reserving room for the completion itself
 * and the token-counting safety buffer.
 *
 * Can go non-positive when the model's context is small relative to the
 * reservation. Callers must handle that: pruning to a non-positive budget
 * yields an empty prompt, and an empty prompt reaches the wire as a request the
 * model can only answer with noise.
 */
function maxAllowedPromptTokens(llm: ILLM, reservedTokens: number): number {
  return (
    llm.contextLength -
    reservedTokens -
    getTokenCountingBufferSafety(llm.contextLength)
  );
}

function pruneLength(
  llm: ILLM,
  prompt: string,
  reservedTokens: number,
): number {
  const promptTokenCount = countTokens(prompt, llm.model);
  return promptTokenCount - maxAllowedPromptTokens(llm, reservedTokens);
}

export function renderPromptWithTokenLimit({
  snippetPayload,
  workspaceDirs,
  helper,
  llm,
}: {
  snippetPayload: SnippetPayload;
  workspaceDirs: string[];
  helper: HelperVars;
  llm: ILLM | undefined;
}): {
  prompt: string;
  prefix: string;
  suffix: string;
  completionOptions: Partial<CompletionOptions> | undefined;
} {
  const {
    prefix: initialPrefix,
    suffix: initialSuffix,
    reponame,
    template,
    compilePrefixSuffix,
    completionOptions,
    snippets,
  } = preparePromptContext({ snippetPayload, workspaceDirs, helper });

  // We'll mutate prefix/suffix during pruning, so copy them.
  let prefix = initialPrefix;
  let suffix = initialSuffix;

  let {
    prompt,
    prefix: compiledPrefix,
    suffix: compiledSuffix,
  } = buildPrompt(
    template,
    compilePrefixSuffix,
    prefix,
    suffix,
    helper,
    snippets,
    workspaceDirs,
    reponame,
  );

  const reservedTokens = reservedCompletionTokens(completionOptions, helper);

  // Truncate prefix and suffix if prompt tokens exceed maxAllowedPromptTokens
  if (llm) {
    if (maxAllowedPromptTokens(llm, reservedTokens) <= 0) {
      // Nothing can be pruned into a non-positive budget. Failing loudly beats
      // pruning to "" and posting an empty prompt, which is what this looked
      // like from the outside: a request the model can only answer with noise.
      throw new Error(
        `Autocomplete context budget is negative: the model's context length ` +
          `(${llm.contextLength}) is too small to hold a prompt after reserving ` +
          `${reservedTokens} tokens for the completion. Raise fim.contextLength ` +
          `above ${reservedTokens}.`,
      );
    }
    const prune = pruneLength(llm, prompt, reservedTokens);
    if (prune > 0) {
      const tokensToDrop = prune;
      const prefixTokenCount = countTokens(prefix, helper.modelName);
      const suffixTokenCount = countTokens(suffix, helper.modelName);
      const totalContextTokens = prefixTokenCount + suffixTokenCount;
      if (totalContextTokens > 0) {
        const dropPrefix = Math.ceil(
          tokensToDrop * (prefixTokenCount / totalContextTokens),
        );
        const dropSuffix = Math.ceil(tokensToDrop - dropPrefix);
        const allowedPrefixTokens = Math.max(0, prefixTokenCount - dropPrefix);
        const allowedSuffixTokens = Math.max(0, suffixTokenCount - dropSuffix);
        prefix = pruneLinesFromTop(
          prefix,
          allowedPrefixTokens,
          helper.modelName,
        );
        suffix = pruneLinesFromBottom(
          suffix,
          allowedSuffixTokens,
          helper.modelName,
        );
      }
      ({
        prompt,
        prefix: compiledPrefix,
        suffix: compiledSuffix,
      } = buildPrompt(
        template,
        compilePrefixSuffix,
        prefix,
        suffix,
        helper,
        snippets,
        workspaceDirs,
        reponame,
      ));
    }
  }

  const stopTokens = getStopTokens(
    completionOptions,
    helper.lang,
    helper.modelName,
  );

  return {
    prompt,
    prefix: compiledPrefix,
    suffix: compiledSuffix,
    completionOptions: {
      ...completionOptions,
      maxTokens: reservedTokens,
      stop: stopTokens,
    },
  };
}
