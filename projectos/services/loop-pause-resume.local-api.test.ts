/**
 * Gate/Recovery product path: LocalApi pause → status paused → resume.
 * State-change evidence (not UI button presence). Seeds running instance
 * then calls LocalApi pause/resume (start may error without leaf — not this claim).
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  approveLoopSpec,
  createLoopGraph,
  getLoopGraph,
  upsertLoopGraph,
} from "./loop-graph-service.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";
import type { LoopSpec } from "../contracts/loop-graph.js";

const sampleWorkspaceRoot = resolve("..", "sample-graph-saas");

describe("LocalApi pause/resume status change (GC Gate/Recovery)", () => {
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

  it("pause then resume changes instance.status via LocalApi", async () => {
    const sample = mkdtempSync(join(tmpdir(), "loop-pause-api-"));
    roots.push(sample);
    cpSync(sampleWorkspaceRoot, sample, { recursive: true });
    mkdirSync(join(sample, "src"), { recursive: true });
    writeFileSync(join(sample, "src/a.ts"), "export const a = 1\n");

    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: sample });
    const project = await api.openSampleWorkspace();
    const workspaceRoot = (
      api as unknown as {
        requireLoadedWorkspace: (id: string) => { workspaceRoot: string };
      }
    ).requireLoadedWorkspace(project.projectId).workspaceRoot;

    let doc = createLoopGraph(workspaceRoot, project.projectId, "Pause Resume");
    const spec: LoopSpec = {
      version: "spec_pause_1",
      graphRevision: 1,
      goal: "pause",
      acceptance: [],
      retryPolicy: { onFailure: "retry", maxAutoRetries: 1 },
      stopPolicy: { maxRounds: 3 },
      permissions: [],
      openQuestions: [],
      createdAt: "2026-11-10T00:00:00.000Z",
      nodes: [
        {
          id: "n_impl",
          role: "implement",
          type: "agent",
          agentRole: "coder",
          goal: "noop",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [],
    };
    doc = approveLoopSpec(workspaceRoot, doc.id, spec);
    doc = upsertLoopGraph(workspaceRoot, {
      ...doc,
      instances: [
        {
          id: "inst_pause",
          specVersion: "spec_pause_1",
          status: "running",
          cursorNodeId: "n_impl",
          // No activeRunId: resume need not invent a missing AgentRun (GC-4.3).
          startedAt: "2026-11-10T00:00:00.000Z",
          updatedAt: "2026-11-10T00:00:00.000Z",
          round: 0,
          attemptCounts: {},
          events: [{ id: "e1", at: "2026-11-10T00:00:00.000Z", type: "started" }],
        },
      ],
    });

    doc = await api.pauseLoopInstance(project.projectId, doc.id, "inst_pause");
    const paused = doc.instances.find((i) => i.id === "inst_pause");
    expect(paused?.status).toBe("paused");
    expect(paused?.events.some((e) => e.type === "paused")).toBe(true);

    doc = await api.resumeLoopInstance(project.projectId, doc.id, "inst_pause");
    const resumed = doc.instances.find((i) => i.id === "inst_pause");
    // Resume leaves paused; subsequent auto-step may error without leaf — that is
    // orthogonal. Claim = LocalApi pause/resume events + exit paused.
    expect(resumed?.status).not.toBe("paused");
    expect(resumed?.events.some((e) => e.type === "resumed")).toBe(true);
    expect(resumed?.events.some((e) => e.type === "paused")).toBe(true);

    const reloaded = getLoopGraph(workspaceRoot, doc.id);
    expect(
      reloaded?.instances
        .find((i) => i.id === "inst_pause")
        ?.events.some((e) => e.type === "resumed"),
    ).toBe(true);
  });
});

