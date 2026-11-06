import { describe, expect, it, vi } from "vitest";
import { installFromGitUrl } from "./install-from-git-url.js";
import type { ProjectOSSettings } from "../../contracts/settings.js";

const baseSettings: ProjectOSSettings = {
  projectId: "p1",
  version: "0.1.0",
  execution: {},
  mcpServers: [],
} as ProjectOSSettings;

describe("installFromGitUrl", () => {
  it("rejects non-github hosts with agent fallback", async () => {
    const result = await installFromGitUrl(
      { url: "https://gitlab.com/acme/skill", kind: "skills" },
      {
        workspaceRoot: "/tmp/unused",
        projectOSRoot: "/tmp/unused/.projectos",
        settings: baseSettings,
        saveMcpServer: vi.fn(),
      },
    );
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.agentFallbackSuggested).toBe(true);
      expect(result.message).toMatch(/github\.com/i);
    }
  });

  it("rejects invalid urls with agent fallback", async () => {
    const result = await installFromGitUrl(
      { url: "not a url", kind: "mcp" },
      {
        workspaceRoot: "/tmp/unused",
        projectOSRoot: "/tmp/unused/.projectos",
        settings: baseSettings,
        saveMcpServer: vi.fn(),
      },
    );
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.agentFallbackSuggested).toBe(true);
    }
  });
});
