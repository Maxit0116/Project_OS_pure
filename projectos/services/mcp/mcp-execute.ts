import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

import type { ModelToolCall } from "../../contracts/model-gateway.js";
import type { ModelToolExecutionResult } from "../model-gateway/gateway.js";
import { redactText } from "../model-gateway/redaction.js";
import { parseMcpToolName } from "./mcp-names.js";

export const MCP_TOOL_RESULT_MAX_CHARS = 32_000;

export async function executeMcpToolCall(input: {
  call: ModelToolCall;
  getClient: (serverId: string) => Promise<Client>;
  signal?: AbortSignal;
}): Promise<ModelToolExecutionResult> {
  const parsed = parseMcpToolName(input.call.name);
  if (!parsed) {
    return {
      isError: true,
      content: `Invalid MCP tool name '${input.call.name}'`,
    };
  }
  if (input.signal?.aborted) {
    return { isError: true, content: "MCP tool call was cancelled" };
  }

  let args: Record<string, unknown> = {};
  try {
    const raw = JSON.parse(input.call.arguments) as unknown;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return { isError: true, content: "Tool arguments must be a JSON object" };
    }
    args = raw as Record<string, unknown>;
  } catch (error) {
    return {
      isError: true,
      content: `Invalid tool arguments JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  try {
    const client = await input.getClient(parsed.serverId);
    const result = await client.callTool(
      { name: parsed.toolName, arguments: args },
      undefined,
      input.signal ? { signal: input.signal } : undefined,
    );
    const text = serializeMcpToolResult(result);
    const truncated = text.length > MCP_TOOL_RESULT_MAX_CHARS;
    const clipped = truncated ? `${text.slice(0, MCP_TOOL_RESULT_MAX_CHARS)}\n…[truncated]` : text;
    const redacted = redactText(clipped, "secrets_and_paths");
    const isError = "isError" in result && result.isError === true;
    return { content: redacted, ...(isError ? { isError: true } : {}) };
  } catch (error) {
    return {
      isError: true,
      content: redactText(
        error instanceof Error ? error.message : String(error),
        "secrets_and_paths",
      ),
    };
  }
}

function serializeMcpToolResult(result: unknown): string {
  if (!result || typeof result !== "object") return String(result);
  const record = result as {
    content?: unknown;
    structuredContent?: unknown;
    toolResult?: unknown;
    isError?: boolean;
  };
  if (Array.isArray(record.content)) {
    const parts: string[] = [];
    for (const part of record.content) {
      if (!part || typeof part !== "object") continue;
      const item = part as { type?: string; text?: string; mimeType?: string; uri?: string };
      if (item.type === "text" && typeof item.text === "string") {
        parts.push(item.text);
      } else if (item.type === "image") {
        parts.push(`[image ${item.mimeType ?? "unknown"}]`);
      } else if (item.type === "audio") {
        parts.push(`[audio ${item.mimeType ?? "unknown"}]`);
      } else if (item.type === "resource" || item.type === "resource_link") {
        parts.push(`[resource ${item.uri ?? item.mimeType ?? "unknown"}]`);
      }
    }
    if (parts.length > 0) return parts.join("\n");
  }
  if (record.structuredContent !== undefined) {
    return JSON.stringify(record.structuredContent);
  }
  if ("toolResult" in record) {
    return JSON.stringify(record.toolResult);
  }
  return JSON.stringify(result);
}
