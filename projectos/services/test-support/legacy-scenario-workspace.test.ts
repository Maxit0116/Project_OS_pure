import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  authoritativeSampleGraphPath,
  createLegacyScenarioWorkspace,
} from "./legacy-scenario-workspace.js";

describe("legacy scenario workspace isolation", () => {
  it("keeps the authoritative sample graph unchanged", () => {
    const sampleGraphPath = authoritativeSampleGraphPath();
    const before = readFileSync(sampleGraphPath);
    const created = createLegacyScenarioWorkspace();
    const tempGraphPath = join(created.workspaceRoot, ".projectos", "graph.json");
    const tempGraph = readFileSync(tempGraphPath, "utf8");

    expect(tempGraph).toContain("feat_login");
    expect(readFileSync(join(created.workspaceRoot, ".projectos", "demo-scenarios", "google-login.json"), "utf8"))
      .toContain("ref_google_login");
    expect(readFileSync(join(created.workspaceRoot, ".projectos", "harness", "err_auth_provider_callback.json"), "utf8"))
      .toContain("feat_login");

    writeFileSync(tempGraphPath, `${tempGraph}\n`);
    rmSync(created.tempRoot, { recursive: true, force: true });

    const after = readFileSync(sampleGraphPath);
    expect(after).toEqual(before);
    expect(after.toString("utf8")).toContain("\"id\": \"component_app\"");
    expect(after.toString("utf8")).not.toContain("feat_login");
  });
});
