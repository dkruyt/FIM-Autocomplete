export const BRACKETS: { [key: string]: string } = {
  "(": ")",
  "{": "}",
  "[": "]",
};
export const BRACKETS_REVERSE: { [key: string]: string } = {
  ")": "(",
  "}": "{",
  "]": "[",
};
/**
 * Brackets left open by `text`, outermost first.
 *
 * A closing bracket that matches nothing is ignored rather than treated as an
 * error: source mid-edit is routinely unbalanced, and the point here is only to
 * know what the completion is allowed to close.
 */
export function unmatchedOpeningBrackets(text: string): string[] {
  const stack: string[] = [];
  for (const char of text) {
    if (BRACKETS[char]) {
      stack.push(char);
    } else if (BRACKETS_REVERSE[char]) {
      if (stack.length > 0 && BRACKETS[stack[stack.length - 1]] === char) {
        stack.pop();
      }
    }
  }
  return stack;
}

/**
 * Stops a completion at a closing bracket that closes nothing.
 *
 * "Nothing" means neither the completion itself nor the code before the cursor:
 * finishing a block the prefix opened is the single most common multi-line
 * completion there is, so the prefix's open brackets seed the stack.
 *
 * This used to seed only from the previously accepted completion, which was a
 * strictly weaker version of the same idea -- an accepted completion becomes
 * part of the prefix, so scanning the prefix subsumes it -- and it was wired to
 * JSON alone. Reading the prefix instead makes it correct for real code, which
 * is what allows it to be applied to every bracket language.
 */
export class BracketMatchingService {
  async *stopOnUnmatchedClosingBracket(
    stream: AsyncGenerator<string>,
    prefix: string,
    suffix: string,
    multiline: boolean, // Whether this is a multiline completion or not
  ): AsyncGenerator<string> {
    let stack: string[] = [];
    if (multiline) {
      // Whatever the code above the cursor left open, the completion may close.
      stack = unmatchedOpeningBrackets(prefix);
    } else {
      // If single line completion, then allow completing bracket pairs that are
      // started on the current line but not finished on the current line
      if (!multiline) {
        const currentLine =
          (prefix.split("\n").pop() ?? "") + (suffix.split("\n")[0] ?? "");
        for (let i = 0; i < currentLine.length; i++) {
          const char = currentLine[i];
          if (Object.keys(BRACKETS).includes(char)) {
            // It's an opening bracket
            stack.push(char);
          } else if (Object.values(BRACKETS).includes(char)) {
            // It's a closing bracket
            if (stack.length === 0 || BRACKETS[stack.pop()!] !== char) {
              break;
            }
          }
        }
      }
    }

    // Add corresponding open brackets from suffix to stack
    // because we overwrite them and the diff is displayed, and this allows something to be edited after that
    for (let i = 0; i < suffix.length; i++) {
      if (suffix[i] === " ") {
        continue;
      }
      const openBracket = BRACKETS_REVERSE[suffix[i]];
      if (!openBracket) {
        break;
      }
      stack.unshift(openBracket);
    }

    let all = "";
    let seenNonWhitespaceOrClosingBracket = false;
    for await (let chunk of stream) {
      // Allow closing brackets before any non-whitespace characters
      if (!seenNonWhitespaceOrClosingBracket) {
        const firstNonWhitespaceOrClosingBracketIndex =
          chunk.search(/[^\s\)\}\]]/);
        if (firstNonWhitespaceOrClosingBracketIndex !== -1) {
          yield chunk.slice(0, firstNonWhitespaceOrClosingBracketIndex);
          chunk = chunk.slice(firstNonWhitespaceOrClosingBracketIndex);
          seenNonWhitespaceOrClosingBracket = true;
        } else {
          yield chunk;
          continue;
        }
      }

      all += chunk;
      const allLines = all.split("\n");
      for (let i = 0; i < chunk.length; i++) {
        const char = chunk[i];
        if (Object.values(BRACKETS).includes(char)) {
          // It's a closing bracket
          if (stack.length === 0 || BRACKETS[stack.pop()!] !== char) {
            // If the stack is empty or the top of the stack doesn't match the current closing bracket
            yield chunk.slice(0, i);
            return; // Stop the generator if the closing bracket doesn't have a matching opening bracket in the stream
          }
        } else if (Object.keys(BRACKETS).includes(char)) {
          // It's an opening bracket
          stack.push(char);
        }
      }
      yield chunk;
    }
  }
}
