import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { LoopSpec } from "../contracts/loop-graph.js";
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

function baseSpec(overrides: Partial<LoopSpec> & { nodes: LoopSpec["nodes"]; edges: LoopSpec["edges"] }): LoopSpec {
  return {
    version: "spec_arch_1",
    graphRevision: 1,
    goal: "Architecture runtime",
    acceptance: [],
    retryPolicy: { onFailure: "retry", maxAutoRetries: 3 },
    stopPolicy: { maxRounds: 5 },
    permissions: [
      {
        id: "perm_pr",
        action: "github.create_pr",
        scope: "repository",
        requiresApproval: true,
      },
    ],
    openQuestions: [],
    createdAt: "2026-11-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("loop-runtime architecture steppers", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("branches Condition on TestReport and respects fail retry budget", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-arch-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Condition loop");
    const spec = baseSpec({
      nodes: [
        {
          id: "n_cond",
          role: "unknown",
          type: "logic",
          logicKind: "condition",
          goal: "Branch on tests",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
        {
          id: "n_pass",
          role: "decide",
          type: "logic",
          logicKind: "exit",
          goal: "Done",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
        {
          id: "n_fail",
          role: "decide",
          type: "human",
          humanMode: "input",
          goal: "Collect fix hint",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [
        {
          id: "e_pass",
          from: "n_cond",
          to: "n_pass",
          kind: "conditional",
          branchKey: "pass",
        },
        {
          id: "e_fail",
          from: "n_cond",
          to: "n_fail",
          kind: "conditional",
          branchKey: "fail",
        },
      ],
      retryPolicy: { onFailure: "retry", maxAutoRetries: 1 },
      stopPolicy: { maxRounds: 1 },
    });
    doc = approveLoopSpec(root, doc.id, spec);

    // Seed a failed TestReport then step condition.
    doc = {
      ...doc,
      instances: [
        {
          id: "inst_1",
          specVersion: spec.version,
          status: "running",
          cursorNodeId: "n_cond",
          round: 0,
          attemptCounts: {},
          artifacts: [
            {
              id: "art_1",
              nodeId: "seed",
              kind: "test_report",
              createdAt: "2026-11-03T00:00:00.000Z",
              data: { status: "failed", total: 1, passed: 0, failed: 1 },
            },
          ],
          events: [],
          startedAt: "2026-11-03T00:00:00.000Z",
          updatedAt: "2026-11-03T00:00:00.000Z",
        },
      ],
    };
    doc = upsertLoopGraph(root, doc);
    doc = advanceLoopInstance(root, doc.id, "inst_1");
    expect(doc.instances[0]?.cursorNodeId).toBe("n_fail");
    expect(doc.instances[0]?.attemptCounts.n_fail).toBe(1);

    // Exhaust budget on second fail branch.
    doc = {
      ...doc,
      instances: doc.instances.map((item) => ({
        ...item,
        status: "running" as const,
        cursorNodeId: "n_cond",
        hitlQuestionIds: [],
        artifacts: [
          ...(item.artifacts ?? []),
          {
            id: "art_2",
            nodeId: "seed",
            kind: "test_report" as const,
            createdAt: "2026-11-03T00:00:01.000Z",
            data: { status: "failed" },
          },
        ],
      })),
    };
    doc = upsertLoopGraph(root, doc);
    doc = advanceLoopInstance(root, doc.id, "inst_1");
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");
    expect(doc.instances[0]?.hitlQuestionIds).toEqual(["stop_policy"]);
  });

  it("Condition pass path reaches Exit and completes", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-arch-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Pass exit");
    const spec = baseSpec({
      nodes: [
        {
          id: "n_cond",
          role: "unknown",
          type: "logic",
          logicKind: "condition",
          goal: "Branch",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
        {
          id: "n_exit",
          role: "decide",
          type: "logic",
          logicKind: "exit",
          goal: "Exit",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
        {
          id: "n_fail",
          role: "decide",
          type: "human",
          humanMode: "input",
          goal: "Fail sink",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [
        {
          id: "e_pass",
          from: "n_cond",
          to: "n_exit",
          kind: "conditional",
          branchKey: "pass",
        },
        {
          id: "e_fail",
          from: "n_cond",
          to: "n_fail",
          kind: "conditional",
          branchKey: "fail",
        },
      ],
    });
    doc = approveLoopSpec(root, doc.id, spec);
    doc = {
      ...doc,
      instances: [
        {
          id: "inst_pass",
          specVersion: spec.version,
          status: "running",
          cursorNodeId: "n_cond",
          round: 0,
          attemptCounts: {},
          artifacts: [
            {
              id: "art_ok",
              nodeId: "seed",
              kind: "test_report",
              createdAt: "2026-11-03T00:00:00.000Z",
              data: { status: "passed" },
            },
          ],
          events: [],
          startedAt: "2026-11-03T00:00:00.000Z",
          updatedAt: "2026-11-03T00:00:00.000Z",
        },
      ],
    };
    doc = upsertLoopGraph(root, doc);
    doc = advanceLoopInstance(root, doc.id, "inst_pass");
    expect(doc.instances[0]?.cursorNodeId).toBe("n_exit");
    doc = advanceLoopInstance(root, doc.id, "inst_pass");
    expect(doc.instances[0]?.status).toBe("complete");
    expect(
      doc.instances[0]?.events.some((event) =>
        event.message?.includes("Exit"),
      ),
    ).toBe(true);
  });

  it("Human approval edit payload is consumed by Create PR action", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-arch-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Approval action");
    const spec = baseSpec({
      nodes: [
        {
          id: "n_approval",
          role: "decide",
          type: "human",
          humanMode: "approval",
          goal: "Approve PR",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
        {
          id: "n_pr",
          role: "decide",
          type: "action",
          actionIntegration: "github",
          actionOperation: "create_pr",
          goal: "Create PR",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [
        { id: "e1", from: "n_approval", to: "n_pr", kind: "depends" },
      ],
    });
    doc = approveLoopSpec(root, doc.id, spec);
    doc = startLoopInstance(root, doc.id);
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");
    expect(doc.instances[0]?.hitlQuestionIds?.[0]).toContain("human_approval_");

    const instanceId = doc.instances[0]!.id;
    doc = resolveLoopHitl(
      root,
      doc.id,
      instanceId,
      [
        {
          questionId: doc.instances[0]!.hitlQuestionIds![0]!,
          answer: "approve",
          editedPayload: { title: "feat: feature tree", base: "main" },
        },
      ],
    );

    expect(doc.instances[0]?.status).toBe("complete");
    const github = doc.instances[0]?.artifacts?.find(
      (item) => item.kind === "github_op_result",
    );
    expect(github).toBeTruthy();
    expect(JSON.stringify(github?.data)).toContain("feat: feature tree");
  });

  it("Human review request_changes returns to coder target", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-arch-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Review changes");
    const spec = baseSpec({
      nodes: [
        {
          id: "n_coder",
          role: "implement",
          type: "agent",
          agentRole: "coder",
          goal: "Implement task",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
        {
          id: "n_review",
          role: "decide",
          type: "human",
          humanMode: "review",
          goal: "Review plan",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [
        { id: "e1", from: "n_coder", to: "n_review", kind: "depends" },
        {
          id: "e_fb",
          from: "n_review",
          to: "n_coder",
          kind: "feedback",
          when: "changes requested",
        },
      ],
    });
    doc = approveLoopSpec(root, doc.id, spec);
    doc = {
      ...doc,
      instances: [
        {
          id: "inst_review",
          specVersion: spec.version,
          status: "awaiting_hitl",
          cursorNodeId: "n_review",
          round: 0,
          attemptCounts: {},
          hitlQuestionIds: ["human_review_n_review"],
          events: [
            {
              id: "evt_1",
              at: "2026-11-03T00:00:00.000Z",
              type: "awaiting_hitl",
              nodeId: "n_review",
            },
          ],
          startedAt: "2026-11-03T00:00:00.000Z",
          updatedAt: "2026-11-03T00:00:00.000Z",
        },
      ],
    };
    doc = upsertLoopGraph(root, doc);
    doc = resolveLoopHitl(root, doc.id, "inst_review", [
      { questionId: "human_review_n_review", answer: "request_changes" },
    ]);
    expect(doc.instances[0]?.cursorNodeId).toBe("n_coder");
    // No leaf attached → implement fails, but redirect itself succeeded.
    expect(doc.instances[0]?.status).toBe("error");
    expect(doc.instances[0]?.errorMessage).toContain("文件未挂接");
  });

  it("Loop logic node stops after maxIterations", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-arch-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Loop max");
    const spec = baseSpec({
      nodes: [
        {
          id: "n_loop",
          role: "unknown",
          type: "logic",
          logicKind: "loop",
          maxIterations: 2,
          goal: "Bounded loop",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
        {
          id: "n_body",
          role: "decide",
          type: "logic",
          logicKind: "exit",
          goal: "Body/exit",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [{ id: "e1", from: "n_loop", to: "n_body", kind: "depends" }],
    });
    doc = approveLoopSpec(root, doc.id, spec);
    doc = startLoopInstance(root, doc.id);
    // iteration 1 → advances to body; second tick runs Exit
    expect(doc.instances[0]?.loopIterations?.n_loop).toBe(1);
    expect(doc.instances[0]?.cursorNodeId).toBe("n_body");
    doc = advanceLoopInstance(root, doc.id, doc.instances[0]!.id);
    expect(doc.instances[0]?.status).toBe("complete");

    // Manually re-enter loop past max
    doc = {
      ...doc,
      instances: [
        {
          ...doc.instances[0]!,
          id: "inst_loop2",
          status: "running",
          cursorNodeId: "n_loop",
          completedAt: undefined,
          loopIterations: { n_loop: 2 },
          events: [],
        },
      ],
    };
    doc = upsertLoopGraph(root, doc);
    const stepped = stepLoopInstance(doc, "inst_loop2");
    expect(stepped.instances[0]?.status).toBe("awaiting_hitl");
    expect(stepped.instances[0]?.hitlQuestionIds).toEqual(["loop_max_iterations"]);
  });
});
