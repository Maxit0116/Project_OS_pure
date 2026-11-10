import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  LOOP_INSTANCE_EVENT_LIMIT,
  type LoopInstance,
  type LoopInstanceEvent,
  type LoopSpec,
} from "../contracts/loop-graph.js";
import {
  LOOP_FILES_NOT_ATTACHED,
  LOOP_VERIFICATION_NOT_RUN,
  resolveLoopLeafWriteScope,
  type LoopAgentRunView,
  type LoopEvidenceView,
  type LoopExecutionHooks,
} from "./loop-execution.js";
import { compileIntentGraphHeuristic } from "./loop-graph-compiler.js";
import {
  approveLoopSpec,
  createLoopGraph,
  upsertLoopGraph,
} from "./loop-graph-service.js";
import {
  advanceLoopInstance,
  cancelLoopInstance,
  listLoopRunHistory,
  pauseLoopInstance,
  resolveLoopHitl,
  restoreLoopInstanceFromCheckpoint,
  resumeLoopInstance,
  startLoopInstance,
  startLoopInstanceFromEvent,
  startLoopInstanceWithParams,
  stepLoopInstance,
} from "./loop-runtime-service.js";

function scriptedLoopExecution(filePath = "src/login.ts"): {
  execution: LoopExecutionHooks;
  starts: string[];
  requests: Array<{ filePath: string; goal: string }>;
  paused: string[];
  cancelled: string[];
  finishApply: () => void;
  finishApplyOnStart: () => void;
  setStatus: (status: LoopAgentRunView["status"], applySucceeded?: boolean) => void;
  failEvidence: () => void;
  passEvidence: () => void;
  markNotRun: () => void;
} {
  const runs = new Map<string, LoopAgentRunView>();
  const evidence = new Map<string, LoopEvidenceView>();
  const starts: string[] = [];
  const paused: string[] = [];
  const cancelled: string[] = [];
  const requests: Array<{ filePath: string; goal: string }> = [];
  let seq = 0;
  let completeOnStart = false;
  const execution: LoopExecutionHooks = {
    leaf: { featureNodeId: "feat_login", filePath },
    readRun: (runId) => runs.get(runId) ?? null,
    readEvidence: (runId) => evidence.get(runId) ?? null,
    startAgentRun: (input) => {
      requests.push({ filePath: input.filePath, goal: input.goal });
      if (input.filePath !== filePath) {
        throw new Error(`write path escaped the feature graph: ${input.filePath}`);
      }
      seq += 1;
      const run: LoopAgentRunView = {
        runId: `run_${seq}`,
        status: completeOnStart ? "complete" : "queued",
        applySucceeded: completeOnStart,
      };
      runs.set(run.runId, run);
      starts.push(run.runId);
      return run;
    },
    pauseAgentRun: (runId) => {
      paused.push(runId);
    },
    cancelAgentRun: (runId) => {
      cancelled.push(runId);
    },
  };
  const current = () => runs.get(`run_${seq}`);
  return {
    execution,
    starts,
    requests,
    paused,
    cancelled,
    finishApply: () => {
      const run = current();
      if (!run) throw new Error("no run");
      run.status = "complete";
      run.applySucceeded = true;
    },
    finishApplyOnStart: () => {
      completeOnStart = true;
    },
    setStatus: (status, applySucceeded = false) => {
      const run = current();
      if (!run) throw new Error("no run");
      run.status = status;
      run.applySucceeded = applySucceeded;
    },
    failEvidence: () => {
      const run = current();
      if (!run) throw new Error("no run");
      evidence.set(run.runId, {
        id: `evidence_${run.runId}`,
        runId: run.runId,
        status: "failed",
      });
    },
    passEvidence: () => {
      const run = current();
      if (!run) throw new Error("no run");
      evidence.set(run.runId, {
        id: `evidence_${run.runId}`,
        runId: run.runId,
        status: "passed",
      });
    },
    markNotRun: () => {
      const run = current();
      if (!run) throw new Error("no run");
      evidence.set(run.runId, {
        id: `evidence_${run.runId}`,
        runId: run.runId,
        status: "not_run",
      });
    },
  };
}

describe("loop-runtime-service", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails implement when the feature graph has no leaf file attached", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Linear loop");
    doc = upsertLoopGraph(root, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt: "Implement then verify",
        nodes: [
          {
            id: "n1",
            title: "Implement",
            prompt: "Implement feature",
            role: "implement",
            position: { x: 0, y: 0 },
          },
          {
            id: "n2",
            title: "Verify",
            prompt: "Verify feature",
            role: "verify",
            position: { x: 0, y: 120 },
          },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2", kind: "depends" }],
      },
    });
    const compiled = compileIntentGraphHeuristic(doc.draft);
    doc = approveLoopSpec(root, doc.id, compiled.specDraft);
    doc = startLoopInstance(root, doc.id);
    expect(doc.instances[0]?.status).toBe("error");
    expect(doc.instances[0]?.errorMessage).toBe(LOOP_FILES_NOT_ATTACHED);
    expect(JSON.stringify(doc.instances[0]?.events)).not.toContain("Completed implement");
  });

  it("pauses an interrupted agent run and does not complete later nodes", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Interrupt loop");
    doc = upsertLoopGraph(root, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt: "Implement then verify",
        nodes: [
          {
            id: "n1",
            title: "Implement",
            prompt: "Implement feature",
            role: "implement",
            position: { x: 0, y: 0 },
          },
          {
            id: "n2",
            title: "Verify",
            prompt: "Verify feature",
            role: "verify",
            position: { x: 0, y: 120 },
          },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2", kind: "depends" }],
      },
    });
    const compiled = compileIntentGraphHeuristic(doc.draft);
    doc = approveLoopSpec(root, doc.id, compiled.specDraft);
    const hooks = scriptedLoopExecution();
    doc = startLoopInstance(root, doc.id, undefined, hooks.execution);
    const instanceId = doc.instances[0]!.id;
    hooks.setStatus("interrupted", true);
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    expect(doc.instances[0]?.status).toBe("paused");
    expect(doc.instances[0]?.cursorNodeId).toBe("n1");
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    expect(doc.instances[0]?.status).toBe("paused");
    expect(doc.instances[0]?.events.some((event) => event.type === "node_completed")).toBe(false);
  });

  it("keeps the approved spec version when a newer spec and a replan draft exist", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Replan loop");
    doc = upsertLoopGraph(root, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt: "Implement then verify",
        nodes: [
          {
            id: "n1",
            title: "Implement",
            prompt: "Implement feature",
            role: "implement",
            position: { x: 0, y: 0 },
          },
          {
            id: "n2",
            title: "Verify",
            prompt: "Verify feature",
            role: "verify",
            position: { x: 0, y: 120 },
          },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2", kind: "depends" }],
      },
    });
    const compiled = compileIntentGraphHeuristic(doc.draft);
    const approved = {
      ...compiled.specDraft,
      retryPolicy: { onFailure: "replan" as const, maxAutoRetries: 0 },
    };
    doc = approveLoopSpec(root, doc.id, approved);
    const boundVersion = doc.approvedSpecs[0]!.version;
    const boundNodes = doc.approvedSpecs[0]!.nodes.map((node) => node.id);
    const hooks = scriptedLoopExecution();
    doc = startLoopInstance(root, doc.id, undefined, hooks.execution);
    const instanceId = doc.instances[0]!.id;
    hooks.finishApply();
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    expect(doc.instances[0]?.specVersion).toBe(boundVersion);
    expect(doc.instances[0]?.cursorNodeId).toBe("n2");

    hooks.failEvidence();
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    const instance = doc.instances[0]!;
    expect(instance.specVersion).toBe(boundVersion);
    expect(instance.status).toBe("awaiting_hitl");
    expect(instance.hitlQuestionIds).toEqual(["spec_revision"]);
    expect(instance.cursorNodeId).toBe("n2");
    expect(doc.approvedSpecs.map((spec) => spec.version)).toEqual([boundVersion]);
    expect(doc.approvedSpecs[0]!.nodes.map((node) => node.id)).toEqual(boundNodes);
    expect(doc.pendingCompile?.specDraft.version).not.toBe(boundVersion);
    expect(doc.pendingCompile?.specDraft.nodes.map((node) => node.id)).toEqual(boundNodes);

    const replacement: LoopSpec = {
      ...approved,
      version: "spec_replacement",
      nodes: [
        {
          id: "other",
          role: "implement",
          goal: "A different step that must not run",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [
            { id: "acc_other", description: "Do not run this", kind: "human" },
          ],
        },
      ],
      edges: [],
    };
    doc = approveLoopSpec(root, doc.id, replacement);
    expect(doc.instances[0]?.specVersion).toBe(boundVersion);
    expect(doc.pendingCompile).toBeUndefined();

    hooks.passEvidence();
    const stepped = stepLoopInstance(
      {
        ...doc,
        instances: doc.instances.map((item) =>
          item.id === instanceId
            ? { ...item, status: "running", hitlQuestionIds: [] }
            : item,
        ),
      },
      instanceId,
      { execution: hooks.execution },
    );
    expect(stepped.instances[0]?.specVersion).toBe(boundVersion);
    expect(stepped.instances[0]?.status).toBe("complete");
    expect(stepped.instances[0]?.events.some((event) => event.nodeId === "other")).toBe(false);
    expect(stepped.approvedSpecs.map((spec) => spec.version)).toEqual([
      boundVersion,
      "spec_replacement",
    ]);
  });

  it("keeps the started event when the instance log is truncated", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Event cap");
    doc = upsertLoopGraph(root, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt: "Implement",
        nodes: [
          {
            id: "n1",
            title: "Implement",
            prompt: "Implement feature",
            role: "implement",
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      },
    });
    const compiled = compileIntentGraphHeuristic(doc.draft);
    doc = approveLoopSpec(root, doc.id, compiled.specDraft);
    const started: LoopInstanceEvent = {
      id: "evt_started",
      at: "2026-01-01T00:00:00.000Z",
      type: "started",
    };
    const fillers: LoopInstanceEvent[] = Array.from(
      { length: LOOP_INSTANCE_EVENT_LIMIT - 1 },
      (_, index) => ({
        id: `evt_f_${index}`,
        at: "2026-01-01T00:00:01.000Z",
        type: "message",
        message: `note ${index}`,
      }),
    );
    const instance: LoopInstance = {
      id: "inst_cap",
      specVersion: doc.approvedSpecs[0]!.version,
      status: "running",
      cursorNodeId: "n1",
      round: 0,
      attemptCounts: {},
      events: [started, ...fillers],
      startedAt: started.at,
      updatedAt: started.at,
    };
    doc = upsertLoopGraph(root, { ...doc, instances: [instance] });
    const hooks = scriptedLoopExecution();
    hooks.finishApplyOnStart();
    doc = advanceLoopInstance(root, doc.id, instance.id, hooks.execution);
    const events = doc.instances[0]!.events;
    expect(events).toHaveLength(LOOP_INSTANCE_EVENT_LIMIT);
    expect(events[0]).toMatchObject({ id: "evt_started", type: "started" });
    expect(events.some((event) => event.type === "node_completed")).toBe(true);
  });

  it("keeps implement parked until the attached run applies, and ignores node text", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = approveLinearLoop(root, "Implement writes evil.ts");
    const hooks = scriptedLoopExecution("src/login.ts");
    doc = startLoopInstance(root, doc.id, undefined, hooks.execution);
    const instanceId = doc.instances[0]!.id;
    expect(doc.instances[0]).toMatchObject({
      status: "running",
      activeRunId: "run_1",
      featureNodeId: "feat_login",
      cursorNodeId: "n1",
    });
    expect(hooks.starts).toEqual(["run_1"]);
    expect(hooks.requests[0]).toEqual({
      filePath: "src/login.ts",
      goal: "Implement writes evil.ts",
    });
    expect(doc.instances[0]?.events.some((event) => event.type === "node_completed")).toBe(false);

    hooks.setStatus("awaiting_review");
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    expect(doc.instances[0]?.status).toBe("awaiting_review");
    expect(hooks.starts).toEqual(["run_1"]);

    doc = pauseLoopInstance(root, doc.id, instanceId, hooks.execution);
    expect(doc.instances[0]?.status).toBe("paused");
    expect(hooks.paused).toEqual(["run_1"]);
    doc = resumeLoopInstance(root, doc.id, instanceId, hooks.execution);
    expect(doc.instances[0]?.status).toBe("awaiting_review");

    hooks.finishApply();
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    const completed = doc.instances[0]?.events.find((event) => event.type === "node_completed");
    expect(completed).toMatchObject({ agentRunId: "run_1" });
    expect(completed?.message).not.toContain("Completed implement");
    expect(doc.instances[0]?.cursorNodeId).toBe("n2");
  });

  it("takes a fallback edge instead of erroring when present", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Fallback");
    const spec: LoopSpec = {
      version: "spec_fallback",
      graphRevision: 1,
      goal: "Fallback path",
      nodes: [
        {
          id: "n1",
          role: "implement",
          type: "agent",
          agentRole: "coder",
          goal: "Primary",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
        {
          id: "n2",
          role: "implement",
          type: "agent",
          agentRole: "coder",
          goal: "Fallback coder",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [
        {
          id: "e_fb",
          from: "n1",
          to: "n2",
          kind: "fallback",
          when: "primary failed",
        },
      ],
      acceptance: [],
      retryPolicy: { onFailure: "fallback", maxAutoRetries: 0 },
      stopPolicy: { maxRounds: 3 },
      permissions: [],
      openQuestions: [],
      createdAt: "2026-11-09T00:00:00.000Z",
    };
    doc = approveLoopSpec(root, doc.id, spec);
    const hooks = scriptedLoopExecution();
    doc = startLoopInstance(root, doc.id, undefined, hooks.execution);
    hooks.setStatus("error");
    doc = advanceLoopInstance(root, doc.id, doc.instances[0]!.id, hooks.execution);
    expect(doc.instances[0]?.status).toBe("running");
    expect(doc.instances[0]?.cursorNodeId).toBe("n2");
    expect(doc.instances[0]?.events.some((event) => event.type === "fallback_taken")).toBe(
      true,
    );
  });

  it("pauses for HITL when wall-clock budget is exceeded", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = approveLinearLoop(root, "Implement");
    const hooks = scriptedLoopExecution();
    doc = startLoopInstance(root, doc.id, undefined, hooks.execution);
    const instanceId = doc.instances[0]!.id;
    const stale = {
      ...doc,
      instances: doc.instances.map((item) =>
        item.id === instanceId
          ? {
              ...item,
              startedAt: new Date(Date.now() - 60_000).toISOString(),
            }
          : item,
      ),
      approvedSpecs: doc.approvedSpecs.map((spec, index) =>
        index === doc.approvedSpecs.length - 1
          ? {
              ...spec,
              stopPolicy: { ...spec.stopPolicy, maxWallClockMs: 1_000 },
            }
          : spec,
      ),
    };
    doc = upsertLoopGraph(root, stale);
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");
    expect(doc.instances[0]?.hitlQuestionIds).toEqual(["wall_clock_timeout"]);
  });

  it("cancels an active instance and forwards cancelAgentRun", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = approveLinearLoop(root, "Implement");
    const hooks = scriptedLoopExecution();
    doc = startLoopInstance(root, doc.id, undefined, hooks.execution);
    const instanceId = doc.instances[0]!.id;
    doc = cancelLoopInstance(root, doc.id, instanceId, hooks.execution);
    expect(doc.instances[0]?.status).toBe("cancelled");
    expect(hooks.cancelled).toEqual(["run_1"]);
    expect(doc.instances[0]?.events.some((event) => event.type === "cancelled")).toBe(true);
  });

  it("drains parallel depends fan-out into Merge (P0 serial)", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Parallel");
    const spec: LoopSpec = {
      version: "spec_parallel",
      graphRevision: 1,
      goal: "Parallel drain",
      nodes: [
        {
          id: "n_start",
          role: "implement",
          type: "agent",
          agentRole: "planner",
          goal: "Start",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
        {
          id: "n_a",
          role: "implement",
          type: "agent",
          agentRole: "coder",
          goal: "Branch A",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
        {
          id: "n_b",
          role: "implement",
          type: "agent",
          agentRole: "coder",
          goal: "Branch B",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
        {
          id: "n_merge",
          role: "unknown",
          type: "logic",
          logicKind: "merge",
          goal: "Join",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [
        { id: "e1", from: "n_start", to: "n_a", kind: "depends" },
        { id: "e2", from: "n_start", to: "n_b", kind: "depends" },
        { id: "e3", from: "n_a", to: "n_merge", kind: "depends" },
        { id: "e4", from: "n_b", to: "n_merge", kind: "depends" },
      ],
      acceptance: [],
      retryPolicy: { onFailure: "pause_hitl", maxAutoRetries: 0 },
      stopPolicy: { maxRounds: 5 },
      permissions: [],
      openQuestions: [],
      createdAt: "2026-11-09T00:00:00.000Z",
    };
    doc = approveLoopSpec(root, doc.id, spec);
    const hooks = scriptedLoopExecution();
    doc = startLoopInstance(root, doc.id, undefined, hooks.execution);
    // Planner emits DevPlan without AgentRun, then ready-set picks n_a.
    expect(doc.instances[0]?.cursorNodeId).toBe("n_a");

    hooks.finishApplyOnStart();
    let guard = 0;
    while (doc.instances[0]?.status === "running" && guard < 12) {
      doc = advanceLoopInstance(root, doc.id, doc.instances[0]!.id, hooks.execution);
      guard += 1;
    }
    expect(hooks.starts.length).toBeGreaterThanOrEqual(2);
    expect(doc.instances[0]?.status).toBe("complete");
    expect(doc.instances[0]?.nodeRecords?.find((r) => r.nodeId === "n_a")?.status).toBe(
      "succeeded",
    );
    expect(doc.instances[0]?.nodeRecords?.find((r) => r.nodeId === "n_b")?.status).toBe(
      "succeeded",
    );
    expect(doc.instances[0]?.nodeRecords?.find((r) => r.nodeId === "n_merge")?.status).toBe(
      "succeeded",
    );
  });

  it("stops a failed implement run instead of following feedback", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = approveLinearLoop(root, "Implement", { feedback: true });
    const hooks = scriptedLoopExecution();
    doc = startLoopInstance(root, doc.id, undefined, hooks.execution);
    hooks.setStatus("error");
    doc = advanceLoopInstance(root, doc.id, doc.instances[0]!.id, hooks.execution);
    expect(doc.instances[0]?.status).toBe("error");
    expect(doc.instances[0]?.events.some((event) => event.type === "feedback_taken")).toBe(false);
    expect(hooks.starts).toEqual(["run_1"]);
  });

  it("follows failed evidence into a new run and leaves not_run for a person", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = approveLinearLoop(root, "Implement", { feedback: true, maxRounds: 5 });
    const hooks = scriptedLoopExecution();
    doc = startLoopInstance(root, doc.id, undefined, hooks.execution);
    const instanceId = doc.instances[0]!.id;
    hooks.finishApply();
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    hooks.failEvidence();
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    expect(doc.instances[0]).toMatchObject({ cursorNodeId: "n1", round: 1 });
    expect(doc.instances[0]?.activeRunId).toBeUndefined();
    expect(doc.instances[0]?.events.some((event) =>
      event.type === "feedback_taken" && event.evidenceId === "evidence_run_1",
    )).toBe(true);

    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    expect(hooks.starts).toEqual(["run_1", "run_2"]);
    expect(doc.instances[0]?.activeRunId).toBe("run_2");

    const notRunRoot = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(notRunRoot);
    let notRun = approveLinearLoop(notRunRoot, "Implement", { feedback: true });
    const notRunHooks = scriptedLoopExecution();
    notRun = startLoopInstance(notRunRoot, notRun.id, undefined, notRunHooks.execution);
    notRunHooks.finishApply();
    notRun = advanceLoopInstance(notRunRoot, notRun.id, notRun.instances[0]!.id, notRunHooks.execution);
    notRunHooks.markNotRun();
    notRun = advanceLoopInstance(notRunRoot, notRun.id, notRun.instances[0]!.id, notRunHooks.execution);
    expect(notRun.instances[0]?.status).toBe("awaiting_hitl");
    expect(notRun.instances[0]?.events.at(-1)?.message).toBe(LOOP_VERIFICATION_NOT_RUN);
    expect(notRunHooks.starts).toEqual(["run_1"]);
  });

  it("asks a person when stop policy is exhausted and records the answer on the instance", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = approveLinearLoop(root, "Implement", { feedback: true, maxRounds: 1 });
    const hooks = scriptedLoopExecution();
    doc = startLoopInstance(root, doc.id, undefined, hooks.execution);
    const instanceId = doc.instances[0]!.id;
    hooks.finishApply();
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    hooks.failEvidence();
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    expect(doc.instances[0]?.cursorNodeId).toBe("n1");
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    hooks.finishApply();
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    hooks.failEvidence();
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");
    expect(doc.instances[0]?.hitlQuestionIds).toEqual(["stop_policy"]);
    const eventCount = doc.instances[0]!.events.length;
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    expect(doc.instances[0]?.events).toHaveLength(eventCount);
    expect(hooks.starts).toEqual(["run_1", "run_2"]);

    doc = resolveLoopHitl(root, doc.id, instanceId, [
      { questionId: "stop_policy", answer: "stop" },
    ], hooks.execution);
    expect(doc.instances[0]?.status).toBe("error");
    expect(doc.instances[0]?.events.some((event) =>
      event.type === "hitl_resolved" && event.message?.includes("stop_policy=stop"),
    )).toBe(true);
    expect(JSON.stringify(doc)).not.toContain("agent-memory");
  });

  it("resolves a decide node through the existing HITL answer", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Decide");
    doc = upsertLoopGraph(root, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt: "Decide then implement",
        nodes: [
          {
            id: "n1",
            title: "Decide",
            prompt: "Approve the change",
            role: "decide",
            position: { x: 0, y: 0 },
          },
          {
            id: "n2",
            title: "Implement",
            prompt: "Write evil.ts",
            role: "implement",
            position: { x: 0, y: 80 },
          },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2", kind: "depends" }],
      },
    });
    doc = approveLoopSpec(root, doc.id, compileIntentGraphHeuristic(doc.draft).specDraft);
    const hooks = scriptedLoopExecution();
    doc = startLoopInstance(root, doc.id, undefined, hooks.execution);
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");
    expect(hooks.starts).toEqual([]);
    const questionId = doc.instances[0]!.hitlQuestionIds?.[0] ?? "decide_n1";
    doc = resolveLoopHitl(root, doc.id, doc.instances[0]!.id, [
      { questionId, answer: "ship it" },
    ], hooks.execution);
    expect(doc.instances[0]?.events.some((event) =>
      event.type === "hitl_resolved" && event.message?.includes("ship it"),
    )).toBe(true);
    expect(doc.instances[0]?.cursorNodeId).toBe("n2");
    // Human approval now advances into the next node on resolve.
    expect(hooks.starts).toEqual(["run_1"]);
    expect(doc.instances[0]?.activeRunId).toBe("run_1");
  });

  it("persists checkpoints and restores cursor/nodeRecords (GC-4.1)", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = approveLinearLoop(root, "Implement");
    const hooks = scriptedLoopExecution();
    doc = startLoopInstance(root, doc.id, undefined, hooks.execution);
    const instanceId = doc.instances[0]!.id;
    expect(doc.instances[0]?.checkpoint).toBeTruthy();
    expect(doc.instances[0]?.events.some((e) => e.type === "checkpoint_saved")).toBe(true);

    hooks.finishApply();
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    const cursorBefore = doc.instances[0]!.cursorNodeId;
    const checkpointCursor = doc.instances[0]!.checkpoint?.cursorNodeId;
    expect(checkpointCursor).toBeTruthy();

    doc = pauseLoopInstance(root, doc.id, instanceId, hooks.execution);
    doc = {
      ...doc,
      instances: doc.instances.map((item) =>
        item.id === instanceId
          ? {
              ...item,
              cursorNodeId: "n_missing",
              status: "error" as const,
              errorMessage: "simulated crash",
            }
          : item,
      ),
    };
    doc = upsertLoopGraph(root, doc);
    doc = restoreLoopInstanceFromCheckpoint(root, doc.id, instanceId, hooks.execution);
    expect(doc.instances[0]?.cursorNodeId).toBe(checkpointCursor ?? cursorBefore);
    expect(doc.instances[0]?.status).not.toBe("error");
  });

  it("dedupes launch by idempotencyKey and validates params (GC-4.3 / GC-5.1)", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = approveLinearLoop(root, "Implement");
    const approved = doc.approvedSpecs[0]!;
    doc = approveLoopSpec(root, doc.id, {
      ...approved,
      version: "spec_params",
      inputParams: [
        { name: "branch", type: "string", required: true },
        { name: "dryRun", type: "boolean", required: false, defaultValue: false },
      ],
    });

    expect(() =>
      startLoopInstanceWithParams(root, doc.id, {}),
    ).toThrow(/Missing required launch param: branch/);

    doc = startLoopInstanceWithParams(
      root,
      doc.id,
      { branch: "feat/login", dryRun: true },
      { idempotencyKey: "launch-1" },
    );
    expect(doc.instances).toHaveLength(1);
    expect(doc.instances[0]?.launch).toMatchObject({
      kind: "params",
      idempotencyKey: "launch-1",
      params: { branch: "feat/login", dryRun: true },
    });

    const again = startLoopInstanceWithParams(
      root,
      doc.id,
      { branch: "other" },
      { idempotencyKey: "launch-1" },
    );
    expect(again.instances).toHaveLength(1);
    expect(again.instances[0]?.id).toBe(doc.instances[0]?.id);
  });

  it("dedupes internal event launches (GC-5.2)", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = approveLinearLoop(root, "Implement");
    doc = upsertLoopGraph(root, { ...doc, instances: [] });

    doc = startLoopInstanceFromEvent(root, doc.id, {
      eventId: "ev_1",
      eventType: "verification.failed",
      payload: { reason: "flake" },
    });
    expect(doc.instances).toHaveLength(1);
    expect(doc.instances[0]?.launch?.kind).toBe("event");

    const again = startLoopInstanceFromEvent(root, doc.id, {
      eventId: "ev_1",
      eventType: "verification.failed",
    });
    expect(again.instances).toHaveLength(1);
  });

  it("marks freshness stale and budgets wall clock (GC-4.2 / GC-4.5)", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = approveLinearLoop(root, "Implement");
    const approved = doc.approvedSpecs[0]!;
    doc = approveLoopSpec(root, doc.id, {
      ...approved,
      version: "spec_fresh",
      stalePolicy: "pause_hitl",
      stopPolicy: { ...approved.stopPolicy, maxBudgetTokens: 1 },
    });
    const hooks = scriptedLoopExecution();
    doc = startLoopInstance(root, doc.id, undefined, hooks.execution);
    const instanceId = doc.instances[0]!.id;
    expect(doc.instances[0]?.freshness?.status).toBe("fresh");
    expect(doc.instances[0]?.budgetUsage).toBeTruthy();

    doc = {
      ...doc,
      instances: doc.instances.map((item) =>
        item.id === instanceId
          ? {
              ...item,
              freshness: {
                status: "fresh" as const,
                baselineId: "old_baseline",
                pathFingerprint: "old_baseline",
                checkedAt: item.startedAt,
              },
              budgetUsage: { tokens: 99, wallClockMs: 0, retries: 0 },
              status: "running" as const,
            }
          : item,
      ),
    };
    doc = upsertLoopGraph(root, doc);
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");
    expect(
      doc.instances[0]?.hitlQuestionIds?.some((id) =>
        id === "freshness_stale" || id === "budget_exceeded",
      ),
    ).toBe(true);
  });

  it("blocks multi_run when shared leaf conflicts (GC-7.1)", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Parallel multi");
    const spec: LoopSpec = {
      version: "spec_multi",
      graphRevision: 1,
      goal: "Parallel multi_run",
      parallelMode: "multi_run",
      nodes: [
        {
          id: "n_start",
          role: "implement",
          type: "agent",
          agentRole: "planner",
          goal: "Start",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
        {
          id: "n_a",
          role: "implement",
          type: "agent",
          agentRole: "coder",
          goal: "Branch A",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
        {
          id: "n_b",
          role: "implement",
          type: "agent",
          agentRole: "coder",
          goal: "Branch B",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
        {
          id: "n_merge",
          role: "unknown",
          type: "logic",
          logicKind: "merge",
          goal: "Join",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [
        { id: "e1", from: "n_start", to: "n_a", kind: "depends" },
        { id: "e2", from: "n_start", to: "n_b", kind: "depends" },
        { id: "e3", from: "n_a", to: "n_merge", kind: "depends" },
        { id: "e4", from: "n_b", to: "n_merge", kind: "depends" },
      ],
      acceptance: [],
      retryPolicy: { onFailure: "pause_hitl", maxAutoRetries: 0 },
      stopPolicy: { maxRounds: 5 },
      permissions: [],
      openQuestions: [],
      createdAt: "2026-11-09T00:00:00.000Z",
    };
    doc = approveLoopSpec(root, doc.id, spec);
    const hooks = scriptedLoopExecution();
    hooks.execution.allowConcurrentLoopRuns = true;
    doc = startLoopInstance(root, doc.id, {
      execution: hooks.execution,
    });
    expect(doc.instances[0]?.cursorNodeId).toBe("n_a");
    const instanceId = doc.instances[0]!.id;
    // Starting the first coder while sibling n_b is ready → shared-leaf conflict.
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks.execution);
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");
    expect(doc.instances[0]?.hitlQuestionIds).toEqual(["write_conflict"]);
    expect(doc.instances[0]?.activeRunIds?.length).toBeGreaterThanOrEqual(1);
  });

  it("lists run history (GC-6.3)", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = approveLinearLoop(root, "Implement");
    doc = startLoopInstance(root, doc.id);
    const history = listLoopRunHistory(root, doc.id);
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0]?.id).toBe(doc.instances[0]?.id);
  });

  it("blocks resume when AgentRun is missing (GC-4.3)", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-rt-"));
    roots.push(root);
    let doc = approveLinearLoop(root, "Implement");
    const hooks = scriptedLoopExecution();
    doc = startLoopInstance(root, doc.id, undefined, hooks.execution);
    const instanceId = doc.instances[0]!.id;
    doc = pauseLoopInstance(root, doc.id, instanceId, hooks.execution);
    const orphanHooks: LoopExecutionHooks = {
      ...hooks.execution,
      readRun: () => null,
    };
    doc = resumeLoopInstance(root, doc.id, instanceId, orphanHooks);
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");
    expect(doc.instances[0]?.hitlQuestionIds).toEqual(["unknown_side_effects"]);
  });
});

function approveLinearLoop(
  root: string,
  implementPrompt: string,
  options?: { feedback?: boolean; maxRounds?: number },
) {
  let doc = createLoopGraph(root, "proj", "Linear loop");
  doc = upsertLoopGraph(root, {
    ...doc,
    draft: {
      revision: 1,
      graphPrompt: "Implement then verify",
      nodes: [
        {
          id: "n1",
          title: "Implement",
          prompt: implementPrompt,
          role: "implement",
          position: { x: 0, y: 0 },
        },
        {
          id: "n2",
          title: "Verify",
          prompt: "Verify feature",
          role: "verify",
          position: { x: 0, y: 120 },
        },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2", kind: "depends" },
        ...(options?.feedback
          ? [{
              id: "e2",
              source: "n2",
              target: "n1",
              kind: "feedback" as const,
              prompt: "On failure",
            }]
          : []),
      ],
    },
  });
  const compiled = compileIntentGraphHeuristic(doc.draft);
  const spec = options?.maxRounds
    ? {
        ...compiled.specDraft,
        stopPolicy: { ...compiled.specDraft.stopPolicy, maxRounds: options.maxRounds },
      }
    : compiled.specDraft;
  return approveLoopSpec(root, doc.id, spec);
}

describe("resolveLoopLeafWriteScope", () => {
  it("uses the single childless linked file and ignores extra candidates", () => {
    expect(resolveLoopLeafWriteScope([
      { id: "parent", children: ["leaf"], linkedFiles: [{ path: "src/parent.ts" }] },
      { id: "leaf", linkedFiles: [{ path: "src/login.ts" }] },
    ])).toEqual({ featureNodeId: "leaf", filePath: "src/login.ts" });

    expect(resolveLoopLeafWriteScope([
      { id: "a", linkedFiles: [{ path: "src/a.ts" }] },
      { id: "b", linkedFiles: [{ path: "src/b.ts" }] },
    ])).toBeNull();

    expect(resolveLoopLeafWriteScope([
      { id: "a", linkedFiles: [{ path: "src/a.ts" }] },
      { id: "b", linkedFiles: [{ path: "src/b.ts" }] },
    ], "b")).toEqual({ featureNodeId: "b", filePath: "src/b.ts" });
  });
});
