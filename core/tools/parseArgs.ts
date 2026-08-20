import { ToolCallDelta } from "..";

export function safeParseToolCallArgs(
  toolCall: ToolCallDelta,
): Record<string, any> {
  const args = toolCall.function?.arguments;

  if (
    args &&
    typeof args === "object" &&
    !Array.isArray(args) &&
    Object.keys(args).length > 0
  ) {
    return args;
  }

  try {
    return JSON.parse(toolCall.function?.arguments?.trim() || "{}");
  } catch (e) {
    //console.error(
    //  `Failed to parse tool call arguments:\nTool call: ${toolCall.function?.name + " " + toolCall.id}\nArgs:${toolCall.function?.arguments}\n`,
    //);
    return {};
  }
}
