/**
 * Production runtime approval semantics (not edge-array-only):
 * reject → zero tool calls; approve with binding → execute once;
 * param drift → re-approval; orphan approval → preflight blocker.
 */
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
import type { LoopExecutionHooks } from "./loop-execution.js";
import {
  computeEngineeringBaseline,
  digestOperationPayload,
} from "./loop-approval-binding.js";
import { preflightLoopRunStart } from "./loop-run-preflight.js";
import {
  insertApprovalGate,
  validateApprovalGateWiring,
} from "./loop-approval-insert.js";
import {
  advanceLoopInstance,
  resolveLoopHitl,
  startLoopInstance,
  stepLoopInstance,
} from "./loop-runtime-service.js";

function baseSpec(
  overrides: Partial<LoopSpec> & { nodes: LoopSpec["nodes"]; edges: LoopSpec["edges"] },
): LoopSpec {
  return {
    version: "spec_appr_rt_1",
    graphRevision: 1,
    goal: "Approval runtime gate",
    acceptance: [],
    retryPolicy: { onFailure: "retry", maxAutoRetries: 1 },
    stopPolicy: { maxRounds: 2 },
    permissions: [
      {
        id: "perm_term",
        action: "terminal.exec",
        scope: "workspace",
        requiresApproval: true,
      },
    ],
    openQuestions: [],
    createdAt: "2026-11-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("approval runtime gate (reject/approve/drift/orphan)", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("insertApprovalGate before_write sits before coder (not after)", () => {
    const draft = {
      revision: 1,
      graphPrompt: "g",
      nodes: [
        {
          id: "n_planner",
          title: "Planner",
          prompt: "p",
          type: "agent" as const,
          agentRole: "planner" as const,
          position: { x: 0, y: 0 },
        },
        {
          id: "n_coder",
          title: "Coder",
          prompt: "c",
          type: "agent" as const,
          agentRole: "coder" as const,
          position: { x: 0, y: 80 },
        },
        {
          id: "n_test",
          title: "Test",
          prompt: "t",
          type: "action" as const,
          actionIntegration: "test" as const,
          actionOperation: "run",
          position: { x: 0, y: 160 },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "n_planner",
          target: "n_coder",
          kind: "depends" as const,
          prompt: "",
        },
        {
          id: "e2",
          source: "n_coder",
          target: "n_test",
          kind: "depends" as const,
          prompt: "",
        },
      ],
    };
    const next = insertApprovalGate(draft, {
      gate: "before_write",
      approvalNodeId: "n_appr",
    });
    const triples = next.edges.map((e) => `${e.id}:${e.source}->${e.target}`);
    expect(triples).toContain("e1:n_planner->n_appr");
    expect(triples).toContain("e_appr_e1:n_appr->n_coder");
    // coder→test untouched — write gate is before coder
    expect(triples).toContain("e2:n_coder->n_test");
    expect(validateApprovalGateWiring(next).filter((i) => i.code === "approval_orphaned")).toEqual(
      [],
    );
  });

  it("reject → zero terminal tool calls; approve binding → exactly one call", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-appr-rt-"));
    roots.push(root);
    let calls = 0;
    const hooks: LoopExecutionHooks = {
      leaf: { featureNodeId: "feat_1", filePath: "src/feature-tree.tsx" },
      readRun: () => null,
      readEvidence: () => null,
      startAgentRun: () => ({
        runId: "run_x",
        status: "complete",
        applySucceeded: true,
      }),
      digestWorkspacePaths: (paths) => ({
        digests: Object.fromEntries(paths.map((p) => [p, `d_${p}`])),
        missing: [],
        unreadable: [],
        tombstones: [],
        undeleted: [],
      }),
      executeTerminalCommand: () => {
        calls += 1;
        return {
          ok: true,
          exitCode: 0,
          message: "ok",
          stdout: "hello",
        };
      },
    };

    let doc = createLoopGraph(root, "proj", "Appr RT");
    const spec = baseSpec({
      nodes: [
        {
          id: "n_term",
          role: "unknown",
          type: "action",
          actionIntegration: "terminal",
          actionOperation: "exec",
          goal: "echo gated",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [],
    });
    doc = approveLoopSpec(root, doc.id, spec);
    doc = startLoopInstance(root, doc.id, undefined, hooks);
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");
    expect(calls).toBe(0);

    // Reject — zero tool side effects
    doc = resolveLoopHitl(
      root,
      doc.id,
      doc.instances[0]!.id,
      [
        {
          questionId: doc.instances[0]!.hitlQuestionIds![0]!,
          answer: "reject",
        },
      ],
      hooks,
    );
    expect(calls).toBe(0);
    expect(doc.instances[0]?.status).toBe("error");
    expect(doc.instances[0]?.errorMessage).toMatch(/rejected/i);

    // Fresh start → approve with payload → one call
    calls = 0;
    doc = startLoopInstance(root, doc.id, undefined, hooks);
    const payload = { command: "echo", args: ["gated"], approved: true };
    doc = resolveLoopHitl(
      root,
      doc.id,
      doc.instances[doc.instances.length - 1]!.id,
      [
        {
          questionId: doc.instances[doc.instances.length - 1]!.hitlQuestionIds![0]!,
          answer: "approve",
          editedPayload: payload,
        },
      ],
      hooks,
    );
    // May still be running/complete after approve+step
    for (let i = 0; i < 4; i++) {
      const inst = doc.instances[doc.instances.length - 1]!;
      if (inst.status === "complete" || inst.status === "error") break;
      doc = advanceLoopInstance(root, doc.id, inst.id, hooks);
    }
    expect(calls).toBe(1);
  });

  it("param drift invalidates approval — second tool call blocked until re-approve", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-appr-drift-"));
    roots.push(root);
    let calls = 0;
    const hooks: LoopExecutionHooks = {
      leaf: null,
      readRun: () => null,
      readEvidence: () => null,
      startAgentRun: () => ({
        runId: "run_x",
        status: "complete",
        applySucceeded: true,
      }),
      digestWorkspacePaths: () => ({
        digests: {},
        missing: [],
        unreadable: [],
      }),
      executeTerminalCommand: () => {
        calls += 1;
        return { ok: true, exitCode: 0, message: "ok" };
      },
    };

    let doc = createLoopGraph(root, "proj", "Drift");
    const spec = baseSpec({
      nodes: [
        {
          id: "n_term",
          role: "unknown",
          type: "action",
          actionIntegration: "terminal",
          actionOperation: "exec",
          goal: "echo",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [],
    });
    doc = approveLoopSpec(root, doc.id, spec);

    const payload = { command: "echo", args: ["v1"] };
    const seed = {
      id: "inst_drift",
      specVersion: spec.version,
      status: "running" as const,
      cursorNodeId: "n_term",
      round: 0,
      attemptCounts: {},
      pendingActionPayload: payload,
      events: [] as [],
      startedAt: "2026-11-10T00:00:00.000Z",
      updatedAt: "2026-11-10T00:00:00.000Z",
    };
    const engineering = computeEngineeringBaseline(seed);
    // Binding stamped for v1
    const withBinding = {
      ...doc,
      instances: [
        {
          ...seed,
          pendingApprovalBinding: {
            decisionArtifactId: "art_d",
            instanceId: "inst_drift",
            nodeId: "n_term",
            artifactIds: engineering.artifactIds,
            engineeringBaseline: engineering.baseline,
            operationDigest: digestOperationPayload(payload),
            approvedAt: "2026-11-10T00:00:00.000Z",
          },
        },
      ],
    };
    // Drift payload while keeping old binding
    const drifted = {
      ...withBinding,
      instances: [
        {
          ...withBinding.instances[0]!,
          pendingActionPayload: { command: "echo", args: ["v2-drifted"] },
        },
      ],
    };
    const stepped = stepLoopInstance(drifted, "inst_drift", { execution: hooks });
    expect(calls).toBe(0);
    expect(stepped.instances[0]?.status).toBe("awaiting_hitl");
    expect(
      stepped.instances[0]?.events.some((e) => e.type === "approval_stale"),
    ).toBe(true);
  });

  it("orphan approval fails preflight (blocker)", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-appr-orphan-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Orphan");
    doc = upsertLoopGraph(root, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt: "g",
        nodes: [
          {
            id: "n_coder",
            title: "Coder",
            prompt: "c",
            type: "agent",
            agentRole: "coder",
            position: { x: 0, y: 0 },
          },
          {
            id: "n_orphan",
            title: "Orphan approval",
            prompt: "x",
            type: "human",
            humanMode: "approval",
            position: { x: 40, y: 40 },
          },
        ],
        edges: [],
      },
    });
    const spec = baseSpec({
      version: "spec_orphan",
      nodes: [
        {
          id: "n_coder",
          role: "implement",
          type: "agent",
          agentRole: "coder",
          goal: "impl",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [],
      permissions: [],
    });
    doc = approveLoopSpec(root, doc.id, spec);
    const pf = preflightLoopRunStart({
      document: doc,
      branch: "main",
      materials: [],
    });
    expect(pf.canStart).toBe(false);
    expect(pf.items.some((i) => /not wired|orphan/i.test(i.message))).toBe(true);
  });
});
