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
import type { LoopExecutionHooks } from "./loop-execution.js";
import {
  computeEngineeringBaseline,
  digestOperationPayload,
} from "./loop-approval-binding.js";
import {
  advanceLoopInstance,
  completePendingGithubOp,
  resolveLoopHitl,
  startLoopInstance,
  stepLoopInstance,
} from "./loop-runtime-service.js";

function baseSpec(
  overrides: Partial<LoopSpec> & { nodes: LoopSpec["nodes"]; edges: LoopSpec["edges"] },
): LoopSpec {
  return {
    version: "spec_actions_1",
    graphRevision: 1,
    goal: "Action coverage",
    acceptance: [],
    retryPolicy: { onFailure: "retry", maxAutoRetries: 2 },
    stopPolicy: { maxRounds: 3 },
    permissions: [
      {
        id: "perm_pr",
        action: "github.create_pr",
        scope: "repository",
        requiresApproval: true,
      },
      {
        id: "perm_term",
        action: "terminal.exec",
        scope: "workspace",
        requiresApproval: true,
      },
    ],
    openQuestions: [],
    createdAt: "2026-11-03T00:00:00.000Z",
    ...overrides,
  };
}

function dryHooks(
  overrides: Partial<LoopExecutionHooks> = {},
): LoopExecutionHooks {
  return {
    leaf: { featureNodeId: "feat_1", filePath: "src/feature-tree.tsx" },
    readRun: () => null,
    readEvidence: () => null,
    startAgentRun: () => ({
      runId: "run_dry",
      status: "complete",
      applySucceeded: true,
    }),
    ...overrides,
  };
}

describe("loop-runtime Terminal + deferred GitHub", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("queues deferred create_pr until completePendingGithubOp", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-gh-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Deferred PR");
    const spec = baseSpec({
      nodes: [
        {
          id: "n_pr",
          role: "unknown",
          type: "action",
          actionIntegration: "github",
          actionOperation: "create_pr",
          goal: "Open PR",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [],
    });
    doc = approveLoopSpec(root, doc.id, spec);
    const hooks = dryHooks({
      executeGithubOperation: () => ({
        ok: true,
        deferred: true,
        message: "queued",
      }),
    });

    doc = startLoopInstance(root, doc.id, undefined, hooks);
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");

    doc = resolveLoopHitl(
      root,
      doc.id,
      doc.instances[0]!.id,
      [
        {
          questionId: doc.instances[0]!.hitlQuestionIds![0]!,
          answer: "approve",
          editedPayload: { title: "feat: deferred", head: "feat/x", base: "main" },
        },
      ],
      hooks,
    );

    expect(doc.instances[0]?.pendingGithubOp?.operation).toBe("create_pr");
    expect(doc.instances[0]?.status).toBe("running");
    expect(
      doc.instances[0]?.artifacts?.some((item) => item.kind === "github_op_result"),
    ).toBe(false);

    // Advance while pending must be a no-op.
    const before = doc.instances[0]!.updatedAt;
    doc = advanceLoopInstance(root, doc.id, doc.instances[0]!.id, hooks);
    expect(doc.instances[0]?.pendingGithubOp).toBeTruthy();
    expect(doc.instances[0]?.updatedAt).toBe(before);

    doc = upsertLoopGraph(
      root,
      completePendingGithubOp(doc, doc.instances[0]!.id, {
        ok: true,
        url: "https://github.com/example/repo/pull/9",
        number: 9,
        message: "created via settle",
      }),
    );
    expect(doc.instances[0]?.pendingGithubOp).toBeUndefined();
    expect(doc.instances[0]?.status).toBe("complete");
    expect(JSON.stringify(doc.instances[0]?.artifacts)).toContain("pull/9");
  });

  it("fails Terminal Action on policy_denied", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-term-deny-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Terminal deny");
    const spec = baseSpec({
      nodes: [
        {
          id: "n_term",
          role: "unknown",
          type: "action",
          actionIntegration: "terminal",
          actionOperation: "exec",
          goal: "echo hello",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [],
      permissions: [
        {
          id: "perm_term",
          action: "terminal.exec",
          scope: "workspace",
          requiresApproval: false,
        },
      ],
    });
    doc = approveLoopSpec(root, doc.id, spec);
    const hooks = dryHooks({
      executeTerminalCommand: () => ({
        ok: false,
        exitCode: null,
        policyDenied: true,
        message: "Terminal policy_denied",
      }),
    });
    const payload = { command: "echo", approved: true };
    const seedInstance = {
      id: "inst_term",
      specVersion: spec.version,
      status: "running" as const,
      cursorNodeId: "n_term",
      round: 0,
      attemptCounts: {},
      pendingActionPayload: payload,
      events: [],
      startedAt: "2026-11-03T00:00:00.000Z",
      updatedAt: "2026-11-03T00:00:00.000Z",
    };
    const engineering = computeEngineeringBaseline(seedInstance);
    const stepped = stepLoopInstance(
      {
        ...doc,
        instances: [
          {
            ...seedInstance,
            pendingApprovalBinding: {
              decisionArtifactId: "art_decision",
              instanceId: "inst_term",
              nodeId: "n_term",
              artifactIds: engineering.artifactIds,
              engineeringBaseline: engineering.baseline,
              operationDigest: digestOperationPayload(payload),
              approvedAt: "2026-11-03T00:00:00.000Z",
            },
          },
        ],
      },
      "inst_term",
      { execution: hooks },
    );
    expect(stepped.instances[0]?.status).toBe("error");
    expect(stepped.instances[0]?.errorMessage).toMatch(/policy_denied/i);
  });

  it("completes Terminal exec after approval when policy allows", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-term-ok-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Terminal ok");
    const spec = baseSpec({
      nodes: [
        {
          id: "n_term",
          role: "unknown",
          type: "action",
          actionIntegration: "terminal",
          actionOperation: "exec",
          goal: "echo hello-loop",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [],
    });
    doc = approveLoopSpec(root, doc.id, spec);
    const hooks = dryHooks({
      executeTerminalCommand: (input) => ({
        ok: true,
        exitCode: 0,
        message: `ok ${input.command}`,
        stdout: "hello-loop\n",
      }),
    });
    doc = startLoopInstance(root, doc.id, undefined, hooks);
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");
    doc = resolveLoopHitl(
      root,
      doc.id,
      doc.instances[0]!.id,
      [
        {
          questionId: doc.instances[0]!.hitlQuestionIds![0]!,
          answer: "approve",
          editedPayload: { command: "echo hello-loop" },
        },
      ],
      hooks,
    );
    expect(doc.instances[0]?.status).toBe("complete");
    expect(
      doc.instances[0]?.artifacts?.some((item) => item.kind === "change_set"),
    ).toBe(true);
  });

  it("blocks high-risk Terminal until Approval", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-term-risk-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Terminal risk");
    const spec = baseSpec({
      nodes: [
        {
          id: "n_term",
          role: "unknown",
          type: "action",
          actionIntegration: "terminal",
          actionOperation: "exec",
          goal: "rm -rf /tmp/demo",
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
    doc = startLoopInstance(root, doc.id, undefined, dryHooks());
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");
    expect(doc.instances[0]?.hitlQuestionIds?.[0]).toContain("human_approval");
  });

  it("Feature Development E2E keeps leaf ChangeSet + deferred PR settle linkage", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-e2e-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Feature Dev E2E");
    const preset = getLoopGraphPreset("feature_development")!;
    const compiled = compileIntentGraphHeuristic(preset.draft, {
      now: "2026-11-03T00:00:00.000Z",
    });
    doc = approveLoopSpec(root, doc.id, compiled.specDraft);

    const runs = new Map<
      string,
      { runId: string; status: "queued" | "complete"; applySucceeded: boolean }
    >();
    let seq = 0;
    const hooks = dryHooks({
      startAgentRun: () => {
        seq += 1;
        const run = {
          runId: `run_e2e_${seq}`,
          status: "complete" as const,
          applySucceeded: true,
        };
        runs.set(run.runId, run);
        return run;
      },
      readRun: (runId) => runs.get(runId) ?? null,
      executeGithubOperation: () => ({
        ok: true,
        deferred: true,
        message: "PR queued",
      }),
    });

    doc = startLoopInstance(root, doc.id, undefined, hooks);
    const instanceId = doc.instances[0]!.id;
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks);
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");
    doc = resolveLoopHitl(
      root,
      doc.id,
      instanceId,
      [{ questionId: doc.instances[0]!.hitlQuestionIds![0]!, answer: "accept" }],
      hooks,
    );

    // Coder ChangeSet should reference the functional-graph leaf path (C4 linkage).
    const changeSet = doc.instances[0]?.artifacts?.find(
      (item) => item.kind === "change_set",
    );
    expect(JSON.stringify(changeSet?.data)).toContain("feature-tree.tsx");
    // Agent Flow linkage: implement events carry the orchestrated run id.
    expect(
      doc.instances[0]?.events.some(
        (event) =>
          typeof event.message === "string" &&
          /run_e2e_/i.test(event.message),
      ) || Boolean(doc.instances[0]?.events.some((e) => e.type === "node_completed")),
    ).toBe(true);

    const conditionId = compiled.specDraft.nodes.find(
      (node) => node.logicKind === "condition",
    )!.id;
    const approvalId = compiled.specDraft.nodes.find(
      (node) => node.humanMode === "approval",
    )!.id;
    const prId = compiled.specDraft.nodes.find(
      (node) => node.actionOperation === "create_pr",
    )!.id;

    doc = {
      ...doc,
      instances: doc.instances.map((item) =>
        item.id === instanceId
          ? {
              ...item,
              status: "running" as const,
              cursorNodeId: conditionId,
              hitlQuestionIds: [],
              featureNodeId: "feat_1",
              // Jumping past verify: mark upstream nodes succeeded so ready-set
              // does not reopen n_test ahead of the approval gate.
              nodeRecords: (item.nodeRecords ?? compiled.specDraft.nodes.map((node) => ({
                nodeId: node.id,
                status: "pending" as const,
                updatedAt: item.startedAt,
              }))).map((record) =>
                record.nodeId === conditionId
                  ? { ...record, status: "ready" as const }
                  : record.nodeId === approvalId ||
                      record.nodeId === prId ||
                      record.nodeId.startsWith("n_review")
                    ? { ...record, status: "pending" as const }
                    : { ...record, status: "succeeded" as const },
              ),
              artifacts: [
                ...(item.artifacts ?? []),
                {
                  id: "art_test",
                  nodeId: "n_test",
                  kind: "test_report" as const,
                  createdAt: "2026-11-03T00:00:02.000Z",
                  data: { status: "passed", passed: 3, total: 3 },
                },
              ],
            }
          : item,
      ),
    };
    doc = upsertLoopGraph(root, doc);
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks);
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks);
    expect(doc.instances[0]?.cursorNodeId).toBe(approvalId);
    doc = advanceLoopInstance(root, doc.id, instanceId, hooks);
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");

    doc = resolveLoopHitl(
      root,
      doc.id,
      instanceId,
      [
        {
          questionId: doc.instances[0]!.hitlQuestionIds![0]!,
          answer: "approve",
          editedPayload: {
            title: "feat: feature tree",
            base: "main",
            head: "feat/tree",
          },
        },
      ],
      hooks,
    );

    expect(doc.instances[0]?.pendingGithubOp?.nodeId).toBe(prId);
    expect(doc.instances[0]?.featureNodeId).toBe("feat_1");

    doc = upsertLoopGraph(
      root,
      completePendingGithubOp(doc, instanceId, {
        ok: true,
        url: "https://github.com/example/repo/pull/42",
        number: 42,
        message: "settled",
        refs: { title: "feat: feature tree" },
      }),
    );
    expect(doc.instances[0]?.status).toBe("complete");
    expect(JSON.stringify(doc.instances[0]?.artifacts)).toContain("pull/42");
  });
});
