import { describe, expect, it, vi } from "vitest";

import { createMockSampleWorkspace } from "../../client/mock-project-os-api-client.js";
import { ProjectOSSettingsSchema } from "../../contracts/settings.js";
import {
  ProjectOSWorkspaceStore,
  type LoadedProjectOSWorkspace,
} from "../../persistence/index.js";
import { createMcpAuthRef, InMemorySecretStore } from "../../persistence/secret-store.js";
import { ProjectOSLocalApi } from "../project-os-local-api.js";
import { McpSessionManager } from "./mcp-session-manager.js";

describe("ProjectOSLocalApi MCP surface", () => {
  it("saves, lists, tests, refreshes, and deletes MCP servers", async () => {
    const workspace = createMockSampleWorkspace();
    const secrets = new InMemorySecretStore();
    const listTools = vi.fn(async () => ({
      tools: [
        {
          name: "search",
          description: "Search docs",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    }));
    const close = vi.fn(async () => undefined);
    const manager = new McpSessionManager({
      connect: async () => ({
        client: { listTools } as never,
        close,
      }),
    });
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: workspace.workspaceRoot,
      workspaceStore: new InMemoryStore(workspace),
      secretStore: secrets,
      mcpSessionManager: manager,
    });
    const project = await api.openSampleWorkspace();

    const saved = await api.saveMcpServer(project.projectId, {
      config: {
        id: "docs",
        name: "Docs",
        enabled: true,
        transport: "http",
        url: "https://mcp.example.test/mcp",
      },
      authToken: "super-secret-token",
    });
    expect(saved.mcpServers).toEqual([
      expect.objectContaining({
        id: "docs",
        authRef: createMcpAuthRef("docs"),
      }),
    ]);
    expect(JSON.stringify(saved)).not.toContain("super-secret-token");
    expect(await secrets.get(createMcpAuthRef("docs"))).toBe("super-secret-token");
    expect(await api.listMcpServers(project.projectId)).toHaveLength(1);

    const tools = await api.refreshMcpTools(project.projectId, "docs");
    expect(tools).toEqual([
      expect.objectContaining({ name: "search", description: "Search docs" }),
    ]);
    const test = await api.testMcpServer(project.projectId, "docs");
    expect(test.ok).toBe(true);
    expect(test.message).toContain("1 tool");

    await api.deleteMcpServer(project.projectId, "docs");
    expect(await api.listMcpServers(project.projectId)).toEqual([]);
    expect(await secrets.has(createMcpAuthRef("docs"))).toBe(false);
    expect(close).toHaveBeenCalled();
  });

  it("reports honest failures when MCP tools cannot be listed", async () => {
    const workspace = createMockSampleWorkspace();
    const manager = new McpSessionManager({
      connect: async () => {
        throw new Error("boom");
      },
    });
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: workspace.workspaceRoot,
      workspaceStore: new InMemoryStore(workspace),
      mcpSessionManager: manager,
    });
    const project = await api.openSampleWorkspace();
    await api.saveMcpServer(project.projectId, {
      config: {
        id: "docs",
        name: "Docs",
        enabled: true,
        transport: "stdio",
        command: "node",
      },
    });
    const result = await api.testMcpServer(project.projectId, "docs");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("boom");
  });
});

class InMemoryStore extends ProjectOSWorkspaceStore {
  constructor(private workspace: LoadedProjectOSWorkspace) {
    super();
  }

  override loadWorkspace(workspaceRoot: string): LoadedProjectOSWorkspace {
    return {
      ...this.workspace,
      workspaceRoot,
      projectOSRoot: `${workspaceRoot}/.projectos`,
    };
  }

  override writeSettings(
    _workspaceRoot: string,
    settings: LoadedProjectOSWorkspace["settings"],
  ) {
    this.workspace.settings = ProjectOSSettingsSchema.parse(settings);
    return this.workspace.settings;
  }
}
