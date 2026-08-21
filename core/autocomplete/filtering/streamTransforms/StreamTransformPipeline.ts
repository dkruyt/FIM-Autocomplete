import { streamLines } from "../../../diff/util";
import { HelperVars } from "../../util/HelperVars";
import { BracketMatchingService } from "../BracketMatchingService";

import { stopAtStartOf, stopAtStopTokens } from "./charStream";
import {
  avoidEmptyComments,
  avoidPathLine,
  fixCodeLlamaFirstLineIndentation,
  noDoubleNewLine,
  showWhateverWeHaveAtXMs,
  skipPrefixes,
  stopAtLines,
  stopAtLinesExact,
  stopAtRepeatingLines,
  stopAtSimilarLine,
  streamWithNewLines,
} from "./lineStream";

const STOP_AT_PATTERNS = ["diff --git"];

export class StreamTransformPipeline {
  private readonly bracketMatchingService = new BracketMatchingService();

  async *transform(
    generator: AsyncGenerator<string>,
    prefix: string,
    suffix: string,
    multiline: boolean,
    stopTokens: string[],
    fullStop: () => void,
    helper: HelperVars,
  ): AsyncGenerator<string> {
    let charGenerator = generator;

    charGenerator = stopAtStopTokens(generator, [
      ...stopTokens,
      ...STOP_AT_PATTERNS,
    ]);
    charGenerator = stopAtStartOf(charGenerator, suffix);
    // A completion that closes a bracket it never opened is wrong in any code
    // language, so this applies everywhere except the languages that opt out.
    // It used to be attached to JSON alone, via a per-language charFilter.
    if (!helper.lang.skipBracketMatching) {
      charGenerator = this.bracketMatchingService.stopOnUnmatchedClosingBracket(
        charGenerator,
        prefix,
        suffix,
        multiline,
      );
    }

    for (const charFilter of helper.lang.charFilters ?? []) {
      charGenerator = charFilter({
        chars: charGenerator,
        prefix,
        suffix,
        filepath: helper.filepath,
        multiline,
      });
    }

    let lineGenerator = streamLines(charGenerator);

    // CodeLlama reliably prefixes its first line with two spaces of phantom
    // indentation. Model-specific, so don't apply it to anything else.
    if (helper.modelName.toLowerCase().includes("codellama")) {
      lineGenerator = fixCodeLlamaFirstLineIndentation(lineGenerator);
    }

    lineGenerator = stopAtLines(lineGenerator, fullStop);
    const lineBelowCursor = this.getLineBelowCursor(helper);
    if (lineBelowCursor.trim() !== "") {
      lineGenerator = stopAtLinesExact(lineGenerator, fullStop, [
        lineBelowCursor,
      ]);
    }
    lineGenerator = stopAtRepeatingLines(lineGenerator, fullStop);
    lineGenerator = avoidEmptyComments(
      lineGenerator,
      helper.lang.singleLineComment,
    );
    lineGenerator = avoidPathLine(lineGenerator, helper.lang.singleLineComment);
    lineGenerator = skipPrefixes(lineGenerator);
    lineGenerator = noDoubleNewLine(lineGenerator);

    for (const lineFilter of helper.lang.lineFilters ?? []) {
      lineGenerator = lineFilter({ lines: lineGenerator, fullStop });
    }

    lineGenerator = stopAtSimilarLine(
      lineGenerator,
      this.getLineBelowCursor(helper),
      fullStop,
    );

    // Deliberately NOT `modelTimeout` -- that is the request budget. This is how
    // long we let lines accumulate before showing what we already have, and it
    // has its own option (whose default was previously ignored entirely).
    lineGenerator = showWhateverWeHaveAtXMs(
      lineGenerator,
      helper.options.showWhateverWeHaveAtXMs,
    );

    const finalGenerator = streamWithNewLines(lineGenerator);
    for await (const update of finalGenerator) {
      yield update;
    }
  }

  private getLineBelowCursor(helper: HelperVars): string {
    let lineBelowCursor = "";
    let i = 1;
    while (
      lineBelowCursor.trim() === "" &&
      helper.pos.line + i <= helper.fileLines.length - 1
    ) {
      lineBelowCursor =
        helper.fileLines[
          Math.min(helper.pos.line + i, helper.fileLines.length - 1)
        ];
      i++;
    }
    return lineBelowCursor;
  }
}
