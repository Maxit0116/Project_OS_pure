import { describe, expect, it } from "vitest";

import {
  assembleWorkforceAgentFromPrompt,
  draftFromAssemblyBindings,
} from "./workforce-agent-assemble.js";

describe("assembleWorkforceAgentFromPrompt", () => {
  it("matches local skills and mcp from prompt", () => {
    const result = assembleWorkforceAgentFromPrompt({
      prompt: "Create a review agent that uses the graphify skill and github mcp",
      scope: "local",
      skills: [
        {
          id: "graphify",
          name: "Graphify",
          description: "Build architecture graphs",
          rootPath: ".projectos/skills/graphify",
          skillFilePath: ".projectos/skills/graphify/SKILL.md",
        },
        {
          id: "unrelated",
          name: "Unrelated",
          description: "Something else",
          rootPath: ".projectos/skills/unrelated",
          skillFilePath: ".projectos/skills/unrelated/SKILL.md",
        },
      ],
      mcpServers: [
        {
          id: "srv_github",
          name: "GitHub",
          trustTier: "curated",
          listingId: "curated.github",
        },
        {
          id: "srv_community",
          name: "Random Tools",
          trustTier: "community",
          listingId: "community.random",
        },
      ],
    });

    expect(result.scope).toBe("local");
    const skill = result.bindings.find((b) => b.id === "graphify");
    expect(skill?.selected).toBe(true);
    expect(skill?.installed).toBe(true);
    expect(result.draft.skillIds).toContain("graphify");

    const github = result.bindings.find((b) => b.id === "srv_github");
    expect(github?.selected).toBe(true);

    const community = result.bindings.find((b) => b.id === "srv_community");
    expect(community?.selected).toBe(false);
    expect(community?.risk).toBe("community_mcp");
  });

  it("adds catalog install_then_bind candidates when scope expands", () => {
    const result = assembleWorkforceAgentFromPrompt({
      prompt: "Need a documentation specialist with archify skill",
      scope: "local_and_catalog",
      skills: [],
      mcpServers: [],
      skillCatalog: [
        {
          id: "curated.archify",
          name: "Archify",
          description: "Architecture diagrams documentation",
          trustTier: "curated",
          version: "1.0.0",
          skillMarkdown: "---\nname: Archify\n---\n# Archify\n",
        },
        {
          id: "community.noise",
          name: "Noise",
          description: "Unrelated noise pack",
          trustTier: "community",
          version: "1.0.0",
          skillMarkdown: "---\nname: Noise\n---\n# Noise\n",
        },
      ],
    });

    const archify = result.bindings.find((b) => b.id === "curated.archify");
    expect(archify).toBeTruthy();
    expect(archify?.installed).toBe(false);
    expect(archify?.action).toBe("install_then_bind");
    expect(archify?.selected).toBe(true);
    expect(result.draft.skillIds).not.toContain("curated.archify");
  });

  it("draftFromAssemblyBindings only keeps installed selected bind targets", () => {
    const draft = draftFromAssemblyBindings({
      draft: {
        displayName: "Demo",
        instructions: "hi",
        skillIds: [],
        mcpServerIds: [],
      },
      bindings: [
        {
          kind: "skill",
          id: "a",
          name: "A",
          source: "installed",
          installed: true,
          selected: true,
          action: "bind",
        },
        {
          kind: "skill",
          id: "b",
          name: "B",
          source: "catalog",
          installed: false,
          selected: true,
          action: "install_then_bind",
          listingId: "b",
        },
        {
          kind: "mcp",
          id: "m1",
          name: "M1",
          source: "installed",
          installed: true,
          selected: false,
          action: "bind",
        },
      ],
    });
    expect(draft.skillIds).toEqual(["a"]);
    expect(draft.mcpServerIds).toEqual([]);
  });
});
