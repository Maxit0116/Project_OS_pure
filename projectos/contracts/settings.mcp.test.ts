import { describe, expect, it } from "vitest";

import {
  McpServerConfigSchema,
  migrateLegacyMcpExternalAgents,
  ProjectOSSettingsSchema,
} from "./settings.js";

describe("MCP settings contracts", () => {
  it("accepts stdio and http server configs", () => {
    expect(McpServerConfigSchema.safeParse({
      id: "local",
      name: "Local",
      enabled: false,
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    }).success).toBe(true);
    expect(McpServerConfigSchema.safeParse({
      id: "remote",
      name: "Remote",
      enabled: true,
      transport: "http",
      url: "https://mcp.example.test/mcp",
      authRef: "mcp_server:remote",
    }).success).toBe(true);
  });

  it("migrates valid mcpServers and drops external agents / team", () => {
    const migrated = migrateLegacyMcpExternalAgents({
      version: "0.1.0",
      projectId: "p1",
      presentationMode: false,
      execution: { mode: "external", thinkingDepth: "medium" },
      modelProfiles: [],
      agentProfiles: [],
      externalAgents: [{ id: "ea" }],
      team: { activePersonId: "x" },
      mcpServers: [
        { id: "docs", transport: "stdio", command: "npx" },
        { id: "broken", transport: "http" },
        { id: "sse-legacy", transport: "sse", url: "https://mcp.example.test/sse" },
      ],
    }) as Record<string, unknown>;

    expect(migrated.externalAgents).toBeUndefined();
    expect(migrated.team).toBeUndefined();
    expect((migrated.execution as { mode: string }).mode).toBe("auto");
    const servers = migrated.mcpServers as Array<{ id: string; transport: string; enabled: boolean }>;
    expect(servers.map((s) => s.id).sort()).toEqual(["docs", "sse-legacy"]);
    expect(servers.find((s) => s.id === "docs")?.enabled).toBe(false);
    expect(servers.find((s) => s.id === "sse-legacy")?.transport).toBe("http");
    expect(ProjectOSSettingsSchema.safeParse(migrated).success).toBe(true);
  });
});
