import { describe, expect, it, vi } from "vitest";

import { executeMcpToolCall, MCP_TOOL_RESULT_MAX_CHARS } from "./mcp-execute.js";

describe("mcp execute", () => {
  it("calls the underlying client and redacts output", async () => {
    const callTool = vi.fn(async () => ({
      content: [{ type: "text", text: "ok /Users/secret/path token=sk-abcdefghijklmnopqrstuvwxyz012345" }],
    }));
    const result = await executeMcpToolCall({
      call: {
        id: "call_1",
        name: "mcp:docs:search",
        arguments: JSON.stringify({ query: "x" }),
      },
      getClient: async () => ({ callTool } as never),
    });
    expect(callTool).toHaveBeenCalledWith(
      { name: "search", arguments: { query: "x" } },
      undefined,
      undefined,
    );
    expect(result.isError).toBeUndefined();
    expect(result.content).toContain("[PATH]");
    expect(result.content).not.toContain("/Users/secret");
  });

  it("truncates oversized results and rejects bad names", async () => {
    const huge = "x".repeat(MCP_TOOL_RESULT_MAX_CHARS + 50);
    const result = await executeMcpToolCall({
      call: {
        id: "call_2",
        name: "mcp:docs:search",
        arguments: "{}",
      },
      getClient: async () => ({
        callTool: async () => ({ content: [{ type: "text", text: huge }] }),
      } as never),
    });
    expect(result.content).toContain("…[truncated]");

    const bad = await executeMcpToolCall({
      call: { id: "c", name: "not-mcp", arguments: "{}" },
      getClient: async () => {
        throw new Error("should not connect");
      },
    });
    expect(bad.isError).toBe(true);
  });
});
