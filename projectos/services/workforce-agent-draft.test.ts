import { describe, expect, it } from "vitest";

import { draftWorkforceAgentFromPrompt } from "./workforce-agent-draft.js";

describe("draftWorkforceAgentFromPrompt", () => {
  it("infers role, skills, and read-only notes from natural language", () => {
    const result = draftWorkforceAgentFromPrompt({
      prompt:
        "Create a security review agent called Sentinel that is read-only and uses the reverse-engineer skill.",
      skills: [
        {
          id: "reverse-engineer-anything",
          name: "Reverse Engineer Anything",
          description: "RE",
          rootPath: ".projectos/skills/reverse-engineer-anything",
          skillFilePath: ".projectos/skills/reverse-engineer-anything/SKILL.md",
        },
      ],
      mcpServers: [{ id: "semgrep", name: "Semgrep" }],
    });
    expect(result.draft.displayName).toMatch(/Sentinel/i);
    expect(result.draft.roleLabel).toBe("Security");
    expect(result.draft.skillIds).toContain("reverse-engineer-anything");
    expect(result.draft.permissionNotes).toMatch(/read-only/i);
    expect(result.draft.instructions.length).toBeGreaterThan(20);
  });

  it("matches MCP servers by name when mentioned", () => {
    const result = draftWorkforceAgentFromPrompt({
      prompt: "QA agent that uses Semgrep MCP for scanning.",
      mcpServers: [{ id: "semgrep", name: "Semgrep" }],
    });
    expect(result.draft.roleLabel).toBe("QA");
    expect(result.draft.mcpServerIds).toContain("semgrep");
  });
});
