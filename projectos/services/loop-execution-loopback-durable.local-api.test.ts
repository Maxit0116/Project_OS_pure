/**
 * Explicit DI local_tools startAgentRun must write formal durable AgentRun
 * (snapshot+jsonl) readable by getAgentRun / getAgentRunEvents after reopen.
 * Forged/memory-only runIds are not enough.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { LoopSpec } from "../contracts/loop-graph.js";
import type { LoopTaskMaterial } from "../contracts/loop-task-materials.js";
import {
  approveLoopSpec,
  createLoopGraph,
  upsertLoopGraph,
} from "./loop-graph-service.js";
import { compileLoopGraphDraft } from "./loop-graph-compiler.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";
import { agentRunLogPath, agentRunSnapshotPath } from "./harness/persisted-run.js";

const sampleWorkspaceRoot = resolve("..", "sample-graph-saas");

describe("DI local_tools durable AgentRun (LocalApi)", () => {
  const roots: string[] = [];
  const prevAllow = process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK;

  beforeEach(() => {
    process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK = "1";
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
    if (prevAllow === undefined) {
      delete process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK;
    } else {
      process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK = prevAllow;
    }
  });

  it("startLoopInstance implement → durable disk run; getAgentRun after reopen", async () => {
    const sample = mkdtempSync(join(tmpdir(), "loop-durable-di-"));
    roots.push(sample);
    cpSync(sampleWorkspaceRoot, sample, { recursive: true });
    mkdirSync(join(sample, "src"), { recursive: true });
    writeFileSync(
      join(sample, "src/greet.js"),
      "export function greet(name) { return 'broken' }\n",
    );

    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: sample });
    const project = await api.openSampleWorkspace();
    const workspace = (
      api as unknown as {
        requireLoadedWorkspace: (id: string) => {
          workspaceRoot: string;
          projectOSRoot: string;
        };
      }
    ).requireLoadedWorkspace(project.projectId);

    await api.setLoopExecutionLoopbackMode("local_tools");

    let doc = createLoopGraph(workspace.workspaceRoot, project.projectId, "durable DI");
    doc = upsertLoopGraph(workspace.workspaceRoot, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt: "Fix greet",
        nodes: [
          {
            id: "n_impl",
            title: "Implement",
            prompt: "Fix src/greet.js so greet returns Hello",
            type: "agent",
            agentRole: "coder",
            position: { x: 0, y: 0 },
            timeoutMs: 30_000,
          },
        ],
        edges: [],
      },
    });
    const compiled = await compileLoopGraphDraft(doc.draft);
    const spec: LoopSpec = {
      ...compiled.specDraft,
      version: "spec_durable_di_1",
      createdAt: new Date().toISOString(),
      stopPolicy: { ...compiled.specDraft.stopPolicy, maxRounds: 2 },
    };
    doc = approveLoopSpec(workspace.workspaceRoot, doc.id, spec);

    const now = new Date().toISOString();
    const materials: LoopTaskMaterial[] = [
      {
        id: "mat_greet",
        kind: "project_ref",
        purpose: "code_context",
        title: "src/greet.js",
        source: "project_ref",
        parseStatus: "ok",
        projectRef: { path: "src/greet.js", kind: "file" },
        version: 1,
        runOverride: true,
        createdAt: now,
        updatedAt: now,
      },
    ];

    let started = await api.startLoopInstance(
      project.projectId,
      doc.id,
      "spec_durable_di_1",
      "",
      { branch: "durable-di", materials },
    );
    let inst = started.instances[started.instances.length - 1]!;
    // Advance until implement attaches an activeRunId (or completes).
    for (let i = 0; i < 8 && !inst.activeRunId; i++) {
      started = await api.advanceLoopInstance(
        project.projectId,
        doc.id,
        inst.id,
      );
      inst = started.instances.find((x) => x.id === inst.id) ?? inst;
    }
    expect(inst.activeRunId).toBeTruthy();
    const runId = inst.activeRunId!;
    expect(runId.startsWith("run_loopback_")).toBe(true);

    const snapPath = agentRunSnapshotPath(workspace.projectOSRoot, runId);
    const logPath = agentRunLogPath(workspace.projectOSRoot, runId);
    expect(existsSync(snapPath)).toBe(true);
    expect(existsSync(logPath)).toBe(true);
    expect(readFileSync(snapPath, "utf8")).toContain(runId);

    const run = await api.getAgentRun(runId);
    expect(run.runId).toBe(runId);
    expect(run.status).toBe("complete");
    const events = await api.getAgentRunEvents(runId);
    expect(events.some((e) => e.type === "run_started")).toBe(true);
    expect(events.some((e) => e.type === "apply_result")).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(3);

    // Simulate reopen: new LocalApi against same workspace disk.
    const api2 = new ProjectOSLocalApi({ sampleWorkspaceRoot: sample });
    await api2.openSampleWorkspace();
    const run2 = await api2.getAgentRun(runId);
    expect(run2.runId).toBe(runId);
    const events2 = await api2.getAgentRunEvents(runId);
    expect(events2.length).toBe(events.length);

    await expect(api2.getAgentRun("run_definitely_missing_xyz")).rejects.toMatchObject({
      code: "run_not_found",
    });
  });
});
