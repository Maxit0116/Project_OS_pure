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
  computeEngineeringBaseline,
  digestOperationPayload,
  isApprovalBindingCurrent,
} from "./loop-approval-binding.js";
import { pushArtifact } from "./loop-runtime-architecture.js";
import {
  advanceLoopInstance,
  resolveLoopHitl,
  startLoopInstance,
} from "./loop-runtime-service.js";

function baseSpec(
  overrides: Partial<LoopSpec> & {
    nodes: LoopSpec["nodes"];
    edges: LoopSpec["edges"];
  },
): LoopSpec {
  return {
    version: "spec_bind_1",
    graphRevision: 1,
    goal: "Approval binding",
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
    createdAt: "2026-11-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("loop approval binding (engineering baseline)", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function approvePrDoc(root: string) {
    let doc = createLoopGraph(root, "proj", "Approval bind");
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
      edges: [{ id: "e1", from: "n_approval", to: "n_pr", kind: "depends" }],
    });
    doc = approveLoopSpec(root, doc.id, spec);
    return { doc, spec };
  }

  it("binds approval to artifacts + payload and executes create_pr", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-bind-"));
    roots.push(root);
    let { doc } = approvePrDoc(root);
    doc = startLoopInstance(root, doc.id);
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");

    let seeded = pushArtifact(doc.instances[0]!, {
      nodeId: "n_coder",
      kind: "change_set",
      data: {
        files: ["src/feature.ts"],
        summary: "Added feature tree",
        agentRunId: "run_seed",
      },
    });
    doc = upsertLoopGraph(root, {
      ...doc,
      instances: [seeded],
    });

    const baselineBefore = computeEngineeringBaseline(doc.instances[0]!).baseline;
    const instanceId = doc.instances[0]!.id;
    const questionId = doc.instances[0]!.hitlQuestionIds![0]!;
    doc = resolveLoopHitl(root, doc.id, instanceId, [
      {
        questionId,
        answer: "approve",
        actor: "terran",
        editedPayload: { title: "feat: tree", base: "main" },
      },
    ]);

    const after = doc.instances[0]!;
    expect(after.status).toBe("complete");
    const decision = [...(after.artifacts ?? [])]
      .reverse()
      .find((item) => item.kind === "human_decision");
    expect(decision?.data).toMatchObject({
      choice: "approve",
      actor: "terran",
      binding: {
        engineeringBaseline: baselineBefore,
        operationDigest: digestOperationPayload({
          title: "feat: tree",
          base: "main",
        }),
        status: "valid",
      },
    });
    const github = after.artifacts?.find((item) => item.kind === "github_op_result");
    expect(JSON.stringify(github?.data)).toContain("feat: tree");
    expect(after.pendingApprovalBinding).toBeUndefined();
  });

  it("invalidates approval when ChangeSet changes and blocks create_pr", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-bind-stale-"));
    roots.push(root);
    let { doc, spec } = approvePrDoc(root);

    let working = pushArtifact(
      {
        id: "inst_stale",
        specVersion: spec.version,
        status: "running",
        cursorNodeId: "n_pr",
        round: 0,
        attemptCounts: {},
        events: [
          {
            id: "evt_1",
            at: "2026-11-10T00:00:00.000Z",
            type: "started",
          },
        ],
        startedAt: "2026-11-10T00:00:00.000Z",
        updatedAt: "2026-11-10T00:00:00.000Z",
        artifacts: [],
      },
      {
        nodeId: "n_coder",
        kind: "change_set",
        data: {
          files: ["src/a.ts"],
          summary: "v1",
          agentRunId: "run_1",
        },
      },
    );
    const v1 = working.artifacts![0]!;
    const engineering = computeEngineeringBaseline(working);
    working = {
      ...working,
      pendingActionPayload: { title: "feat: v1" },
      pendingApprovalBinding: {
        decisionArtifactId: "art_decision",
        instanceId: working.id,
        nodeId: "n_approval",
        artifactIds: engineering.artifactIds,
        engineeringBaseline: engineering.baseline,
        operationDigest: digestOperationPayload({ title: "feat: v1" }),
        actor: "reviewer",
        approvedAt: "2026-11-10T00:00:00.000Z",
      },
      artifacts: [
        ...working.artifacts!,
        {
          id: "art_decision",
          nodeId: "n_approval",
          kind: "human_decision",
          createdAt: "2026-11-10T00:00:00.000Z",
          data: {
            mode: "approval",
            choice: "approve",
            at: "2026-11-10T00:00:00.000Z",
            nodeId: "n_approval",
            binding: {
              instanceId: working.id,
              nodeId: "n_approval",
              artifactIds: [v1.id],
              engineeringBaseline: engineering.baseline,
              operationDigest: digestOperationPayload({ title: "feat: v1" }),
              status: "valid",
            },
          },
        },
      ],
    };

    // Mutate engineering evidence after approval.
    working = pushArtifact(working, {
      nodeId: "n_coder",
      kind: "change_set",
      data: {
        files: ["src/a.ts", "src/b.ts"],
        summary: "v2 after approval",
        agentRunId: "run_2",
      },
    });
    expect(working.pendingApprovalBinding).toBeUndefined();
    expect(working.pendingActionPayload).toBeUndefined();
    const decision = working.artifacts?.find((item) => item.id === "art_decision");
    expect(
      (decision?.data as { binding?: { status?: string } }).binding?.status,
    ).toBe("invalidated");

    doc = upsertLoopGraph(root, { ...doc, instances: [working] });
    doc = advanceLoopInstance(root, doc.id, working.id);
    const after = doc.instances[0]!;
    expect(after.status).toBe("awaiting_hitl");
    expect(after.hitlQuestionIds?.[0]).toContain("human_approval_");
    expect(after.events.some((event) => event.type === "approval_stale")).toBe(
      true,
    );
    expect(
      after.artifacts?.some((item) => item.kind === "github_op_result"),
    ).toBe(false);
  });

  it("rejects bare historical approve without live binding", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-bind-bare-"));
    roots.push(root);
    let { doc, spec } = approvePrDoc(root);
    const working = {
      id: "inst_bare",
      specVersion: spec.version,
      status: "running" as const,
      cursorNodeId: "n_pr",
      round: 0,
      attemptCounts: {},
      events: [
        {
          id: "evt_1",
          at: "2026-11-10T00:00:00.000Z",
          type: "started" as const,
        },
      ],
      startedAt: "2026-11-10T00:00:00.000Z",
      updatedAt: "2026-11-10T00:00:00.000Z",
      artifacts: [
        {
          id: "art_old",
          nodeId: "n_approval",
          kind: "human_decision" as const,
          createdAt: "2026-11-10T00:00:00.000Z",
          data: {
            mode: "approval",
            choice: "approve",
            at: "2026-11-10T00:00:00.000Z",
            nodeId: "n_approval",
          },
        },
      ],
    };
    doc = upsertLoopGraph(root, { ...doc, instances: [working] });
    doc = advanceLoopInstance(root, doc.id, working.id);
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");
    expect(
      doc.instances[0]?.artifacts?.some((item) => item.kind === "github_op_result"),
    ).toBe(false);
  });

  it("isApprovalBindingCurrent fails on payload tamper", () => {
    const instance = {
      id: "inst_1",
      specVersion: "v1",
      status: "running" as const,
      cursorNodeId: "n_pr",
      round: 0,
      attemptCounts: {},
      events: [],
      startedAt: "2026-11-10T00:00:00.000Z",
      updatedAt: "2026-11-10T00:00:00.000Z",
      artifacts: [
        {
          id: "art_cs",
          nodeId: "n_coder",
          kind: "change_set" as const,
          createdAt: "2026-11-10T00:00:00.000Z",
          data: { files: ["a.ts"], summary: "x" },
        },
      ],
    };
    const engineering = computeEngineeringBaseline(instance);
    const payload = { title: "feat" };
    expect(
      isApprovalBindingCurrent({
        binding: {
          decisionArtifactId: "d1",
          instanceId: "inst_1",
          nodeId: "n_approval",
          artifactIds: engineering.artifactIds,
          engineeringBaseline: engineering.baseline,
          operationDigest: digestOperationPayload(payload),
          approvedAt: "2026-11-10T00:00:00.000Z",
        },
        instance,
        payload,
      }),
    ).toBe(true);
    expect(
      isApprovalBindingCurrent({
        binding: {
          decisionArtifactId: "d1",
          instanceId: "inst_1",
          nodeId: "n_approval",
          artifactIds: engineering.artifactIds,
          engineeringBaseline: engineering.baseline,
          operationDigest: digestOperationPayload(payload),
          approvedAt: "2026-11-10T00:00:00.000Z",
        },
        instance,
        payload: { title: "feat-tampered" },
      }),
    ).toBe(false);
  });
});
