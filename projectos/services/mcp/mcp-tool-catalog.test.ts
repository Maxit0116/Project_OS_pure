import { describe, expect, it } from "vitest";

import { buildMcpToolCatalog } from "./mcp-tool-catalog.js";

describe("mcp tool catalog", () => {
  it("includes only enabled servers with allow/ask permissions", () => {
    const catalog = buildMcpToolCatalog({
      servers: [
        {
          id: "docs",
          name: "Docs",
          enabled: true,
          transport: "stdio",
          command: "npx",
          toolAllowlist: ["search", "lookup"],
        },
        {
          id: "off",
          name: "Off",
          enabled: false,
          transport: "stdio",
          command: "npx",
        },
      ],
      toolsByServerId: new Map([
        ["docs", [
          { name: "search", description: "Search docs" },
          { name: "lookup" },
          { name: "admin" },
        ]],
        ["off", [{ name: "x" }]],
      ]),
      permissionRules: [
        { effect: "allow", tool: "mcp_tool", match: "mcp:docs:search" },
        { effect: "ask", tool: "mcp_tool", match: "mcp:docs:lookup" },
      ],
    });

    expect(catalog.map((entry) => entry.qualifiedName).sort()).toEqual([
      "mcp:docs:lookup",
      "mcp:docs:search",
    ]);
    expect(catalog[0]?.modelTool.function.name.startsWith("mcp:")).toBe(true);
  });

  it("excludes tools without permission allow/ask", () => {
    const catalog = buildMcpToolCatalog({
      servers: [{
        id: "docs",
        name: "Docs",
        enabled: true,
        transport: "stdio",
        command: "npx",
      }],
      toolsByServerId: new Map([["docs", [{ name: "search" }]]]),
      permissionRules: [],
    });
    expect(catalog).toEqual([]);
  });
});
