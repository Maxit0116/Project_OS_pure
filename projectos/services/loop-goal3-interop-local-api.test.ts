/**
 * Goal3 richer Agent interop — beyond budget-only contract.
 *
 * Deterministic planner→coder consultation: Planner emits DevPlan; Coder
 * consumes a task via startAgentRun with agentDefinitionId under a frozen
 * RunBinding (projectId + requirePreflight). No live model / no invented KPI.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { LoopSpec } from "../contracts/loop-graph.js";
import { approveLoopSpec, createLoopGraph } from "./loop-graph-service.js";
import type { LoopExecutionHooks } from "./loop-execution.js";
import {
  advanceLoopInstance,
  startLoopInstance,
} from "./loop-runtime-service.js";

function scriptedCoderHooks(): LoopExecutionHooks {
  const runs = new Map<
    string,
    { runId: string; status: "complete"; applySucceeded: true }
  >();
  let seq = 0;
  const fileDigest = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  return {
    leaf: { featureNodeId: "feat_1", filePath: "src/feature-tree.tsx" },
    digestWorkspacePaths: (paths, options) => ({
      digests: Object.fromEntries(paths.map((path) => [path, fileDigest])),
      missing: [],
      unreadable: [],
      tombstones: [...(options?.deletedPaths ?? [])],
      undeleted: [],
    }),
    startAgentRun: (req) => {
      seq += 1;
      const run = {
        runId: `run_g3_${seq}`,
        status: "complete" as const,
        applySucceeded: true as const,
        unifiedDiff: `diff --git a/${req.filePath}\n+// task:${req.taskId ?? "none"} def:${req.agentDefinitionId ?? "none"}\n`,
      };
      runs.set(run.runId, run);
      return run;
    },
    readRun: (runId) => runs.get(runId) ?? null,
    readEvidence: () => null,
  };
}

describe("Goal3 Agent interop (beyond budget contract)", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("planner DevPlan → coder consultation under frozen RunBinding", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-g3-interop-"));
    roots.push(root);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/feature-tree.tsx"), "export {}\n");
    let doc = createLoopGraph(root, "proj_g3", "G3 interop");
    const spec: LoopSpec = {
      version: "spec_g3_interop",
      graphRevision: 1,
      goal: "Planner consults Coder via DevPlan task handoff",
      nodes: [
        {
          id: "n_planner",
          role: "implement",
          type: "agent",
          agentRole: "planner",
          agentDefinitionId: "agent_def_planner",
          goal: "Plan the feature",
          constraints: ["Keep existing graph UX"],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
        {
          id: "n_coder",
          role: "implement",
          type: "agent",
          agentRole: "coder",
          agentDefinitionId: "agent_def_coder",
          goal: "Implement first task",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [{ id: "e1", from: "n_planner", to: "n_coder", kind: "depends" }],
      acceptance: [],
      retryPolicy: { onFailure: "retry", maxAutoRetries: 2 },
      stopPolicy: { maxRounds: 3 },
      permissions: [],
      openQuestions: [],
      createdAt: "2026-11-10T00:00:00.000Z",
    };
    doc = approveLoopSpec(root, doc.id, spec);
    const hooks = scriptedCoderHooks();

    doc = startLoopInstance(root, doc.id, {
      specVersion: spec.version,
      projectId: "proj_g3",
      requirePreflight: true,
      execution: hooks,
    });

    const inst = doc.instances[0]!;
    expect(inst.runBinding?.projectId).toBe("proj_g3");
    expect(inst.runBinding?.budget?.maxRounds).toBe(3);
    expect(inst.runBinding?.budget?.maxAgentCalls).toBeGreaterThan(0);
    expect(inst.runBinding?.codeDigestStatus).toBe("complete");
    expect(inst.artifacts?.some((item) => item.kind === "dev_plan")).toBe(true);
    expect(inst.cursorNodeId).toBe("n_coder");

    doc = advanceLoopInstance(root, doc.id, inst.id, hooks);
    const after = doc.instances[0]!;
    expect(after.status).toBe("complete");
    const changeSet = after.artifacts?.find((item) => item.kind === "change_set");
    expect(changeSet).toBeTruthy();
    expect(JSON.stringify(changeSet?.data)).toMatch(/T1|task/i);
    expect(after.budgetUsage?.agentCalls ?? 0).toBeGreaterThanOrEqual(1);
    expect(after.runBinding?.budget?.maxRounds).toBe(3);
    expect(after.runBinding?.definitionDigest).toBe(inst.runBinding?.definitionDigest);
  });
});
