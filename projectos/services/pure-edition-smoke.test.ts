import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { validateWorkspaceFixtures } from "../validation/validate-fixtures.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";

describe("pure edition smoke", () => {
  it("keeps the sample workspace fixtures loadable", () => {
    const result = validateWorkspaceFixtures(resolve("..", "sample-graph-saas"));
    expect(result.ok).toBe(true);
  });

  it("opens the sample workspace and keeps the structure map loop", async () => {
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: resolve("..", "sample-graph-saas"),
    });
    const project = await api.openSampleWorkspace();
    const graph = await api.getProjectGraph(project.projectId);
    const tree = await api.getSemanticTree(project.projectId);
    const settings = await api.getSettings(project.projectId);
    const note = await api.createMapArtifact(project.projectId, {
      type: "note",
      scope: "project",
      position: { x: 40, y: 40 },
      size: { width: 280, height: 160 },
      note: { body: "pure smoke note" },
    });
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(tree.roots.length).toBeGreaterThan(0);
    expect(settings.presentationMode).toBe(false);
    expect(settings.agentProfiles.map((profile) => profile.kind).sort()).toEqual(
      ["debug_fix", "feature_change"].sort(),
    );
    expect(note.type).toBe("note");
    await api.deleteMapArtifact(project.projectId, note.id);
  });
});
