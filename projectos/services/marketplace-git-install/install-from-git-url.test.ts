import { describe, expect, it, vi } from "vitest";
import { installFromGitUrl } from "./install-from-git-url.js";
import { createDefaultSettings } from "../../contracts/settings.js";

const baseSettings = createDefaultSettings("p1");

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
