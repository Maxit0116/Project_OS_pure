import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { AgentRun } from "../contracts/agent-run.js";
import type { GeneratedDiff } from "../contracts/diff.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";
import {
  bindCreateAuthorization,
  bindExistingFileAuthorization,
} from "./recoverable-write-transaction.js";

const sampleRoot = resolve("..", "sample-graph-saas");
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("getDiff authorization", () => {
  it("returns a bound diff that stays on the authorized file", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const before = snapshot(workspaceRoot);
    const diff = modifyDiff("run_allowed", "app/login/page.tsx", "allowed");
    installRun(api, project.projectId, diff);
    bindModify(api, project.projectId, workspaceRoot, diff.runId, "app/login/page.tsx");

    await expect(api.getDiff(diff.runId)).resolves.toMatchObject({
      runId: diff.runId,
      files: [{ path: "app/login/page.tsx", changeType: "modify" }],
    });
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("rejects a bound diff that reads outside the authorized file", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const before = snapshot(workspaceRoot);
    const diff = modifyDiff("run_outside", "lib/auth.ts", "outside");
    installRun(api, project.projectId, diff);
    bindModify(api, project.projectId, workspaceRoot, diff.runId, "app/login/page.tsx");

    await expect(api.getDiff(diff.runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("rejects a bound diff that would apply outside the authorized file", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const before = snapshot(workspaceRoot);
    const diff = modifyDiff("run_apply_outside", "lib/auth.ts", "outside");
    installRun(api, project.projectId, diff);
    bindModify(api, project.projectId, workspaceRoot, diff.runId, "app/login/page.tsx");

    await expect(api.applyDiff(diff.runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("still returns an unbound orchestrator diff and an unbound scenario diff", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const unbound = modifyDiff("run_unbound", "lib/auth.ts", "legacy");
    installRun(api, project.projectId, unbound);
    const before = snapshot(workspaceRoot);

    await expect(api.getDiff(unbound.runId)).resolves.toMatchObject({
      runId: unbound.runId,
      files: [{ path: "lib/auth.ts", changeType: "modify" }],
    });

    const scenarioDir = join(workspaceRoot, ".projectos", "demo-scenarios");
    mkdirSync(scenarioDir, { recursive: true });
    writeFileSync(join(scenarioDir, "unbound-read.json"), JSON.stringify({
      version: "0.1.0",
      scenarioId: "unbound-read",
      projectId: project.projectId,
      title: "Unbound diff read",
      description: "A scenario diff with no bound write authorization.",
      kind: "feature_change",
      nodeIds: ["component_app"],
      files: ["app/login/page.tsx"],
      run: {
        runId: "run_unbound_scenario",
        projectId: project.projectId,
        kind: "feature_change",
        status: "awaiting_review",
        relatedNodeIds: ["component_app"],
        relatedFiles: [],
        scope: { kind: "component", nodeId: "component_app" },
        role: "node_planner",
        startedAt: "2026-07-17T00:00:00.000Z",
      },
      diff: modifyDiff("run_unbound_scenario", "lib/auth.ts", "scenario"),
    }));
    await api.openWorkspace(workspaceRoot);
    const afterReload = snapshot(workspaceRoot);
    await expect(api.getDiff("run_unbound_scenario")).resolves.toMatchObject({
      runId: "run_unbound_scenario",
      files: [{ path: "lib/auth.ts", changeType: "modify" }],
    });
    expect(snapshot(workspaceRoot)).toEqual(afterReload);
    expect(readFileSync(join(workspaceRoot, "lib/auth.ts"), "utf8")).toBe(before.auth);
    expect(existsSync(join(workspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });

  it("checks a child binding while aggregating a parent diff", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const allowedChild = modifyDiff("run_child_allowed", "app/login/page.tsx", "child");
    installRun(api, project.projectId, allowedChild);
    bindModify(api, project.projectId, workspaceRoot, allowedChild.runId, "app/login/page.tsx");
    installParent(api, project.projectId, "run_parent_allowed", allowedChild.runId);

    await expect(api.getDiff("run_parent_allowed")).resolves.toMatchObject({
      runId: "run_parent_allowed",
      files: [{ path: "app/login/page.tsx", changeType: "modify" }],
    });

    const outsideChild = modifyDiff("run_child_outside", "lib/auth.ts", "child");
    installRun(api, project.projectId, outsideChild);
    bindModify(api, project.projectId, workspaceRoot, outsideChild.runId, "app/login/page.tsx");
    installParent(api, project.projectId, "run_parent_outside", outsideChild.runId);
    const before = snapshot(workspaceRoot);

    await expect(api.getDiff("run_parent_outside")).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("checks a multi-file fixture authorization and create or delete bindings", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const paths = ["app/login/page.tsx", "lib/auth.ts"] as const;
    const files = new Map(paths.map((path) => {
      const bound = bindExistingFileAuthorization({
        operation: "modify",
        projectId: project.projectId,
        nodeId: "component_app",
        workspaceRoot,
        relativePath: path,
      });
      return [path, {
        relativePath: bound.relativePath,
        canonicalPath: bound.canonicalPath,
        device: bound.device,
        inode: bound.inode,
      }] as const;
    }));
    state(api).boundFixtureDiffAuthorizations.set("run_fixture", {
      projectId: project.projectId,
      nodeId: "component_app",
      files,
    });
    const allowed = modifyDiff("run_fixture", paths[0], "one");
    allowed.files.push({
      path: paths[1],
      changeType: "modify",
      before: "before",
      after: "after",
    });
    installRun(api, project.projectId, allowed);
    await expect(api.getDiff(allowed.runId)).resolves.toMatchObject({
      files: [{ path: paths[0] }, { path: paths[1] }],
    });

    const extra = modifyDiff("run_fixture_extra", paths[0], "extra");
    extra.files.push({ path: "app/page.tsx", changeType: "modify", before: "a", after: "b" });
    state(api).boundFixtureDiffAuthorizations.set("run_fixture_extra", {
      projectId: project.projectId,
      nodeId: "component_app",
      files,
    });
    installRun(api, project.projectId, extra);
    await expect(api.getDiff(extra.runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });

    const createdPath = "app/get-diff-scope-new.ts";
    const createAuthorization = bindCreateAuthorization({
      projectId: project.projectId,
      nodeId: "component_app",
      workspaceRoot,
      relativePath: createdPath,
    });
    state(api).boundCreateRunAuthorizations.set("run_create", {
      operation: "create",
      projectId: project.projectId,
      nodeId: "component_app",
      intendedFilePath: createdPath,
      bundleHash: `sha256:${"b".repeat(64)}`,
      authorization: createAuthorization,
    });
    const createDiff: GeneratedDiff = {
      runId: "run_create",
      summary: "Create the authorized file",
      files: [{ path: createdPath, changeType: "create", after: "export const created = true;\n" }],
    };
    installRun(api, project.projectId, createDiff);
    await expect(api.getDiff(createDiff.runId)).resolves.toMatchObject({
      files: [{ path: createdPath, changeType: "create" }],
    });
    const createMismatch = modifyDiff("run_create_mismatch", "app/login/page.tsx", "nope");
    state(api).boundCreateRunAuthorizations.set(createMismatch.runId, {
      operation: "create",
      projectId: project.projectId,
      nodeId: "component_app",
      intendedFilePath: createdPath,
      bundleHash: `sha256:${"c".repeat(64)}`,
      authorization: createAuthorization,
    });
    installRun(api, project.projectId, createMismatch);
    await expect(api.getDiff(createMismatch.runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });

    const deleteAuthorization = bindExistingFileAuthorization({
      operation: "delete",
      projectId: project.projectId,
      nodeId: "component_app",
      workspaceRoot,
      relativePath: "lib/auth.ts",
    });
    state(api).boundDeleteRunAuthorizations.set("run_delete", {
      operation: "delete",
      projectId: project.projectId,
      nodeId: "component_app",
      targetPath: "lib/auth.ts",
      bundleHash: `sha256:${"d".repeat(64)}`,
      authorization: deleteAuthorization,
    });
    const deleteDiff: GeneratedDiff = {
      runId: "run_delete",
      summary: "Delete the authorized file",
      files: [{ path: "lib/auth.ts", changeType: "delete", before: "before" }],
    };
    installRun(api, project.projectId, deleteDiff);
    await expect(api.getDiff(deleteDiff.runId)).resolves.toMatchObject({
      files: [{ path: "lib/auth.ts", changeType: "delete" }],
    });
    const deleteMismatch = modifyDiff("run_delete_mismatch", "app/login/page.tsx", "nope");
    state(api).boundDeleteRunAuthorizations.set(deleteMismatch.runId, {
      operation: "delete",
      projectId: project.projectId,
      nodeId: "component_app",
      targetPath: "lib/auth.ts",
      bundleHash: `sha256:${"e".repeat(64)}`,
      authorization: deleteAuthorization,
    });
    installRun(api, project.projectId, deleteMismatch);
    await expect(api.getDiff(deleteMismatch.runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
  });
});

function copyWorkspace(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "projectos-get-diff-scope-"));
  temporaryRoots.push(tempRoot);
  const workspaceRoot = join(tempRoot, "sample-graph-saas");
  cpSync(sampleRoot, workspaceRoot, {
    recursive: true,
    filter: (source) => {
      const rel = relative(sampleRoot, source);
      if (rel === "") return true;
      const top = rel.split(sep)[0];
      return top !== "node_modules" && top !== ".next" && top !== ".git";
    },
  });
  return workspaceRoot;
}

function snapshot(workspaceRoot: string): {
  login: string;
  auth: string;
  currentWork: string;
  backup: boolean;
} {
  return {
    login: readFileSync(join(workspaceRoot, "app/login/page.tsx"), "utf8"),
    auth: readFileSync(join(workspaceRoot, "lib/auth.ts"), "utf8"),
    currentWork: readFileSync(join(workspaceRoot, ".projectos", "current-work.json"), "utf8"),
    backup: existsSync(join(workspaceRoot, ".projectos", "apply-backups")),
  };
}

function modifyDiff(runId: string, path: string, marker: string): GeneratedDiff {
  return {
    runId,
    summary: `Modify ${path}`,
    files: [{
      path,
      changeType: "modify",
      before: "before",
      after: `after ${marker}`,
    }],
  };
}

function installParent(
  api: ProjectOSLocalApi,
  projectId: string,
  runId: string,
  childRunId: string,
): void {
  state(api).orchestrator.runs.set(runId, {
    run: {
      runId,
      projectId,
      kind: "feature_change",
      status: "awaiting_review",
      relatedNodeIds: ["component_app"],
      relatedFiles: [],
      scope: { kind: "component", nodeId: "component_app" },
      role: "node_planner",
      startedAt: "2026-07-17T00:00:00.000Z",
    },
    delegatedChildren: [{ runId: childRunId }],
    refinement: { understood: "Aggregate the authorized child diff" },
  });
}

function installRun(api: ProjectOSLocalApi, projectId: string, diff: GeneratedDiff): void {
  const run: AgentRun = {
    runId: diff.runId,
    projectId,
    kind: "feature_change",
    status: "awaiting_review",
    relatedNodeIds: ["component_app"],
    relatedFiles: diff.files.map((file) => file.path),
    scope: { kind: "component", nodeId: "component_app" },
    role: "node_planner",
    startedAt: "2026-07-17T00:00:00.000Z",
  };
  state(api).orchestrator.runs.set(diff.runId, {
    run,
    diff,
    validationResult: { verdict: "valid" },
    validatedDiffJson: JSON.stringify(diff),
  });
}

function bindModify(
  api: ProjectOSLocalApi,
  projectId: string,
  workspaceRoot: string,
  runId: string,
  relativePath: string,
): void {
  const bound = bindExistingFileAuthorization({
    operation: "modify",
    projectId,
    nodeId: "component_app",
    workspaceRoot,
    relativePath,
  });
  state(api).boundRunAuthorizations.set(runId, {
    projectId,
    nodeId: "component_app",
    selectedFilePath: relativePath,
    bundleHash: `sha256:${"a".repeat(64)}`,
    allowedWriteTarget: {
      relativePath: bound.relativePath,
      canonicalPath: bound.canonicalPath,
      device: bound.device,
      inode: bound.inode,
    },
  });
}

function state(api: ProjectOSLocalApi) {
  return api as unknown as {
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
    boundFixtureDiffAuthorizations: Map<string, {
      projectId: string;
      nodeId: string;
      files: Map<string, {
        relativePath: string;
        canonicalPath: string;
        device: number;
        inode: number;
      }>;
    }>;
    boundCreateRunAuthorizations: Map<string, {
      operation: "create";
      projectId: string;
      nodeId: string;
      intendedFilePath: string;
      bundleHash: string;
      authorization: ReturnType<typeof bindCreateAuthorization>;
    }>;
    boundDeleteRunAuthorizations: Map<string, {
      operation: "delete";
      projectId: string;
      nodeId: string;
      targetPath: string;
      bundleHash: string;
      authorization: ReturnType<typeof bindExistingFileAuthorization>;
    }>;
    orchestrator: {
      runs: Map<string, {
        run: AgentRun;
        diff?: GeneratedDiff;
        validationResult?: { verdict: "valid" };
        validatedDiffJson?: string;
        delegatedChildren?: Array<{ runId: string }>;
        refinement?: { understood: string };
      }>;
    };
  };
}
