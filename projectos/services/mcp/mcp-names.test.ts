import { describe, expect, it } from "vitest";

import { formatMcpToolName, parseMcpToolName } from "./mcp-names.js";

describe("mcp tool names", () => {
  it("formats and parses qualified names", () => {
    expect(formatMcpToolName("docs", "search")).toBe("mcp:docs:search");
    expect(parseMcpToolName("mcp:docs:search")).toEqual({
      serverId: "docs",
      toolName: "search",
    });
    expect(parseMcpToolName("mcp:docs:nested:tool")).toEqual({
      serverId: "docs",
      toolName: "nested:tool",
    });
  });

  it("rejects malformed names", () => {
    expect(parseMcpToolName("docs:search")).toBeNull();
    expect(parseMcpToolName("mcp:")).toBeNull();
    expect(parseMcpToolName("mcp:docs")).toBeNull();
    expect(parseMcpToolName("mcp:docs:")).toBeNull();
  });
});
