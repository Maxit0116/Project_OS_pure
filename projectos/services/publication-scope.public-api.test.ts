/**
 * Public getDiff/applyDiff scope regressions (no externalRunsByRunId).
 * getDiff must re-check bound authorization (PR4 returnScopedDiff).
 * applyDiffFromGenerated already validates scope before staging.
 */
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
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

function bindSingleFileAuthorization(
  api: ProjectOSLocalApi,
  projectId: string,
  workspaceRoot: string,
  runId: string,
  selectedFilePath: string,
): void {
  const canonicalPath = realpathSync(join(workspaceRoot, selectedFilePath));
  const stats = lstatSync(canonicalPath);
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
      relativePath: selectedFilePath,
      canonicalPath,
      device: stats.dev,
      inode: stats.ino,
    },
  });
}

describe("publication scope public API", () => {
  it("rejects getDiff when a bound write authorization disagrees with returned files", async () => {
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

    // Bind a write target that is not the sole authorized leaf for this prefab.
    const boundPath = "app/pricing/page.tsx";
    const before = readFileSync(join(workspaceRoot, boundPath), "utf8");
    const loginBefore = readFileSync(join(workspaceRoot, "app/login/page.tsx"), "utf8");
    bindSingleFileAuthorization(
      api,
      project.projectId,
      workspaceRoot,
      run.runId,
      boundPath,
    );

    await expect(api.getDiff(run.runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });

    expect(readFileSync(join(workspaceRoot, boundPath), "utf8")).toBe(before);
    expect(readFileSync(join(workspaceRoot, "app/login/page.tsx"), "utf8")).toBe(loginBefore);
    expect(existsSync(join(workspaceRoot, ".projectos", "apply-backups"))).toBe(false);
    const currentWork = readFileSync(
      join(workspaceRoot, ".projectos", "current-work.json"),
      "utf8",
    );
    expect(currentWork).toContain("recentChanges");
  });

  it("rejects applyDiffFromGenerated for an out-of-scope file before backup or write", async () => {
    const workspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const runId = "run_apply_scope_public";
    const selectedPath = "app/login/page.tsx";
    const otherPath = "app/pricing/page.tsx";
    const before = readFileSync(join(workspaceRoot, otherPath), "utf8");
    const currentWorkBefore = readFileSync(
      join(workspaceRoot, ".projectos", "current-work.json"),
      "utf8",
    );
    bindSingleFileAuthorization(
      api,
      project.projectId,
      workspaceRoot,
      runId,
      selectedPath,
    );

    const diff: GeneratedDiff = {
      runId,
      summary: "Attempt an unauthorized connected-file edit",
      files: [{
        path: otherPath,
        changeType: "modify",
        before,
        after: `${before}\n// unauthorized\n`,
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

    expect(readFileSync(join(workspaceRoot, otherPath), "utf8")).toBe(before);
    expect(readFileSync(join(workspaceRoot, ".projectos", "current-work.json"), "utf8"))
      .toBe(currentWorkBefore);
    expect(existsSync(join(workspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });
});
