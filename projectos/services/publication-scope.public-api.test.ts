/**
 * Prefab public getDiff/applyDiff regressions + labeled INTERNAL helper coverage.
 *
 * Public cases: same legal google-login prefab run, narrow binding already present,
 * independent getDiff(runId) and applyDiff(runId) that must reach scope checks
 * (not missing-intent / validation / run_not_found). Side effects compared by
 * full bytes / backup listing / authorization snapshot equality.
 *
 * INTERNAL: applyDiffFromGenerated remains covered but is not public applyDiff.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  cpSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { GeneratedDiff } from "../contracts/index.js";
import { createDefaultSettings } from "../contracts/settings.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";
import {
  bindExistingFileAuthorization,
} from "./recoverable-write-transaction.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function copySampleWorkspace(): string {
  const sample = join(process.cwd(), "..", "sample-graph-saas");
  const root = mkdtempSync(join(tmpdir(), "publication-scope-"));
  roots.push(root);
  const workspaceRoot = join(root, "sample-graph-saas");
  cpSync(sample, workspaceRoot, { recursive: true });
  rmSync(join(workspaceRoot, ".projectos", "settings.json"), { force: true });
  rmSync(join(workspaceRoot, ".projectos", "apply-backups"), { recursive: true, force: true });
  const project = JSON.parse(
    readFileSync(join(workspaceRoot, ".projectos", "project.json"), "utf8"),
  ) as { projectId: string };
  const settings = createDefaultSettings(project.projectId, false);
  settings.execution.mode = "fixture";
  settings.modelProfiles = [];
  writeFileSync(
    join(workspaceRoot, ".projectos", "settings.json"),
    JSON.stringify(settings, null, 2),
    "utf8",
  );
  return workspaceRoot;
}

function sideEffectSnapshot(workspaceRoot: string): {
  login: string;
  pricing: string;
  currentWork: string;
  backup: boolean;
  backupListing: string;
} {
  const backupRoot = join(workspaceRoot, ".projectos", "apply-backups");
  const backup = existsSync(backupRoot);
  return {
    login: readFileSync(join(workspaceRoot, "app/login/page.tsx"), "utf8"),
    pricing: readFileSync(join(workspaceRoot, "app/pricing/page.tsx"), "utf8"),
    currentWork: readFileSync(join(workspaceRoot, ".projectos", "current-work.json"), "utf8"),
    backup,
    backupListing: backup
      ? readdirSync(backupRoot, { recursive: true }).map(String).sort().join("\n")
      : "",
  };
}

function authorizationSnapshot(api: ProjectOSLocalApi): Array<{
  runId: string;
  modify: string | null;
  fixture: string[];
}> {
  const current = api as unknown as {
    boundRunAuthorizations: Map<string, { selectedFilePath: string }>;
    boundFixtureDiffAuthorizations: Map<string, { files: Map<string, unknown> }>;
  };
  const runIds = new Set<string>([
    ...current.boundRunAuthorizations.keys(),
    ...current.boundFixtureDiffAuthorizations.keys(),
  ]);
  return [...runIds].sort().map((runId) => ({
    runId,
    modify: current.boundRunAuthorizations.get(runId)?.selectedFilePath ?? null,
    fixture: [...(current.boundFixtureDiffAuthorizations.get(runId)?.files.keys() ?? [])].sort(),
  }));
}

function bindModify(
  api: ProjectOSLocalApi,
  projectId: string,
  workspaceRoot: string,
  runId: string,
  selectedFilePath: string,
): void {
  const bound = bindExistingFileAuthorization({
    operation: "modify",
    projectId,
    nodeId: "feat_login",
    workspaceRoot,
    relativePath: selectedFilePath,
  });
  const internals = api as unknown as {
    boundRunAuthorizations: Map<string, {
      projectId: string;
      nodeId: string;
      selectedFilePath: string;
      bundleHash: string;
      allowedWriteTarget: {
        relativePath: string;
        canonicalPath: string;
        device: number;
        inode: number;
      };
    }>;
  };
  internals.boundRunAuthorizations.set(runId, {
    projectId,
    nodeId: "feat_login",
    selectedFilePath,
    bundleHash: `sha256:${"0".repeat(64)}`,
    allowedWriteTarget: {
      relativePath: bound.relativePath,
      canonicalPath: bound.canonicalPath,
      device: bound.device,
      inode: bound.inode,
    },
  });
}

async function openGoogleLoginPrefab(): Promise<{
  api: ProjectOSLocalApi;
  projectId: string;
  workspaceRoot: string;
  runId: string;
}> {
  const workspaceRoot = copySampleWorkspace();
  const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
  const project = await api.openSampleWorkspace();
  const refinement = await api.refinePrompt({
    projectId: project.projectId,
    nodeId: "feat_login",
    rawPrompt:
      "Add Google login and redirect users to profile after successful sign in.",
  });
  const run = await api.confirmExecution(refinement.id);
  return {
    api,
    projectId: project.projectId,
    workspaceRoot,
    runId: run.runId,
  };
}

describe("publication scope public prefab API", () => {
  it("rejects public getDiff when a narrow binding disagrees with the prefab files", async () => {
    const { api, projectId, workspaceRoot, runId } = await openGoogleLoginPrefab();
    bindModify(api, projectId, workspaceRoot, runId, "app/pricing/page.tsx");
    const before = sideEffectSnapshot(workspaceRoot);
    const beforeAuth = authorizationSnapshot(api);

    await expect(api.getDiff(runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });

    expect(sideEffectSnapshot(workspaceRoot)).toEqual(before);
    expect(authorizationSnapshot(api)).toEqual(beforeAuth);
  });

  it("rejects public applyDiff when a narrow binding disagrees with scenario files", async () => {
    // Independent of google-login feature_change publication-boundary: use a
    // demo scenario whose files are linked so unbound authorizeFixtureDiff
    // would expand, then require scope rejection against the narrow binding.
    const workspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const runId = "run_prefab_oos_apply";
    const boundPath = "app/pricing/page.tsx";
    const scenarioPath = "app/login/page.tsx";
    const loginBefore = readFileSync(join(workspaceRoot, scenarioPath), "utf8");
    writeFileSync(join(workspaceRoot, ".projectos", "demo-scenarios", `${runId}.json`), JSON.stringify({
      version: "0.1.0",
      scenarioId: runId,
      projectId: project.projectId,
      title: "OOS public applyDiff",
      description: "Narrow binding must block scenario apply of a linked file.",
      kind: "demo",
      nodeIds: ["feat_login"],
      files: [scenarioPath],
      run: {
        runId,
        projectId: project.projectId,
        kind: "demo",
        status: "awaiting_review",
        relatedNodeIds: ["feat_login"],
        relatedFiles: [],
        scope: { kind: "component", nodeId: "feat_login" },
        role: "node_planner",
        startedAt: "2026-07-17T00:00:00.000Z",
      },
      diff: {
        runId,
        summary: "Modify login",
        files: [{
          path: scenarioPath,
          changeType: "modify",
          before: loginBefore,
          after: `${loginBefore}\n// oos public apply\n`,
        }],
      },
    }));
    await api.openWorkspace(workspaceRoot);
    bindModify(api, project.projectId, workspaceRoot, runId, boundPath);
    const before = sideEffectSnapshot(workspaceRoot);
    const beforeAuth = authorizationSnapshot(api);

    await expect(api.applyDiff(runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });

    expect(sideEffectSnapshot(workspaceRoot)).toEqual(before);
    expect(authorizationSnapshot(api)).toEqual(beforeAuth);
  });

  it("applies an in-scope public demo-scenario applyDiff when the binding matches", async () => {
    // google-login prefab is feature_change and hits HEAD publication-boundary
    // without an orchestrator run; legal public apply control uses a demo scenario.
    const workspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const loginPath = "app/login/page.tsx";
    const runId = "run_prefab_legal_apply";
    const beforeLogin = readFileSync(join(workspaceRoot, loginPath), "utf8");
    const scenarioDir = join(workspaceRoot, ".projectos", "demo-scenarios");
    writeFileSync(join(scenarioDir, `${runId}.json`), JSON.stringify({
      version: "0.1.0",
      scenarioId: runId,
      projectId: project.projectId,
      title: "Legal bound scenario apply",
      description: "In-scope public applyDiff control with an existing modify binding.",
      kind: "demo",
      nodeIds: ["feat_login"],
      files: [loginPath],
      run: {
        runId,
        projectId: project.projectId,
        kind: "demo",
        status: "awaiting_review",
        relatedNodeIds: ["feat_login"],
        relatedFiles: [],
        scope: { kind: "component", nodeId: "feat_login" },
        role: "node_planner",
        startedAt: "2026-07-17T00:00:00.000Z",
      },
      diff: {
        runId,
        summary: "Modify login",
        files: [{
          path: loginPath,
          changeType: "modify",
          before: beforeLogin,
          after: `${beforeLogin}\n// legal public apply\n`,
        }],
      },
    }));
    await api.openWorkspace(workspaceRoot);
    bindModify(api, project.projectId, workspaceRoot, runId, loginPath);
    const beforeAuth = authorizationSnapshot(api);

    const result = await api.applyDiff(runId);
    expect(result).toMatchObject({
      applied: true,
      filesChanged: [loginPath],
    });
    expect(readFileSync(join(workspaceRoot, loginPath), "utf8")).toBe(
      `${beforeLogin}\n// legal public apply\n`,
    );
    expect(authorizationSnapshot(api)).toEqual(beforeAuth);
  });
});

describe("publication scope INTERNAL applyDiffFromGenerated", () => {
  it("INTERNAL: rejects applyDiffFromGenerated for an out-of-scope file before backup or write", async () => {
    const workspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const runId = "run_apply_scope_internal";
    const selectedPath = "app/login/page.tsx";
    const otherPath = "app/pricing/page.tsx";
    const before = sideEffectSnapshot(workspaceRoot);
    bindModify(api, project.projectId, workspaceRoot, runId, selectedPath);

    const otherBefore = readFileSync(join(workspaceRoot, otherPath), "utf8");
    const diff: GeneratedDiff = {
      runId,
      summary: "Attempt an unauthorized connected-file edit",
      files: [{
        path: otherPath,
        changeType: "modify",
        before: otherBefore,
        after: `${otherBefore}\n// unauthorized\n`,
      }],
    };
    const generatedApplyApi = api as unknown as {
      applyDiffFromGenerated(
        runId: string,
        generatedDiff: GeneratedDiff,
        agentRun: {
          runId: string;
          projectId: string;
          kind: "feature_change";
          status: "awaiting_review";
          relatedNodeIds: string[];
          relatedFiles: string[];
          scope: { kind: "component"; nodeId: string };
          startedAt: string;
        },
      ): Promise<unknown>;
    };

    await expect(generatedApplyApi.applyDiffFromGenerated(runId, diff, {
      runId,
      projectId: project.projectId,
      kind: "feature_change",
      status: "awaiting_review",
      relatedNodeIds: ["feat_login"],
      relatedFiles: [],
      scope: { kind: "component", nodeId: "feat_login" },
      startedAt: "2026-07-17T00:00:00.000Z",
    })).rejects.toMatchObject({ code: "diff_scope_violation" });

    expect(sideEffectSnapshot(workspaceRoot)).toEqual(before);
  });
});
