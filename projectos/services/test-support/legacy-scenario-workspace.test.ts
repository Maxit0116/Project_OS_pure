import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  authoritativeSampleGraphPath,
  authoritativeSampleSemanticTreePath,
  createLegacyScenarioWorkspace,
} from "./legacy-scenario-workspace.js";

describe("legacy scenario workspace isolation", () => {
  it("keeps the authoritative sample graph and semantic tree unchanged", () => {
    const sampleGraphPath = authoritativeSampleGraphPath();
    const sampleTreePath = authoritativeSampleSemanticTreePath();
    const graphBefore = readFileSync(sampleGraphPath);
    const treeBefore = readFileSync(sampleTreePath);
    const created = createLegacyScenarioWorkspace();
    const tempGraphPath = join(created.workspaceRoot, ".projectos", "graph.json");
    const tempTreePath = join(created.workspaceRoot, ".projectos", "semantic-tree.json");
    const tempGraph = readFileSync(tempGraphPath, "utf8");

    expect(tempGraph).toContain("feat_login");
    expect(readFileSync(join(created.workspaceRoot, ".projectos", "demo-scenarios", "google-login.json"), "utf8"))
      .toContain("ref_google_login");
    expect(readFileSync(join(created.workspaceRoot, ".projectos", "harness", "err_auth_provider_callback.json"), "utf8"))
      .toContain("feat_login");

    writeFileSync(tempGraphPath, `${tempGraph}\n`);
    writeFileSync(tempTreePath, "{}\n");
    rmSync(created.tempRoot, { recursive: true, force: true });

    expect(readFileSync(sampleGraphPath)).toEqual(graphBefore);
    expect(readFileSync(sampleTreePath)).toEqual(treeBefore);
    expect(graphBefore.toString("utf8")).toContain("\"id\": \"component_app\"");
    expect(graphBefore.toString("utf8")).not.toContain("feat_login");
    expect(treeBefore.toString("utf8")).toContain("\"sourceNodeId\": \"component_app\"");
  });
});
