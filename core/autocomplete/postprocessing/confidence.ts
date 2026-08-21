import {
  BRACKETS,
  BRACKETS_REVERSE,
  unmatchedOpeningBrackets,
} from "../filtering/BracketMatchingService";

export interface ConfidenceSignals {
  /** 1 when the completion closes only what was open, 0 when it is full of stray closers. */
  bracketBalance: number;
  /** 1 when the completion says something new, 0 when it restates the code below the cursor. */
  suffixNovelty: number;
  /** 1 when the completion's identifiers are grounded in the surrounding code, 0 when invented. */
  contextSupport: number;
  /** Weighted combination; compare against the configured threshold. */
  score: number;
}

/**
 * Closing brackets in `completion` that close nothing -- neither something the
 * completion opened nor something left open by the prefix.
 */
export function countStrayClosers(prefix: string, completion: string): number {
  const stack = unmatchedOpeningBrackets(prefix);
  let stray = 0;
  for (const char of completion) {
    if (BRACKETS[char]) {
      stack.push(char);
    } else if (BRACKETS_REVERSE[char]) {
      if (stack.length > 0 && BRACKETS[stack[stack.length - 1]] === char) {
        stack.pop();
      } else {
        stray++;
      }
    }
  }
  return stray;
}

const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*/g;
/**
 * Keywords and one- or two-character names are not evidence of anything: `for`
 * and `return` appear in every language, and `i`, `a`, `db` are locals the
 * completion is entitled to introduce. Counting them made correct completions
 * -- a loop over a fresh accumulator, say -- look invented.
 */
const NOT_EVIDENCE = new Set([
  "if",
  "else",
  "for",
  "while",
  "do",
  "return",
  "break",
  "continue",
  "in",
  "of",
  "new",
  "this",
  "self",
  "true",
  "false",
  "null",
  "nil",
  "none",
  "let",
  "var",
  "const",
  "def",
  "fn",
  "func",
  "function",
  "class",
  "struct",
  "enum",
  "import",
  "from",
  "as",
  "and",
  "or",
  "not",
  "is",
  "try",
  "catch",
  "except",
  "finally",
  "throw",
  "raise",
  "with",
  "await",
  "async",
  "yield",
  "pass",
  "public",
  "private",
  "static",
  "void",
  "int",
  "str",
  "string",
  "bool",
  "float",
  "len",
  "range",
  "print",
  "type",
  "end",
  "then",
  "elif",
  "switch",
  "case",
  "default",
  "match",
  "where",
  "select",
]);
/** How many lines of the suffix to compare against; beyond this, overlap is coincidence. */
const SUFFIX_LINES_TO_COMPARE = 30;

function identifiers(text: string): string[] {
  return text.match(IDENTIFIER) ?? [];
}

/** Identifiers substantial enough that seeing one somewhere else means something. */
function meaningfulIdentifiers(text: string): string[] {
  return identifiers(text).filter(
    (id) => id.length > 2 && !NOT_EVIDENCE.has(id.toLowerCase()),
  );
}

/**
 * Rate how much a completion looks like something to show the user.
 *
 * Three signals, weighted by how much they can be trusted:
 *
 * - **Bracket balance** is the only unambiguous one. A completion that closes a
 *   bracket nothing opened is broken code, full stop, so it carries the most
 *   weight.
 * - **Suffix novelty** catches the model regenerating the code below the
 *   cursor. Real but noisier: a completion legitimately shares short lines
 *   (`}`, `return`) with the suffix, so only substantial lines count.
 * - **Context support** is the weakest. New code introduces new names all the
 *   time, so this only registers when almost nothing in the completion is
 *   grounded in the surrounding code.
 *
 * Not included: model logprobs. The feature list calls for them, but no
 * provider in this codebase surfaces per-token logprobs through `streamFim` or
 * `streamComplete`, so there is nothing to read. Adding it means plumbing the
 * field through the provider layer first.
 */
export function scoreCompletion({
  completion,
  prefix,
  suffix,
  contextText = "",
}: {
  completion: string;
  prefix: string;
  suffix: string;
  contextText?: string;
}): ConfidenceSignals {
  const completionLines = completion
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // --- brackets ---
  const stray = countStrayClosers(prefix, completion);
  const bracketBalance = stray === 0 ? 1 : Math.max(0, 1 - stray * 0.5);

  // --- suffix novelty ---
  const suffixLines = new Set(
    suffix
      .split("\n")
      .slice(0, SUFFIX_LINES_TO_COMPARE)
      .map((l) => l.trim())
      .filter((l) => l.length >= 8),
  );
  const substantial = completionLines.filter((l) => l.length >= 8);
  const duplicated = substantial.filter((l) => suffixLines.has(l)).length;
  const suffixNovelty =
    substantial.length === 0 ? 1 : 1 - duplicated / substantial.length;

  // --- context support ---
  const known = new Set(identifiers(`${prefix}\n${suffix}\n${contextText}`));
  const used = meaningfulIdentifiers(completion);
  const supported = used.filter((id) => known.has(id)).length;
  const rawSupport = used.length === 0 ? 1 : supported / used.length;
  // Only the bottom of the range is meaningful, so flatten everything above it.
  const contextSupport = Math.min(1, rawSupport / 0.4);

  const score =
    0.5 * bracketBalance + 0.3 * suffixNovelty + 0.2 * contextSupport;

  return { bracketBalance, suffixNovelty, contextSupport, score };
}
