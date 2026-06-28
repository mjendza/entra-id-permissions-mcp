/** Shared MCP tool-result helpers so every handler returns a consistent shape. */

export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  // The MCP SDK's CallToolResult carries an open index signature; mirror it so
  // these helpers satisfy the registerTool handler return type.
  [key: string]: unknown;
}

/** Success: pretty-printed JSON payload. */
export function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/** Failure: a plain message flagged with isError so clients can distinguish it. */
export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
