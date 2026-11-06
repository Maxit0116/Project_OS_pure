import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { createDefaultSettings } from "../../contracts/settings.js";

/**
 * Legacy scenario pack used only by tests that still assert feat_login,
 * google-login, auth-bugfix, and the auth harness. These files live in the
 * client fixture set. They are not a second copy of the authoritative sample.
 */
export const LEGACY_SCENARIO_FIXTURE_FILES = [
  "project.json",
  "graph.json",
  "semantic-tree.json",
  "current-work.json",
  "demo-reset.json",
  "map-content.json",
  "demo-scenarios/google-login.json",
  "demo-scenarios/auth-bugfix.json",
  "harness/err_auth_provider_callback.json",
] as const;

const supportDirectory = dirname(fileURLToPath(import.meta.url));
const authoritativeSampleRoot = resolve(supportDirectory, "../../..", "sample-graph-saas");
const legacyFixtureRoot = resolve(
  supportDirectory,
  "../../client/sample-projectos-fixtures",
);
const legacySourceRoot = join(supportDirectory, "legacy-scenario-sources");

/**
 * Source paths the legacy graph still names and the current sample no longer
 * contains. They are copied only into the temp workspace, and only when that
 * path is absent, so the authoritative sample is not repaired.
 *
 * `projectos-blocks/loaders/dashboard.ts` is the file from commit
 * 62a901801baeaf405bacd1a93c664292738dc416 at
 * `sample-graph-saas/projectos-blocks/loaders/dashboard.ts`.
 */
const LEGACY_SCENARIO_SOURCE_FILES = [
  "projectos-blocks/loaders/dashboard.ts",
] as const;

export function authoritativeSampleGraphPath(): string {
  return join(authoritativeSampleRoot, ".projectos", "graph.json");
}

export function authoritativeSampleSemanticTreePath(): string {
  return join(authoritativeSampleRoot, ".projectos", "semantic-tree.json");
}

export function createLegacyScenarioWorkspace(): {
  tempRoot: string;
  workspaceRoot: string;
} {
  const tempRoot = mkdtempSync(join(tmpdir(), "projectos-legacy-scenario-"));
  const workspaceRoot = join(tempRoot, "sample-graph-saas");
  cpSync(authoritativeSampleRoot, workspaceRoot, {
    recursive: true,
    filter: (source) => {
      const rel = relative(authoritativeSampleRoot, source);
      if (rel === "") return true;
      const top = rel.split(sep)[0];
      return top !== "node_modules" && top !== ".next" && top !== ".git";
    },
  });

  for (const relativePath of LEGACY_SCENARIO_FIXTURE_FILES) {
    const target = join(workspaceRoot, ".projectos", relativePath);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(legacyFixtureRoot, relativePath), target);
  }
  for (const relativePath of LEGACY_SCENARIO_SOURCE_FILES) {
    const target = join(workspaceRoot, relativePath);
    if (existsSync(target)) continue;
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(legacySourceRoot, relativePath), target);
  }

  rmSync(join(workspaceRoot, ".projectos", "apply-backups"), {
    recursive: true,
    force: true,
  });
  rmSync(join(workspaceRoot, ".projectos", "graph-product-overlay.json"), {
    force: true,
  });
  rmSync(join(workspaceRoot, ".projectos", "project-description.json"), {
    force: true,
  });

  const project = JSON.parse(
    readFileSync(join(workspaceRoot, ".projectos", "project.json"), "utf8"),
  ) as { projectId: string };
  const settings = createDefaultSettings(project.projectId, false);
  settings.execution.mode = "fixture";
  settings.modelProfiles = [];
  writeFileSync(
    join(workspaceRoot, ".projectos", "settings.json"),
    `${JSON.stringify(settings, null, 2)}\n`,
  );
  return { tempRoot, workspaceRoot };
}
