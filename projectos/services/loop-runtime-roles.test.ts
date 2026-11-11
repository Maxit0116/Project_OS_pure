import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { LoopSpec } from "../contracts/loop-graph.js";
import { getLoopGraphPreset } from "../contracts/loop-presets.js";
import { compileIntentGraphHeuristic } from "./loop-graph-compiler.js";
import {
  approveLoopSpec,
  createLoopGraph,
  upsertLoopGraph,
} from "./loop-graph-service.js";
import {
  advanceLoopInstance,
  resolveLoopHitl,
  startLoopInstance,
  stepLoopInstance,
} from "./loop-runtime-service.js";
import type { LoopExecutionHooks } from "./loop-execution.js";

function scriptedCoderHooks(): LoopExecutionHooks {
  const runs = new Map<string, { runId: string; status: "queued" | "complete"; applySucceeded: boolean }>();
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
    readRun: (runId) => runs.get(runId) ?? null,
    readEvidence: () => null,
    startAgentRun: () => {
      seq += 1;
      const run = {
        runId: `run_${seq}`,
        status: "complete" as const,
        applySucceeded: true,
      };
      runs.set(run.runId, run);
      return run;
    },
    executeGithubOperation: (input) => ({
      ok: true,
      simulated: false,
      url: "https://github.com/example/repo/pull/42",
      number: 42,
      message: "created",
      refs: Object.fromEntries(
        Object.entries(input.payload).map(([key, value]) => [key, String(value)]),
      ),
    }),
  };
}

describe("loop-runtime agent roles", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("Planner writes DevPlan; Coder consumes task and emits ChangeSet", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-roles-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Planner coder");
    const spec: LoopSpec = {
      version: "spec_roles_1",
      graphRevision: 1,
      goal: "Add Feature Tree",
      nodes: [
        {
          id: "n_planner",
          role: "implement",
          type: "agent",
          agentRole: "planner",
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
      createdAt: "2026-11-03T00:00:00.000Z",
    };
    doc = approveLoopSpec(root, doc.id, spec);
    const hooks = scriptedCoderHooks();
    doc = startLoopInstance(root, doc.id, undefined, hooks);
    expect(doc.instances[0]?.artifacts?.some((item) => item.kind === "dev_plan")).toBe(
      true,
    );
    expect(doc.instances[0]?.cursorNodeId).toBe("n_coder");

    doc = advanceLoopInstance(root, doc.id, doc.instances[0]!.id, hooks);
    expect(doc.instances[0]?.status).toBe("complete");
    const changeSet = doc.instances[0]?.artifacts?.find(
      (item) => item.kind === "change_set",
    );
    expect(changeSet).toBeTruthy();
    expect(JSON.stringify(changeSet?.data)).toContain("feature-tree.tsx");
    expect(JSON.stringify(changeSet?.data)).toContain("T1");
  });

  it("Reviewer needs_changes returns to Coder when tests failed", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-roles-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Reviewer");
    const spec: LoopSpec = {
      version: "spec_review_1",
      graphRevision: 1,
      goal: "Review changes",
      nodes: [
        {
          id: "n_coder",
          role: "implement",
          type: "agent",
          agentRole: "coder",
          goal: "Code",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
        {
          id: "n_reviewer",
          role: "implement",
          type: "agent",
          agentRole: "reviewer",
          goal: "Review",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [
        { id: "e1", from: "n_coder", to: "n_reviewer", kind: "depends" },
        {
          id: "e_fb",
          from: "n_reviewer",
          to: "n_coder",
          kind: "feedback",
          when: "needs changes",
        },
      ],
      acceptance: [],
      retryPolicy: { onFailure: "retry", maxAutoRetries: 3 },
      stopPolicy: { maxRounds: 5 },
      permissions: [],
      openQuestions: [],
      createdAt: "2026-11-03T00:00:00.000Z",
    };
    doc = approveLoopSpec(root, doc.id, spec);
    doc = {
      ...doc,
      instances: [
        {
          id: "inst_rev",
          specVersion: spec.version,
          status: "running",
          cursorNodeId: "n_reviewer",
          round: 0,
          attemptCounts: {},
          artifacts: [
            {
              id: "a1",
              nodeId: "n_coder",
              kind: "change_set",
              createdAt: "2026-11-03T00:00:00.000Z",
              data: { files: ["a.ts"], summary: "wip", agentRunId: "run_1" },
            },
            {
              id: "a2",
              nodeId: "n_test",
              kind: "test_report",
              createdAt: "2026-11-03T00:00:01.000Z",
              data: { status: "failed", failed: 1 },
            },
          ],
          events: [],
          startedAt: "2026-11-03T00:00:00.000Z",
          updatedAt: "2026-11-03T00:00:00.000Z",
        },
      ],
    };
    doc = upsertLoopGraph(root, doc);
    const hooks = scriptedCoderHooks();
    const stepped = stepLoopInstance(doc, "inst_rev", { execution: hooks });
    expect(stepped.instances[0]?.cursorNodeId).toBe("n_coder");
    expect(
      stepped.instances[0]?.artifacts?.some((item) => item.kind === "review_result"),
    ).toBe(true);
  });

  it("Feature Development preset reaches Create PR with injected GitHub hook", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-roles-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Feature Dev");
    const preset = getLoopGraphPreset("feature_development")!;
    const compiled = compileIntentGraphHeuristic(preset.draft, {
      now: "2026-11-03T00:00:00.000Z",
    });
    doc = approveLoopSpec(root, doc.id, compiled.specDraft);
    const hooks = scriptedCoderHooks();

    // Drive: planner → human review accept → coder → skip test by seeding report + jump
    doc = startLoopInstance(root, doc.id, undefined, hooks);
    expect(
      doc.instances[0]?.artifacts?.some((item) => item.kind === "dev_plan"),
    ).toBe(true);

    const instanceId = doc.instances[0]!.id;
    // Planner advances to Human Review; next tick enters HITL.
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks);
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");
    doc = resolveLoopHitl(
      root,
      doc.id,
      instanceId,
      [
        {
          questionId: doc.instances[0]!.hitlQuestionIds![0]!,
          answer: "accept",
        },
      ],
      hooks,
    );
    // Coder should have run (auto-step after review)
    expect(
      doc.instances[0]?.artifacts?.some((item) => item.kind === "change_set"),
    ).toBe(true);

    // Seed passed TestReport and place cursor on Condition, then Reviewer → Approval → PR
    const conditionId = compiled.specDraft.nodes.find(
      (node) => node.logicKind === "condition",
    )!.id;
    const approvalId = compiled.specDraft.nodes.find(
      (node) => node.humanMode === "approval",
    )!.id;
    const prId = compiled.specDraft.nodes.find(
      (node) => node.actionOperation === "create_pr",
    )!.id;

    const codeDigest = (() => {
      const change = doc.instances[0]?.artifacts?.find(
        (item) => item.kind === "change_set",
      );
      const data = change?.data as { contentDigest?: string } | undefined;
      return data?.contentDigest ?? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    })();
    doc = {
      ...doc,
      instances: doc.instances.map((item) =>
        item.id === instanceId
          ? {
              ...item,
              status: "running" as const,
              cursorNodeId: conditionId,
              hitlQuestionIds: [],
              // The runtime tracks completion per node: a test report alone leaves the test node "ready"
              // and sends the cursor back to run it. A real run leaves it succeeded.
              nodeRecords: (item.nodeRecords ?? []).map((record) =>
                record.nodeId === "n_test" ? { ...record, status: "succeeded" as const } : record,
              ),
              artifacts: [
                ...(item.artifacts ?? []),
                {
                  id: "art_test",
                  nodeId: "n_test",
                  kind: "test_report" as const,
                  createdAt: "2026-11-03T00:00:02.000Z",
                  data: {
                    status: "passed",
                    passed: 3,
                    total: 3,
                    validatedCodeDigest: codeDigest,
                  },
                },
              ],
            }
          : item,
      ),
    };
    doc = upsertLoopGraph(root, doc);
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks); // condition → reviewer
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks); // reviewer pass → approval
    expect(doc.instances[0]?.cursorNodeId).toBe(approvalId);
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks); // enter approval HITL
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");
    expect(doc.instances[0]?.cursorNodeId).toBe(approvalId);

    doc = resolveLoopHitl(
      root,
      doc.id,
      instanceId,
      [
        {
          questionId: doc.instances[0]!.hitlQuestionIds![0]!,
          answer: "approve",
          editedPayload: { title: "feat: feature tree", base: "main", head: "feat/tree" },
        },
      ],
      hooks,
    );

    expect(doc.instances[0]?.status).toBe("complete");
    const github = doc.instances[0]?.artifacts?.find(
      (item) => item.kind === "github_op_result",
    );
    expect(github).toBeTruthy();
    expect(JSON.stringify(github?.data)).toContain("pull/42");
    expect(JSON.stringify(github?.data)).toContain("feat: feature tree");
    // Ensure we actually visited the PR node
    expect(
      doc.instances[0]?.events.some(
        (event) => event.nodeId === prId && event.type === "node_completed",
      ),
    ).toBe(true);
  });
});
