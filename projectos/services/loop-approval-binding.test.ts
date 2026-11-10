import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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
  buildApprovalBinding,
  combineFileDigests,
  computeEngineeringBaseline,
  createWorkspacePathDigester,
  digestOperationPayload,
  diffIntentGraphs,
  isApprovalBindingCurrent,
  isApprovalChoice,
} from "./loop-approval-binding.js";
import { pushArtifact } from "./loop-runtime-architecture.js";
import { settlePendingGithubOpWithProbe } from "./loop-github-dispatch.js";
import {
  advanceLoopInstance,
  completePendingGithubOp,
  denyPendingGithubOpBeforeHttp,
  preflightPendingGithubDispatch,
  resolveLoopHitl,
  startLoopInstance,
  stepLoopInstance,
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

  it("binds approval to action node + empty-file baseline and executes create_pr", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-bind-"));
    roots.push(root);
    let { doc } = approvePrDoc(root);
    doc = startLoopInstance(root, doc.id);
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");

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
        nodeId: "n_pr",
        actionIntegration: "github",
        actionOperation: "create_pr",
        actorKind: "local_declared",
        status: "valid",
      },
    });
    const github = after.artifacts?.find((item) => item.kind === "github_op_result");
    expect(JSON.stringify(github?.data)).toContain("feat: tree");
  });

  it("invalidates when workspace file content drifts after ChangeSet stamp", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-bind-dirty-"));
    roots.push(root);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/a.ts"), " consola = 1;\n", "utf8");
    const digester = createWorkspacePathDigester(root);
    const first = digester(["src/a.ts"]);
    const contentDigest = combineFileDigests(first.digests);

    const instance = {
      id: "inst_dirty",
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
          data: {
            files: ["src/a.ts"],
            summary: "v1",
            contentDigest,
            fileDigests: first.digests,
          },
        },
      ],
    };
    const fresh = computeEngineeringBaseline(instance, {
      leaf: null,
      readRun: () => null,
      readEvidence: () => null,
      startAgentRun: () => {
        throw new Error("unused");
      },
      digestWorkspacePaths: digester,
    });
    expect(fresh.evidenceFresh).toBe(true);

    writeFileSync(join(root, "src/a.ts"), "consola = 2;\n", "utf8");
    const dirty = computeEngineeringBaseline(instance, {
      leaf: null,
      readRun: () => null,
      readEvidence: () => null,
      startAgentRun: () => {
        throw new Error("unused");
      },
      digestWorkspacePaths: digester,
    });
    expect(dirty.evidenceFresh).toBe(false);
    expect(dirty.failClosedReason).toMatch(/drifted|dirty/i);
  });

  it("rejects approval reuse across action nodes and operations", () => {
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
      artifacts: [],
    };
    const engineering = computeEngineeringBaseline(instance);
    const payload = { title: "feat" };
    const binding = buildApprovalBinding({
      instanceId: "inst_1",
      decisionNodeId: "n_approval",
      actionNodeId: "n_pr",
      actionIntegration: "github",
      actionOperation: "create_pr",
      engineering,
      operationDigest: digestOperationPayload(payload),
    });
    expect(
      isApprovalBindingCurrent({
        binding,
        instance,
        payload,
        actionNodeId: "n_pr",
        actionIntegration: "github",
        actionOperation: "create_pr",
      }),
    ).toBe(true);
    expect(
      isApprovalBindingCurrent({
        binding,
        instance,
        payload,
        actionNodeId: "n_other",
        actionIntegration: "github",
        actionOperation: "create_pr",
      }),
    ).toBe(false);
    expect(
      isApprovalBindingCurrent({
        binding,
        instance,
        payload,
        actionNodeId: "n_pr",
        actionIntegration: "github",
        actionOperation: "create_branch",
      }),
    ).toBe(false);
  });

  it("does not treat 'not approved' as affirmative", () => {
    expect(isApprovalChoice("approve")).toBe(true);
    expect(isApprovalChoice("not approved")).toBe(false);
    expect(isApprovalChoice("不同意")).toBe(false);
    expect(isApprovalChoice("please approve later")).toBe(false);
  });

  it("rejects 'not approved' on Human→Action topology without seeding binding", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-bind-reject-"));
    roots.push(root);
    let { doc } = approvePrDoc(root);
    doc = startLoopInstance(root, doc.id);
    const instanceId = doc.instances[0]!.id;
    const questionId = doc.instances[0]!.hitlQuestionIds![0]!;
    doc = resolveLoopHitl(root, doc.id, instanceId, [
      { questionId, answer: "not approved", actor: "terran" },
    ]);
    expect(doc.instances[0]?.status).toBe("error");
    expect(
      doc.instances[0]?.artifacts?.some((item) => item.kind === "github_op_result"),
    ).toBe(false);
  });

  it("binds default Action payload when approve has no editedPayload", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-bind-default-"));
    roots.push(root);
    let { doc } = approvePrDoc(root);
    doc = startLoopInstance(root, doc.id);
    const instanceId = doc.instances[0]!.id;
    const questionId = doc.instances[0]!.hitlQuestionIds![0]!;
    doc = resolveLoopHitl(root, doc.id, instanceId, [
      { questionId, answer: "approve", actor: "terran" },
    ]);
    const after = doc.instances[0]!;
    expect(after.status).toBe("complete");
    const decision = [...(after.artifacts ?? [])]
      .reverse()
      .find((item) => item.kind === "human_decision");
    expect(decision?.data).toMatchObject({
      choice: "approve",
      binding: {
        nodeId: "n_pr",
        actionIntegration: "github",
        actionOperation: "create_pr",
        actorKind: "local_declared",
      },
    });
    expect(
      after.artifacts?.some((item) => item.kind === "github_op_result"),
    ).toBe(true);
  });

  it("preflight blocks GitHub HTTP when code digests go stale before dispatch", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-bind-toc-"));
    roots.push(root);
    let { doc, spec } = approvePrDoc(root);
    const digester = createWorkspacePathDigester(root);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/a.ts"), "v1\n", "utf8");
    const digested = digester(["src/a.ts"]);
    const contentDigest = combineFileDigests(digested.digests);
    const hooks = {
      leaf: null,
      readRun: () => null,
      readEvidence: () => null,
      startAgentRun: () => {
        throw new Error("unused");
      },
      digestWorkspacePaths: digester,
    };

    let working = pushArtifact(
      {
        id: "inst_toc",
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
          contentDigest,
          fileDigests: digested.digests,
        },
      },
    );
    const engineering = computeEngineeringBaseline(working, hooks);
    const payload = { title: "feat: v1" };
    const binding = {
      decisionArtifactId: "art_decision",
      instanceId: working.id,
      nodeId: "n_pr",
      decisionNodeId: "n_approval",
      actionIntegration: "github",
      actionOperation: "create_pr",
      artifactIds: engineering.artifactIds,
      engineeringBaseline: engineering.baseline,
      codeDigest: engineering.codeDigest,
      operationDigest: digestOperationPayload(payload),
      actorKind: "local_declared" as const,
      approvedAt: "2026-11-10T00:00:00.000Z",
    };
    working = {
      ...working,
      pendingGithubOp: {
        nodeId: "n_pr",
        operation: "create_pr",
        payload,
        queuedAt: "2026-11-10T00:00:00.000Z",
        dispatchState: "queued" as const,
        approvalBinding: binding,
      },
    };
    writeFileSync(join(root, "src/a.ts"), "v2-dirty\n", "utf8");
    doc = upsertLoopGraph(root, { ...doc, instances: [working] });
    expect(preflightPendingGithubDispatch(doc, working.id, hooks).ok).toBe(false);

    const probe = {
      createCalls: 0,
      lookupCalls: 0,
      create: async () => {
        throw new Error("HTTP must not run");
      },
    };
    doc = await settlePendingGithubOpWithProbe(doc, working.id, probe, hooks);
    expect(probe.createCalls).toBe(0);
    expect(doc.instances[0]?.status).toBe("awaiting_hitl");
    expect(doc.instances[0]?.pendingGithubOp).toBeUndefined();
    expect(
      doc.instances[0]?.events.some((event) => event.type === "approval_stale"),
    ).toBe(true);
    expect(
      doc.instances[0]?.artifacts?.some((item) => item.kind === "github_op_result"),
    ).toBe(false);
  });

  it("keeps successful GitHub result when evidence drifts after HTTP (delivery_stale)", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-bind-post-"));
    roots.push(root);
    let { doc, spec } = approvePrDoc(root);
    const digester = createWorkspacePathDigester(root);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/a.ts"), "v1\n", "utf8");
    const digested = digester(["src/a.ts"]);
    const contentDigest = combineFileDigests(digested.digests);
    const hooks = {
      leaf: null,
      readRun: () => null,
      readEvidence: () => null,
      startAgentRun: () => {
        throw new Error("unused");
      },
      digestWorkspacePaths: digester,
    };
    let working = pushArtifact(
      {
        id: "inst_post",
        specVersion: spec.version,
        status: "running",
        cursorNodeId: "n_pr",
        round: 0,
        attemptCounts: {},
        nodeRecords: [
          {
            nodeId: "n_approval",
            status: "succeeded",
            updatedAt: "2026-11-10T00:00:00.000Z",
          },
          {
            nodeId: "n_pr",
            status: "ready",
            updatedAt: "2026-11-10T00:00:00.000Z",
          },
        ],
        events: [
          { id: "evt_1", at: "2026-11-10T00:00:00.000Z", type: "started" },
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
          contentDigest,
          fileDigests: digested.digests,
        },
      },
    );
    const engineering = computeEngineeringBaseline(working, hooks);
    const payload = { title: "feat: v1" };
    working = {
      ...working,
      pendingGithubOp: {
        nodeId: "n_pr",
        operation: "create_pr",
        payload,
        queuedAt: "2026-11-10T00:00:00.000Z",
        dispatchState: "queued",
        approvalBinding: {
          decisionArtifactId: "art_decision",
          instanceId: working.id,
          nodeId: "n_pr",
          decisionNodeId: "n_approval",
          actionIntegration: "github",
          actionOperation: "create_pr",
          artifactIds: engineering.artifactIds,
          engineeringBaseline: engineering.baseline,
          codeDigest: engineering.codeDigest,
          operationDigest: digestOperationPayload(payload),
          actorKind: "local_declared",
          approvedAt: "2026-11-10T00:00:00.000Z",
        },
      },
    };
    doc = upsertLoopGraph(root, { ...doc, instances: [working] });
    const probe = {
      createCalls: 0,
      lookupCalls: 0,
      create: async () => {
        writeFileSync(join(root, "src/a.ts"), "v2-during-http\n", "utf8");
        return {
          ok: true,
          url: "https://example/pr/9",
          number: 9,
          message: "created",
        };
      },
    };
    doc = await settlePendingGithubOpWithProbe(doc, working.id, probe, hooks);
    expect(probe.createCalls).toBe(1);
    expect(doc.instances[0]?.status).toBe("complete");
    const gh = doc.instances[0]?.artifacts?.find(
      (item) => item.kind === "github_op_result",
    );
    expect(gh?.data).toMatchObject({
      ok: true,
      number: 9,
      deliveryStale: true,
    });
    expect(
      doc.instances[0]?.events.some((event) => event.type === "delivery_stale"),
    ).toBe(true);
  });

  it("queries before blind resend when dispatch was in_flight", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-bind-inflight-"));
    roots.push(root);
    let { doc, spec } = approvePrDoc(root);
    const digester = createWorkspacePathDigester(root);
    const hooks = {
      leaf: null,
      readRun: () => null,
      readEvidence: () => null,
      startAgentRun: () => {
        throw new Error("unused");
      },
      digestWorkspacePaths: digester,
    };
    const payload = { title: "feat", head: "feat/x", base: "main" };
    const working = {
      id: "inst_if",
      specVersion: spec.version,
      status: "running" as const,
      cursorNodeId: "n_pr",
      round: 0,
      attemptCounts: {},
      events: [
        { id: "evt_1", at: "2026-11-10T00:00:00.000Z", type: "started" as const },
      ],
      startedAt: "2026-11-10T00:00:00.000Z",
      updatedAt: "2026-11-10T00:00:00.000Z",
      pendingGithubOp: {
        nodeId: "n_pr",
        operation: "create_pr",
        payload,
        queuedAt: "2026-11-10T00:00:00.000Z",
        dispatchState: "in_flight" as const,
        dispatchAttemptId: "gh_1",
        httpAttemptedAt: "2026-11-10T00:00:01.000Z",
      },
    };
    doc = upsertLoopGraph(root, { ...doc, instances: [working] });
    const probe = {
      createCalls: 0,
      lookupCalls: 0,
      create: async () => {
        throw new Error("must not create");
      },
      lookup: async () => ({
        ok: true as const,
        url: "https://example/pr/3",
        number: 3,
        message: "recovered",
      }),
    };
    doc = await settlePendingGithubOpWithProbe(doc, working.id, probe, hooks);
    expect(probe.createCalls).toBe(0);
    expect(probe.lookupCalls).toBe(1);
    expect(
      doc.instances[0]?.artifacts?.some((item) => item.kind === "github_op_result"),
    ).toBe(true);
  });

  it("fails closed on corrupt ChangeSet and rejects symlink escape", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-bind-scope-"));
    roots.push(root);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/a.ts"), "ok\n", "utf8");
    const outside = mkdtempSync(join(tmpdir(), "loop-out-"));
    roots.push(outside);
    writeFileSync(join(outside, "secret.txt"), "secret\n", "utf8");
    // symlink pointing outside workspace
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { symlinkSync } = require("node:fs") as typeof import("node:fs");
    try {
      symlinkSync(join(outside, "secret.txt"), join(root, "src/link.ts"));
    } catch {
      // platforms without symlink support skip
      return;
    }
    const digester = createWorkspacePathDigester(root);
    const escaped = digester(["src/link.ts"]);
    expect(escaped.unreadable).toContain("src/link.ts");

    const corrupt = {
      id: "inst_c",
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
          id: "art_bad",
          nodeId: "n_coder",
          kind: "change_set" as const,
          createdAt: "2026-11-10T00:00:00.000Z",
          data: { not: "a changeset" },
        },
      ],
    };
    const bad = computeEngineeringBaseline(corrupt, {
      leaf: null,
      readRun: () => null,
      readEvidence: () => null,
      startAgentRun: () => {
        throw new Error("unused");
      },
      digestWorkspacePaths: digester,
    });
    expect(bad.evidenceFresh).toBe(false);
    expect(bad.failClosedReason).toMatch(/schema|illegal|fail-closed/i);

    // Tombstone: declared delete that is absent is ok.
    writeFileSync(join(root, "src/a.ts"), "ok\n", "utf8");
    const withDelete = {
      ...corrupt,
      artifacts: [
        {
          id: "art_del",
          nodeId: "n_coder",
          kind: "change_set" as const,
          createdAt: "2026-11-10T00:00:00.000Z",
          data: {
            files: ["src/a.ts"],
            deletedFiles: ["src/gone.ts"],
            summary: "delete gone",
            contentDigest: "pending",
          },
        },
      ],
    };
    const digestDel = digester(["src/a.ts"], { deletedPaths: ["src/gone.ts"] });
    expect(digestDel.tombstones).toContain("src/gone.ts");
    expect(digestDel.missing).not.toContain("src/gone.ts");
    const stamped = combineFileDigests({
      ...digestDel.digests,
      "tombstone:src/gone.ts": "deleted",
    });
    withDelete.artifacts[0]!.data = {
      files: ["src/a.ts"],
      deletedFiles: ["src/gone.ts"],
      summary: "delete gone",
      contentDigest: stamped,
      fileDigests: digestDel.digests,
    };
    const okDel = computeEngineeringBaseline(withDelete, {
      leaf: null,
      readRun: () => null,
      readEvidence: () => null,
      startAgentRun: () => {
        throw new Error("unused");
      },
      digestWorkspacePaths: digester,
    });
    expect(okDel.evidenceFresh).toBe(true);

    // Same-id artifact tamper (passed→failed) changes baseline material.
    const passed = {
      ...withDelete,
      artifacts: [
        ...withDelete.artifacts,
        {
          id: "art_t",
          nodeId: "n_test",
          kind: "test_report" as const,
          createdAt: "2026-11-10T00:00:00.000Z",
          data: {
            status: "passed",
            validatedCodeDigest: stamped,
          },
        },
      ],
    };
    const basePass = computeEngineeringBaseline(passed, {
      leaf: null,
      readRun: () => null,
      readEvidence: () => null,
      startAgentRun: () => {
        throw new Error("unused");
      },
      digestWorkspacePaths: digester,
    });
    const failed = {
      ...passed,
      artifacts: passed.artifacts.map((item) =>
        item.id === "art_t"
          ? {
              ...item,
              data: { status: "failed", validatedCodeDigest: stamped },
            }
          : item,
      ),
    };
    const baseFail = computeEngineeringBaseline(failed, {
      leaf: null,
      readRun: () => null,
      readEvidence: () => null,
      startAgentRun: () => {
        throw new Error("unused");
      },
      digestWorkspacePaths: digester,
    });
    expect(basePass.baseline).not.toBe(baseFail.baseline);
    void denyPendingGithubOpBeforeHttp;
  });

  it("diffs intent graphs for AI edit preview", () => {
    const diff = diffIntentGraphs(
      {
        nodes: [{ id: "a", title: "A" }],
        edges: [{ id: "e1" }],
      },
      {
        nodes: [
          { id: "a", title: "A2" },
          { id: "b", title: "B" },
        ],
        edges: [{ id: "e2" }],
      },
    );
    expect(diff.addedNodeIds).toEqual(["b"]);
    expect(diff.changedNodeIds).toEqual(["a"]);
    expect(diff.removedEdgeIds).toEqual(["e1"]);
    expect(diff.summaryLines.length).toBeGreaterThan(0);
  });

  it("drains no-merge parallel fan-out terminals instead of completing early", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-par-term-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Parallel terminals");
    const waitNode = (
      id: string,
      goal: string,
    ): LoopSpec["nodes"][number] => ({
      id,
      role: "unknown",
      type: "logic",
      logicKind: "wait",
      goal,
      constraints: [],
      inputs: [],
      outputs: [],
      acceptance: [],
    });
    const spec = baseSpec({
      version: "spec_par",
      nodes: [
        waitNode("n_entry", "Fan-out entry"),
        waitNode("n_a", "Branch A"),
        waitNode("n_b", "Branch B"),
      ],
      edges: [
        { id: "e1", from: "n_entry", to: "n_a", kind: "depends" },
        { id: "e2", from: "n_entry", to: "n_b", kind: "depends" },
      ],
      permissions: [],
    });
    doc = approveLoopSpec(root, doc.id, spec);
    doc = startLoopInstance(root, doc.id);
    const instanceId = doc.instances[0]!.id;
    // startLoopInstance already advances past the entry wait into the first child.
    expect(doc.instances[0]?.status).toBe("running");
    const firstChild = doc.instances[0]?.cursorNodeId;
    expect(["n_a", "n_b"]).toContain(firstChild);
    const sibling = firstChild === "n_a" ? "n_b" : "n_a";
    // Completing a no-child terminal must still schedule the parallel sibling.
    doc = stepLoopInstance(doc, instanceId);
    expect(doc.instances[0]?.status).toBe("running");
    expect(doc.instances[0]?.cursorNodeId).toBe(sibling);
    doc = stepLoopInstance(doc, instanceId);
    expect(doc.instances[0]?.status).toBe("complete");
  });

  it("drains nested parallel ready peers after an inner terminal", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-par-nest-"));
    roots.push(root);
    let doc = createLoopGraph(root, "proj", "Nested parallel");
    const waitNode = (
      id: string,
      goal: string,
    ): LoopSpec["nodes"][number] => ({
      id,
      role: "unknown",
      type: "logic",
      logicKind: "wait",
      goal,
      constraints: [],
      inputs: [],
      outputs: [],
      acceptance: [],
    });
    const spec = baseSpec({
      version: "spec_nest",
      nodes: [
        waitNode("n_root", "Root"),
        waitNode("n_left", "Left"),
        waitNode("n_right", "Right"),
        waitNode("n_left_a", "Left A"),
        waitNode("n_left_b", "Left B"),
      ],
      edges: [
        { id: "e1", from: "n_root", to: "n_left", kind: "depends" },
        { id: "e2", from: "n_root", to: "n_right", kind: "depends" },
        { id: "e3", from: "n_left", to: "n_left_a", kind: "depends" },
        { id: "e4", from: "n_left", to: "n_left_b", kind: "depends" },
      ],
      permissions: [],
    });
    doc = approveLoopSpec(root, doc.id, spec);
    doc = startLoopInstance(root, doc.id);
    const instanceId = doc.instances[0]!.id;
    const seen: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const before = doc.instances[0]!;
      if (before.status === "complete") break;
      const cursor = before.cursorNodeId;
      if (cursor) seen.push(cursor);
      doc = stepLoopInstance(doc, instanceId);
    }
    // start already consumed n_root; remaining fan-out peers must all run.
    expect([...new Set(seen)].sort()).toEqual(
      ["n_left", "n_left_a", "n_left_b", "n_right"].sort(),
    );
    expect(doc.instances[0]?.status).toBe("complete");
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
});
