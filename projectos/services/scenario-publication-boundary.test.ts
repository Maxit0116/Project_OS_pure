/**
 * Safety-exception boundary regressions for scenario-backed publication.
 *
 * Pins: (1) feature_change with no registered scenario and no orchestrator
 * fails closed as run_not_found (R1) — missing-intent codes are not equivalent;
 * (2) registered legal prefab scenario still public-applies; (3) OOS / concurrent
 * edits leave no disk/backup/auth side effects; (4) beforeCommit re-checks
 * fixture authorization (scenario existence alone is insufficient).
 *
 * Controllable fixture / INTERNAL helpers only — not DeepSeek; quality stays
 * not_run unless a test asserts otherwise.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentRun, GeneratedDiff } from "../contracts/index.js";
import { createDefaultSettings } from "../contracts/settings.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";
import { bindExistingFileAuthorization } from "./recoverable-write-transaction.js";
import { copySampleTree } from "../test-support/copy-sample.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function copySampleWorkspace(): string {
  const sample = join(process.cwd(), "..", "sample-graph-saas");
  const root = mkdtempSync(join(tmpdir(), "scenario-pub-boundary-"));
  roots.push(root);
  const workspaceRoot = join(root, "sample-graph-saas");
  copySampleTree(sample, workspaceRoot);
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

function featureChangeRun(projectId: string, runId: string): AgentRun {
  return {
    runId,
    projectId,
    kind: "feature_change",
    status: "awaiting_review",
    relatedNodeIds: ["feat_login"],
    relatedFiles: [],
    scope: { kind: "node-plan", nodeId: "feat_login" },
    role: "node_planner",
    startedAt: "2026-07-17T00:00:00.000Z",
  };
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

describe("scenario publication boundary (R1 + prefab exception)", () => {
  it("R1: feature_change without scenario or orchestrator fails as run_not_found (not missing-intent)", async () => {
    const workspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const runId = "run_unregistered_feature_change";
    const path = "app/login/page.tsx";
    const before = readFileSync(join(workspaceRoot, path), "utf8");
    const snapshot = sideEffectSnapshot(workspaceRoot);
    // Bind modify so validateGeneratedDiffScope passes; R1 is the publication
    // beforeCommit when there is still no scenario and no orchestrator.
    bindModify(api, project.projectId, workspaceRoot, runId, path);
    const diff: GeneratedDiff = {
      runId,
      summary: "Unauthorized open feature_change",
      files: [{
        path,
        changeType: "modify",
        before,
        after: `${before}\n// should not apply\n`,
      }],
    };
    const generatedApplyApi = api as unknown as {
      applyDiffFromGenerated(
        runId: string,
        generatedDiff: GeneratedDiff,
        agentRun: AgentRun,
      ): Promise<unknown>;
    };

    const rejection = generatedApplyApi.applyDiffFromGenerated(
      runId,
      diff,
      featureChangeRun(project.projectId, runId),
    );
    await expect(rejection).rejects.toMatchObject({
      code: "run_not_found",
      message: expect.stringContaining("publication boundary"),
    });
    // Missing-intent code is not an equivalent substitute for R1 here.
    await expect(rejection).rejects.not.toMatchObject({
      code: "diff_scope_violation",
    });

    expect(sideEffectSnapshot(workspaceRoot)).toEqual(snapshot);
    expect(existsSync(join(workspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });

  it("public applyDiff of an unknown run fails as run_not_found with no side effects", async () => {
    const workspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    await api.openSampleWorkspace();
    const snapshot = sideEffectSnapshot(workspaceRoot);

    await expect(api.applyDiff("run_never_registered")).rejects.toMatchObject({
      code: "run_not_found",
    });
    expect(sideEffectSnapshot(workspaceRoot)).toEqual(snapshot);
    expect(existsSync(join(workspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });

  it("registered legal google-login feature_change scenario still public-applies", async () => {
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
    const diff = await api.getDiff(run.runId);
    const result = await api.applyDiff(run.runId);

    expect(result).toMatchObject({
      runId: "run_google_login",
      applied: true,
      filesChanged: diff.files.map((file) => file.path),
      verificationStatus: "not_run",
    });
    expect(result.backupId).toEqual(expect.any(String));
    for (const file of diff.files) {
      expect(readFileSync(join(workspaceRoot, file.path), "utf8")).toBe(file.after);
    }
    expect(existsSync(join(
      workspaceRoot,
      ".projectos",
      "apply-backups",
      result.backupId!,
      "manifest.json",
    ))).toBe(true);
  });

  it("OOS prefab file outside scenario node leaves no disk or backup side effects", async () => {
    const workspaceRoot = copySampleWorkspace();
    const scenarioPath = join(
      workspaceRoot,
      ".projectos",
      "demo-scenarios",
      "google-login.json",
    );
    const scenario = JSON.parse(readFileSync(scenarioPath, "utf8")) as {
      files: string[];
      diff: { files: Array<{ path: string; changeType: string; before?: string; after?: string }> };
    };
    const outsidePath = "app/pricing/page.tsx";
    const outsideBefore = readFileSync(join(workspaceRoot, outsidePath), "utf8");
    scenario.files = [...scenario.files, outsidePath];
    scenario.diff.files[0] = {
      path: outsidePath,
      changeType: "modify",
      before: outsideBefore,
      after: `${outsideBefore}\n// unauthorized prefab\n`,
    };
    writeFileSync(scenarioPath, JSON.stringify(scenario));
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt:
        "Add Google login and redirect users to profile after successful sign in.",
    });
    const run = await api.confirmExecution(refinement.id);
    const loginBefore = readFileSync(join(workspaceRoot, "app/login/page.tsx"), "utf8");
    const snapshot = sideEffectSnapshot(workspaceRoot);

    await expect(api.applyDiff(run.runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });

    expect(readFileSync(join(workspaceRoot, outsidePath), "utf8")).toBe(outsideBefore);
    expect(readFileSync(join(workspaceRoot, "app/login/page.tsx"), "utf8")).toBe(loginBefore);
    expect(sideEffectSnapshot(workspaceRoot)).toEqual(snapshot);
    expect(existsSync(join(workspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });

  it("INTERNAL: scenario registration alone without fixture auth fails at commit", async () => {
    // Bypass validateGeneratedDiffScope (applyDiffFromGenerated always binds
    // scope first) and hit commit beforeCommit: scenario existence alone must
    // not publish without bound fixture authorization.
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
    const diff = await api.getDiff(run.runId);
    const snapshot = sideEffectSnapshot(workspaceRoot);

    const internals = api as unknown as {
      boundFixtureDiffAuthorizations: Map<string, unknown>;
      boundRunAuthorizations: Map<string, unknown>;
      boundCreateRunAuthorizations: Map<string, unknown>;
      boundDeleteRunAuthorizations: Map<string, unknown>;
      commitGeneratedDiffTransaction(
        runId: string,
        diff: GeneratedDiff,
        run: AgentRun,
      ): Promise<unknown>;
    };
    internals.boundFixtureDiffAuthorizations.delete(run.runId);
    internals.boundRunAuthorizations.delete(run.runId);
    internals.boundCreateRunAuthorizations.delete(run.runId);
    internals.boundDeleteRunAuthorizations.delete(run.runId);

    await expect(
      internals.commitGeneratedDiffTransaction(run.runId, diff, run),
    ).rejects.toMatchObject({
      code: "diff_scope_violation",
      message: expect.stringContaining("requires bound fixture authorization"),
    });
    expect(sideEffectSnapshot(workspaceRoot)).toEqual(snapshot);
    expect(existsSync(join(workspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });
});
