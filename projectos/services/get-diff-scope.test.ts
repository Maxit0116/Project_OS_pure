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

  it("rejects a parent read when the parent and child authorizations select different files", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const child = modifyDiff("run_child_b", "lib/auth.ts", "child-b");
    installRun(api, project.projectId, child);
    bindModify(api, project.projectId, workspaceRoot, child.runId, "lib/auth.ts");
    installParent(api, project.projectId, "run_parent_a", child.runId);
    bindModify(api, project.projectId, workspaceRoot, "run_parent_a", "app/login/page.tsx");
    const before = snapshot(workspaceRoot);

    await expect(api.getDiff("run_parent_a")).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("does not apply a parent aggregate whose child file differs from the parent authorization", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const child = modifyDiff("run_apply_child_b", "lib/auth.ts", "child-b");
    installRun(api, project.projectId, child);
    bindModify(api, project.projectId, workspaceRoot, child.runId, "lib/auth.ts");
    installParent(api, project.projectId, "run_apply_parent_a", child.runId);
    bindModify(api, project.projectId, workspaceRoot, "run_apply_parent_a", "app/login/page.tsx");
    const before = snapshot(workspaceRoot);

    await expect(api.applyDiff("run_apply_parent_a")).rejects.toMatchObject({
      code: "run_not_found",
    });
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("rejects an aggregated parent read when the parent is bound and the child is not", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const child = modifyDiff("run_unbound_child", "lib/auth.ts", "unbound-child");
    installRun(api, project.projectId, child);
    installParent(api, project.projectId, "run_bound_parent", child.runId);
    bindModify(api, project.projectId, workspaceRoot, "run_bound_parent", "app/login/page.tsx");
    const before = snapshot(workspaceRoot);

    await expect(api.getDiff("run_bound_parent")).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("does not apply an aggregated parent when its unbound child is outside the parent authorization", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const child = modifyDiff("run_apply_unbound_child", "lib/auth.ts", "unbound-child");
    installRun(api, project.projectId, child);
    installParent(api, project.projectId, "run_apply_bound_parent", child.runId);
    bindModify(api, project.projectId, workspaceRoot, "run_apply_bound_parent", "app/login/page.tsx");
    const before = snapshot(workspaceRoot);

    await expect(api.applyDiff("run_apply_bound_parent")).rejects.toMatchObject({
      code: "run_not_found",
    });
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("checks an intermediate authorization when that run has no diff of its own", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const leaf = modifyDiff("run_nested_leaf", "lib/auth.ts", "nested");
    installRun(api, project.projectId, leaf);
    installAggregate(api, project.projectId, "run_nested_mid", {
      delegatedChildren: [leaf.runId],
    });
    bindModify(api, project.projectId, workspaceRoot, "run_nested_mid", "app/login/page.tsx");
    installAggregate(api, project.projectId, "run_nested_root", {
      delegatedChildren: ["run_nested_mid"],
    });
    const before = snapshot(workspaceRoot);

    await expect(api.getDiff("run_nested_root")).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("returns a nested aggregate when the intermediate authorization matches the leaf", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const leaf = modifyDiff("run_nested_ok_leaf", "app/login/page.tsx", "nested-ok");
    installRun(api, project.projectId, leaf);
    installAggregate(api, project.projectId, "run_nested_ok_mid", {
      delegatedChildren: [leaf.runId],
    });
    bindModify(api, project.projectId, workspaceRoot, "run_nested_ok_mid", "app/login/page.tsx");
    installAggregate(api, project.projectId, "run_nested_ok_root", {
      delegatedChildren: ["run_nested_ok_mid"],
    });
    const before = snapshot(workspaceRoot);

    await expect(api.getDiff("run_nested_ok_root")).resolves.toMatchObject({
      runId: "run_nested_ok_root",
      files: [{ path: "app/login/page.tsx", changeType: "modify" }],
    });
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("checks a hierarchy child through the same child-diff append path", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const child = modifyDiff("run_hierarchy_child", "lib/auth.ts", "hierarchy");
    installRun(api, project.projectId, child);
    bindModify(api, project.projectId, workspaceRoot, child.runId, "app/login/page.tsx");
    installParent(
      api,
      project.projectId,
      "run_hierarchy_parent",
      child.runId,
      "delegatedHierarchyChildren",
    );
    const before = snapshot(workspaceRoot);

    await expect(api.getDiff("run_hierarchy_parent")).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("returns a bound scenario diff that stays on the authorized file", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    writeScenario(
      workspaceRoot,
      project.projectId,
      "run_bound_scenario_ok",
      modifyDiff("run_bound_scenario_ok", "app/login/page.tsx", "scenario-ok"),
      ["app/login/page.tsx"],
    );
    await api.openWorkspace(workspaceRoot);
    bindModify(api, project.projectId, workspaceRoot, "run_bound_scenario_ok", "app/login/page.tsx");
    const before = snapshot(workspaceRoot);

    await expect(api.getDiff("run_bound_scenario_ok")).resolves.toMatchObject({
      runId: "run_bound_scenario_ok",
      files: [{ path: "app/login/page.tsx", changeType: "modify" }],
    });
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("rejects a bound scenario diff that leaves the authorized file", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    writeScenario(
      workspaceRoot,
      project.projectId,
      "run_bound_scenario_outside",
      modifyDiff("run_bound_scenario_outside", "lib/auth.ts", "scenario-outside"),
      ["lib/auth.ts"],
    );
    await api.openWorkspace(workspaceRoot);
    bindModify(
      api,
      project.projectId,
      workspaceRoot,
      "run_bound_scenario_outside",
      "app/login/page.tsx",
    );
    const before = snapshot(workspaceRoot);

    await expect(api.getDiff("run_bound_scenario_outside")).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("rejects apply of a bound scenario diff outside the authorized file", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const outsidePath = "app/about/page.tsx";
    const current = readFileSync(join(workspaceRoot, outsidePath), "utf8");
    writeScenario(
      workspaceRoot,
      project.projectId,
      "run_bound_scenario_apply",
      {
        runId: "run_bound_scenario_apply",
        summary: "Modify a different linked file",
        files: [{
          path: outsidePath,
          changeType: "modify",
          before: current,
          after: `${current}\n// outside bound scenario\n`,
        }],
      },
      [outsidePath],
    );
    await api.openWorkspace(workspaceRoot);
    bindModify(
      api,
      project.projectId,
      workspaceRoot,
      "run_bound_scenario_apply",
      "app/login/page.tsx",
    );
    const before = snapshot(workspaceRoot);

    // The run is already bound to app/login/page.tsx. Scenario apply still
    // installs a fixture authorization from this diff and writes the other file.
    await expect(api.applyDiff("run_bound_scenario_apply")).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
    expect(readFileSync(join(workspaceRoot, outsidePath), "utf8")).toBe(current);
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("returns a fixture diff that matches the authorized file set", async () => {
    const { api, project, workspaceRoot, files, authorization } = await openFixtureWorkspace();
    const before = snapshot(workspaceRoot);
    const allowed = twoFileDiff("run_fixture", files);
    state(api).boundFixtureDiffAuthorizations.set(allowed.runId, {
      projectId: project.projectId,
      nodeId: "component_app",
      files: authorization,
    });
    installRun(api, project.projectId, allowed);

    await expect(api.getDiff(allowed.runId)).resolves.toMatchObject({
      files: [{ path: files[0] }, { path: files[1] }],
    });
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("rejects a fixture diff that adds a file outside the authorized set", async () => {
    const { api, project, workspaceRoot, files, authorization } = await openFixtureWorkspace();
    const before = snapshot(workspaceRoot);
    const extra = modifyDiff("run_fixture_extra", files[0], "extra");
    extra.files.push({ path: "app/page.tsx", changeType: "modify", before: "a", after: "b" });
    state(api).boundFixtureDiffAuthorizations.set(extra.runId, {
      projectId: project.projectId,
      nodeId: "component_app",
      files: authorization,
    });
    installRun(api, project.projectId, extra);

    await expect(api.getDiff(extra.runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("rejects apply of a fixture diff outside the authorized set", async () => {
    const { api, project, workspaceRoot, files, authorization } = await openFixtureWorkspace();
    const before = snapshot(workspaceRoot);
    const extra = modifyDiff("run_fixture_apply", files[0], "extra");
    extra.files.push({ path: "app/page.tsx", changeType: "modify", before: "a", after: "b" });
    state(api).boundFixtureDiffAuthorizations.set(extra.runId, {
      projectId: project.projectId,
      nodeId: "component_app",
      files: authorization,
    });
    installRun(api, project.projectId, extra);

    await expect(api.applyDiff(extra.runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("returns a create diff for the authorized new file", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const createdPath = "app/get-diff-scope-new.ts";
    bindCreate(api, project.projectId, workspaceRoot, "run_create", createdPath);
    const createDiff = createFileDiff("run_create", createdPath);
    installRun(api, project.projectId, createDiff);
    const before = snapshot(workspaceRoot);

    await expect(api.getDiff(createDiff.runId)).resolves.toMatchObject({
      files: [{ path: createdPath, changeType: "create" }],
    });
    expect(existsSync(join(workspaceRoot, createdPath))).toBe(false);
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("rejects a create binding whose diff modifies another file", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const createdPath = "app/get-diff-scope-new.ts";
    const mismatch = modifyDiff("run_create_mismatch", "app/login/page.tsx", "nope");
    bindCreate(api, project.projectId, workspaceRoot, mismatch.runId, createdPath);
    installRun(api, project.projectId, mismatch);
    const before = snapshot(workspaceRoot);

    await expect(api.getDiff(mismatch.runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
    expect(existsSync(join(workspaceRoot, createdPath))).toBe(false);
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("rejects apply of a create binding whose diff modifies another file", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const createdPath = "app/get-diff-scope-apply.ts";
    const mismatch = modifyDiff("run_create_apply", "app/login/page.tsx", "nope");
    bindCreate(api, project.projectId, workspaceRoot, mismatch.runId, createdPath);
    installRun(api, project.projectId, mismatch);
    const before = snapshot(workspaceRoot);

    await expect(api.applyDiff(mismatch.runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
    expect(existsSync(join(workspaceRoot, createdPath))).toBe(false);
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("returns a delete diff for the authorized file", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    bindDelete(api, project.projectId, workspaceRoot, "run_delete", "lib/auth.ts");
    const deleteDiff = deleteFileDiff("run_delete", "lib/auth.ts");
    installRun(api, project.projectId, deleteDiff);
    const before = snapshot(workspaceRoot);

    await expect(api.getDiff(deleteDiff.runId)).resolves.toMatchObject({
      files: [{ path: "lib/auth.ts", changeType: "delete" }],
    });
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("rejects a delete binding whose diff modifies another file", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const mismatch = modifyDiff("run_delete_mismatch", "app/login/page.tsx", "nope");
    bindDelete(api, project.projectId, workspaceRoot, mismatch.runId, "lib/auth.ts");
    installRun(api, project.projectId, mismatch);
    const before = snapshot(workspaceRoot);

    await expect(api.getDiff(mismatch.runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
    expect(snapshot(workspaceRoot)).toEqual(before);
  });

  it("rejects apply of a delete binding whose diff modifies another file", async () => {
    const workspaceRoot = copyWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    const mismatch = modifyDiff("run_delete_apply", "app/login/page.tsx", "nope");
    bindDelete(api, project.projectId, workspaceRoot, mismatch.runId, "lib/auth.ts");
    installRun(api, project.projectId, mismatch);
    const before = snapshot(workspaceRoot);

    await expect(api.applyDiff(mismatch.runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
    expect(snapshot(workspaceRoot)).toEqual(before);
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
  list: "delegatedChildren" | "delegatedHierarchyChildren" = "delegatedChildren",
): void {
  installAggregate(api, projectId, runId, { [list]: [childRunId] });
}

function installAggregate(
  api: ProjectOSLocalApi,
  projectId: string,
  runId: string,
  children: {
    delegatedChildren?: string[];
    delegatedHierarchyChildren?: string[];
  },
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
    ...(children.delegatedChildren
      ? { delegatedChildren: children.delegatedChildren.map((childRunId) => ({ runId: childRunId })) }
      : {}),
    ...(children.delegatedHierarchyChildren
      ? {
          delegatedHierarchyChildren: children.delegatedHierarchyChildren.map((childRunId) => ({
            runId: childRunId,
            taskId: childRunId,
            targetKind: "leaf-file" as const,
          })),
        }
      : {}),
    refinement: { understood: `Aggregate ${runId}` },
  });
}

function writeScenario(
  workspaceRoot: string,
  projectId: string,
  runId: string,
  diff: GeneratedDiff,
  files: string[],
): void {
  const scenarioDir = join(workspaceRoot, ".projectos", "demo-scenarios");
  mkdirSync(scenarioDir, { recursive: true });
  writeFileSync(join(scenarioDir, `${runId}.json`), JSON.stringify({
    version: "0.1.0",
    scenarioId: runId,
    projectId,
    title: "Bound scenario diff",
    description: "Scenario diff checked against an existing write authorization.",
    kind: "feature_change",
    nodeIds: ["component_app"],
    files,
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
    diff,
  }));
}

function twoFileDiff(
  runId: string,
  files: readonly [string, string],
): GeneratedDiff {
  return {
    runId,
    summary: "Modify both authorized files",
    files: files.map((path) => ({
      path,
      changeType: "modify" as const,
      before: "before",
      after: "after",
    })),
  };
}

function createFileDiff(runId: string, path: string): GeneratedDiff {
  return {
    runId,
    summary: "Create the authorized file",
    files: [{ path, changeType: "create", after: "export const created = true;\n" }],
  };
}

function deleteFileDiff(runId: string, path: string): GeneratedDiff {
  return {
    runId,
    summary: "Delete the authorized file",
    files: [{ path, changeType: "delete", before: "before" }],
  };
}

async function openFixtureWorkspace(): Promise<{
  api: ProjectOSLocalApi;
  project: { projectId: string };
  workspaceRoot: string;
  files: readonly ["app/login/page.tsx", "lib/auth.ts"];
  authorization: Map<string, {
    relativePath: string;
    canonicalPath: string;
    device: number;
    inode: number;
  }>;
}> {
  const workspaceRoot = copyWorkspace();
  const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
  const project = await api.openSampleWorkspace();
  const files = ["app/login/page.tsx", "lib/auth.ts"] as const;
  const authorization = new Map(files.map((path) => {
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
  return { api, project, workspaceRoot, files, authorization };
}

function bindCreate(
  api: ProjectOSLocalApi,
  projectId: string,
  workspaceRoot: string,
  runId: string,
  relativePath: string,
): void {
  state(api).boundCreateRunAuthorizations.set(runId, {
    operation: "create",
    projectId,
    nodeId: "component_app",
    intendedFilePath: relativePath,
    bundleHash: `sha256:${"b".repeat(64)}`,
    authorization: bindCreateAuthorization({
      projectId,
      nodeId: "component_app",
      workspaceRoot,
      relativePath,
    }),
  });
}

function bindDelete(
  api: ProjectOSLocalApi,
  projectId: string,
  workspaceRoot: string,
  runId: string,
  relativePath: string,
): void {
  state(api).boundDeleteRunAuthorizations.set(runId, {
    operation: "delete",
    projectId,
    nodeId: "component_app",
    targetPath: relativePath,
    bundleHash: `sha256:${"d".repeat(64)}`,
    authorization: bindExistingFileAuthorization({
      operation: "delete",
      projectId,
      nodeId: "component_app",
      workspaceRoot,
      relativePath,
    }),
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
        delegatedHierarchyChildren?: Array<{
          runId: string;
          taskId: string;
          targetKind: "leaf-file";
        }>;
        refinement?: { understood: string };
      }>;
    };
  };
}
