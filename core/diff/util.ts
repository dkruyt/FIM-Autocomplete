import { ChatMessage } from "../index.js";
import { renderChatMessage } from "../util/messageContent.js";

export type LineStream = AsyncGenerator<string>;

/**
 * Convert a stream of arbitrary chunks to a stream of lines
 */
export async function* streamLines(
  streamCompletion: AsyncGenerator<string | ChatMessage>,
  log: boolean = false,
): LineStream {
  let allLines = [];

  let buffer = "";

  try {
    for await (const update of streamCompletion) {
      const chunk =
        typeof update === "string" ? update : renderChatMessage(update);
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        yield line;
        allLines.push(line);
      }

      // if (buffer === "" && chunk.endsWith("\n")) {
      //   yield "";
      //   allLines.push("");
      // }
    }
    if (buffer.length > 0) {
      yield buffer;
      allLines.push(buffer);
    }
  } finally {
    if (log) {
      console.log("Streamed lines: ", allLines.join("\n"));
    }
  }
}
