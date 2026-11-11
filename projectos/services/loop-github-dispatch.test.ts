import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { ListedPullRequest } from "./git-context-service.js";
import {
  approveLoopSpec,
  createLoopGraph,
  getLoopGraph,
  upsertLoopGraph,
} from "./loop-graph-service.js";
import {
  combineFileDigests,
  computeEngineeringBaseline,
  createWorkspacePathDigester,
  digestOperationPayload,
} from "./loop-approval-binding.js";
import { pushArtifact } from "./loop-runtime-architecture.js";
import {
  matchListedPullRequestForPending,
  settleGithubDispatch,
  type GithubDispatchCounters,
} from "./loop-github-dispatch.js";
import type { LoopSpec } from "../contracts/loop-graph.js";

function baseSpec(
  overrides: Partial<LoopSpec> & {
    nodes: LoopSpec["nodes"];
    edges: LoopSpec["edges"];
  },
): LoopSpec {
  return {
    version: "spec_dispatch_1",
    graphRevision: 1,
    goal: "Dispatch",
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

describe("matchListedPullRequestForPending (ListedPullRequest contract)", () => {
  const pending = {
    nodeId: "n_pr",
    operation: "create_pr",
    payload: { title: "feat", head: "feat/x", base: "main" },
    queuedAt: "2026-11-10T00:00:00.000Z",
  };

  it("rejects unrelated first PR in same repo", () => {
    const listed: ListedPullRequest[] = [
      {
        number: 1,
        title: "other",
        url: "https://example/pr/1",
        headRef: "feat/other",
        baseRef: "main",
        state: "open",
      },
    ];
    const result = matchListedPullRequestForPending(pending, {
      available: true,
      pullRequests: listed,
    });
    expect(result.kind).toBe("unknown");
  });

  it("rejects same branch name across fork (owner mismatch / missing owner)", () => {
    const listed: ListedPullRequest[] = [
      {
        number: 2,
        title: "fork",
        url: "https://example/pr/2",
        headRef: "feat/x",
        baseRef: "main",
        state: "open",
        headOwner: "otheruser",
      },
    ];
    // pending head is bare feat/x (no owner) vs listed fork owner → unknown
    expect(
      matchListedPullRequestForPending(pending, {
        available: true,
        pullRequests: listed,
      }).kind,
    ).toBe("unknown");
    // owner:ref vs different fork owner also unknown
    expect(
      matchListedPullRequestForPending(
        {
          ...pending,
          payload: { ...pending.payload, head: "alice:feat/x" },
        },
        {
          available: true,
          pullRequests: listed,
        },
      ).kind,
    ).toBe("unknown");
    // exact owner+ref match accepted
    const sameOwner: ListedPullRequest[] = [
      {
        number: 2,
        title: "mine",
        url: "https://example/pr/2",
        headRef: "feat/x",
        baseRef: "main",
        state: "open",
        headOwner: "alice",
      },
    ];
    expect(
      matchListedPullRequestForPending(
        {
          ...pending,
          payload: { ...pending.payload, head: "alice:feat/x" },
        },
        { available: true, pullRequests: sameOwner },
      ),
    ).toEqual({ kind: "exact", pr: sameOwner[0] });
  });

  it("rejects list items with unknown/missing headRef or baseRef", () => {
    const listed: ListedPullRequest[] = [
      {
        number: 3,
        title: "bad",
        url: "https://example/pr/3",
        headRef: "unknown",
        baseRef: "main",
        state: "open",
      },
    ];
    expect(
      matchListedPullRequestForPending(pending, {
        available: true,
        pullRequests: listed,
      }).kind,
    ).toBe("unknown");
  });

  it("rejects when payload lacks head/base", () => {
    const result = matchListedPullRequestForPending(
      { ...pending, payload: { title: "feat" } },
      {
        available: true,
        pullRequests: [
          {
            number: 4,
            title: "x",
            url: "https://example/pr/4",
            headRef: "feat/x",
            baseRef: "main",
            state: "open",
          },
        ],
      },
    );
    expect(result.kind).toBe("unknown");
  });

  it("rejects closed/merged even when head/base match", () => {
    const listed: ListedPullRequest[] = [
      {
        number: 5,
        title: "done",
        url: "https://example/pr/5",
        headRef: "feat/x",
        baseRef: "main",
        state: "merged",
      },
    ];
    expect(
      matchListedPullRequestForPending(pending, {
        available: true,
        pullRequests: listed,
      }).kind,
    ).toBe("unknown");
  });

  it("rejects empty, unavailable, incomplete, or multi-match lists", () => {
    expect(
      matchListedPullRequestForPending(pending, {
        available: false,
        pullRequests: [],
      }).kind,
    ).toBe("unknown");
    expect(
      matchListedPullRequestForPending(pending, {
        available: true,
        pullRequests: [],
      }).kind,
    ).toBe("unknown");
    expect(
      matchListedPullRequestForPending(pending, {
        available: true,
        incomplete: true,
        pullRequests: [
          {
            number: 6,
            title: "x",
            url: "https://example/pr/6",
            headRef: "feat/x",
            baseRef: "main",
            state: "open",
          },
        ],
      }).kind,
    ).toBe("unknown");
    expect(
      matchListedPullRequestForPending(pending, {
        available: true,
        pullRequests: [
          {
            number: 7,
            title: "a",
            url: "https://example/pr/7",
            headRef: "feat/x",
            baseRef: "main",
            state: "open",
          },
          {
            number: 8,
            title: "b",
            url: "https://example/pr/8",
            headRef: "feat/x",
            baseRef: "main",
            state: "open",
          },
        ],
      }).kind,
    ).toBe("unknown");
  });
});

describe("settleGithubDispatch production scheduler", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function seedPending(root: string, opts?: { dirtyAfter?: boolean }) {
    let doc = createLoopGraph(root, "proj", "Dispatch");
    const spec = baseSpec({
      nodes: [
        {
          id: "n_approval",
          role: "decide",
          type: "human",
          humanMode: "approval",
          goal: "Approve",
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
          goal: "PR",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [{ id: "e1", from: "n_approval", to: "n_pr", kind: "depends" }],
    });
    doc = approveLoopSpec(root, doc.id, spec);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/a.ts"), "v1\n", "utf8");
    const digester = createWorkspacePathDigester(root);
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
        id: "inst_d",
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
    const payload = { title: "feat: v1", head: "feat/x", base: "main" };
    const idempotencyKey = [
      working.id,
      "n_pr",
      "create_pr",
      digestOperationPayload(payload),
    ].join(":");
    working = {
      ...working,
      pendingGithubOp: {
        nodeId: "n_pr",
        operation: "create_pr",
        payload,
        queuedAt: "2026-11-10T00:00:00.000Z",
        dispatchState: "queued",
        idempotencyKey,
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
    if (opts?.dirtyAfter) {
      writeFileSync(join(root, "src/a.ts"), "dirty\n", "utf8");
    }
    doc = upsertLoopGraph(root, { ...doc, instances: [working] });
    return { doc, hooks, digester, payload, idempotencyKey, loopId: doc.id };
  }

  it("preflight fail → 0 create (persisted LocalApi-style load/save)", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-disp-pre-"));
    roots.push(root);
    const { hooks, loopId } = seedPending(root, { dirtyAfter: true });
    const counters: GithubDispatchCounters = { prepareCalls: 0, transportCalls: 0, lookupCalls: 0, sideEffectCalls: 0 };
    const doc = getLoopGraph(root, loopId)!;
    await settleGithubDispatch({
      instanceId: doc.instances[0]!.id,
      loadDocument: () => getLoopGraph(root, loopId),
      saveDocument: (next) => upsertLoopGraph(root, next),
      hooksFor: () => hooks,
      counters,
      listPullRequests: async () => ({ available: true, pullRequests: [] }),
      prepareOperation: async () => ({}),
      transportOperation: async () => {
        throw new Error("must not create");
      },
    });
    expect(counters.transportCalls).toBe(0);
    const after = getLoopGraph(root, loopId)!;
    expect(after.instances[0]?.pendingGithubOp).toBeUndefined();
    expect(after.instances[0]?.status).toBe("awaiting_hitl");
  });

  it("HTTP mid-flight code change → 1 create + delivery_stale retain", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-disp-mid-"));
    roots.push(root);
    const { hooks, digester, loopId } = seedPending(root);
    const doc = getLoopGraph(root, loopId)!;
    const counters: GithubDispatchCounters = { prepareCalls: 0, transportCalls: 0, lookupCalls: 0, sideEffectCalls: 0 };
    await settleGithubDispatch({
      instanceId: doc.instances[0]!.id,
      loadDocument: () => getLoopGraph(root, loopId),
      saveDocument: (next) => upsertLoopGraph(root, next),
      hooksFor: () => ({ ...hooks, digestWorkspacePaths: digester }),
      counters,
      listPullRequests: async () => ({ available: true, pullRequests: [] }),
      prepareOperation: async () => ({}),
      transportOperation: async () => {
        writeFileSync(join(root, "src/a.ts"), "mid\n", "utf8");
        return {
          ok: true,
          url: "https://example/pr/11",
          number: 11,
          message: "created",
        };
      },
    });
    expect(counters.transportCalls).toBe(1);
    const after = getLoopGraph(root, loopId)!;
    const gh = after.instances[0]?.artifacts?.find(
      (item) => item.kind === "github_op_result",
    );
    expect(gh?.data).toMatchObject({
      ok: true,
      number: 11,
      deliveryStale: true,
      idempotencyKey: expect.any(String),
    });
  });

  it("unknown in_flight → lookup 1 / create 0 and keeps pending journal", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-disp-unk-"));
    roots.push(root);
    const { hooks, loopId } = seedPending(root);
    let doc = getLoopGraph(root, loopId)!;
    const inst = doc.instances[0]!;
    doc = upsertLoopGraph(root, {
      ...doc,
      instances: [
        {
          ...inst,
          pendingGithubOp: {
            ...inst.pendingGithubOp!,
            dispatchState: "in_flight",
            dispatchAttemptId: "gh_1",
            httpAttemptedAt: "2026-11-10T00:00:01.000Z",
          },
        },
      ],
    });
    const counters: GithubDispatchCounters = { prepareCalls: 0, transportCalls: 0, lookupCalls: 0, sideEffectCalls: 0 };
    await settleGithubDispatch({
      instanceId: inst.id,
      loadDocument: () => getLoopGraph(root, loopId),
      saveDocument: (next) => upsertLoopGraph(root, next),
      hooksFor: () => hooks,
      counters,
      listPullRequests: async () => ({
        available: true,
        pullRequests: [
          {
            number: 99,
            title: "unrelated",
            url: "https://example/pr/99",
            headRef: "feat/other",
            baseRef: "main",
            state: "open",
          },
        ],
      }),
      prepareOperation: async () => ({}),
      transportOperation: async () => {
        throw new Error("must not create");
      },
    });
    expect(counters.transportCalls).toBe(0);
    expect(counters.lookupCalls).toBe(1);
    const after = getLoopGraph(root, loopId)!;
    expect(after.instances[0]?.pendingGithubOp?.dispatchState).toBe("http_started");
    expect(
      after.instances[0]?.pendingGithubOp?.dispatchJournal?.some(
        (item) => item.kind === "unknown",
      ),
    ).toBe(true);
  });

  it("concurrent double settle → exactly 1 create", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-disp-conc-"));
    roots.push(root);
    const { hooks, loopId } = seedPending(root);
    const doc = getLoopGraph(root, loopId)!;
    const counters: GithubDispatchCounters = { prepareCalls: 0, transportCalls: 0, lookupCalls: 0, sideEffectCalls: 0 };
    const deps = {
      instanceId: doc.instances[0]!.id,
      loadDocument: () => getLoopGraph(root, loopId),
      saveDocument: (next: typeof doc) => upsertLoopGraph(root, next),
      hooksFor: () => hooks,
      counters,
      listPullRequests: async () => ({ available: true, pullRequests: [] }),
      prepareOperation: async () => ({}),
      transportOperation: async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return {
          ok: true,
          url: "https://example/pr/12",
          number: 12,
          message: "created",
        };
      },
    };
    await Promise.all([
      settleGithubDispatch(deps),
      settleGithubDispatch(deps),
    ]);
    expect(counters.transportCalls).toBe(1);
  });

  it("cancel before dispatch → 0 create", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-disp-cancel-"));
    roots.push(root);
    const { hooks, loopId } = seedPending(root);
    let doc = getLoopGraph(root, loopId)!;
    doc = upsertLoopGraph(root, {
      ...doc,
      instances: doc.instances.map((item) => ({
        ...item,
        status: "cancelled" as const,
      })),
    });
    const counters: GithubDispatchCounters = { prepareCalls: 0, transportCalls: 0, lookupCalls: 0, sideEffectCalls: 0 };
    await settleGithubDispatch({
      instanceId: doc.instances[0]!.id,
      loadDocument: () => getLoopGraph(root, loopId),
      saveDocument: (next) => upsertLoopGraph(root, next),
      hooksFor: () => hooks,
      counters,
      listPullRequests: async () => ({ available: true, pullRequests: [] }),
      prepareOperation: async () => ({}),
      transportOperation: async () => {
        throw new Error("must not create");
      },
    });
    expect(counters.transportCalls).toBe(0);
  });

  it("does not reuse priorResult for same node with different idempotencyKey", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-disp-prior-"));
    roots.push(root);
    const { hooks, payload, loopId } = seedPending(root);
    let doc = getLoopGraph(root, loopId)!;
    const inst = doc.instances[0]!;
    doc = upsertLoopGraph(root, {
      ...doc,
      instances: [
        {
          ...inst,
          artifacts: [
            ...(inst.artifacts ?? []),
            {
              id: "art_old",
              nodeId: "n_pr",
              kind: "github_op_result",
              createdAt: "2026-11-10T00:00:00.000Z",
              data: {
                operation: "create_pr",
                ok: true,
                number: 1,
                url: "https://example/pr/1",
                idempotencyKey: "other-key",
                operationDigest: digestOperationPayload({
                  ...payload,
                  title: "other",
                }),
              },
            },
          ],
        },
      ],
    });
    const counters: GithubDispatchCounters = { prepareCalls: 0, transportCalls: 0, lookupCalls: 0, sideEffectCalls: 0 };
    await settleGithubDispatch({
      instanceId: inst.id,
      loadDocument: () => getLoopGraph(root, loopId),
      saveDocument: (next) => upsertLoopGraph(root, next),
      hooksFor: () => hooks,
      counters,
      listPullRequests: async () => ({ available: true, pullRequests: [] }),
      prepareOperation: async () => ({}),
      transportOperation: async () => ({
        ok: true,
        url: "https://example/pr/22",
        number: 22,
        message: "new",
      }),
    });
    expect(counters.transportCalls).toBe(1);
    const after = getLoopGraph(root, loopId)!;
    const numbers = (after.instances[0]?.artifacts ?? [])
      .filter((item) => item.kind === "github_op_result")
      .map((item) => (item.data as { number?: number }).number);
    expect(numbers).toContain(22);
  });

  it("does not reuse priorResult that only has nodeId+ok (missing identity)", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-disp-prior-weak-"));
    roots.push(root);
    const { hooks, loopId } = seedPending(root);
    let doc = getLoopGraph(root, loopId)!;
    const inst = doc.instances[0]!;
    doc = upsertLoopGraph(root, {
      ...doc,
      instances: [
        {
          ...inst,
          artifacts: [
            ...(inst.artifacts ?? []),
            {
              id: "art_weak",
              nodeId: "n_pr",
              kind: "github_op_result",
              createdAt: "2026-11-10T00:00:00.000Z",
              data: {
                operation: "create_pr",
                ok: true,
                number: 7,
                url: "https://example/pr/7",
              },
            },
          ],
        },
      ],
    });
    const counters: GithubDispatchCounters = { prepareCalls: 0, transportCalls: 0, lookupCalls: 0, sideEffectCalls: 0 };
    await settleGithubDispatch({
      instanceId: inst.id,
      loadDocument: () => getLoopGraph(root, loopId),
      saveDocument: (next) => upsertLoopGraph(root, next),
      hooksFor: () => hooks,
      counters,
      listPullRequests: async () => ({ available: true, pullRequests: [] }),
      prepareOperation: async () => ({}),
      transportOperation: async () => ({
        ok: true,
        url: "https://example/pr/23",
        number: 23,
        message: "new",
      }),
    });
    expect(counters.transportCalls).toBe(1);
  });

  it("pause mid-flight does not resurrect run; audits result when HTTP ok", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-disp-pause-"));
    roots.push(root);
    const { hooks, digester, loopId } = seedPending(root);
    const counters: GithubDispatchCounters = { prepareCalls: 0, transportCalls: 0, lookupCalls: 0, sideEffectCalls: 0 };
    await settleGithubDispatch({
      instanceId: getLoopGraph(root, loopId)!.instances[0]!.id,
      loadDocument: () => getLoopGraph(root, loopId),
      saveDocument: (next) => upsertLoopGraph(root, next),
      hooksFor: () => ({ ...hooks, digestWorkspacePaths: digester }),
      counters,
      listPullRequests: async () => ({ available: true, pullRequests: [] }),
      prepareOperation: async () => ({}),
      transportOperation: async () => {
        const latest = getLoopGraph(root, loopId)!;
        upsertLoopGraph(root, {
          ...latest,
          instances: latest.instances.map((item) => ({
            ...item,
            status: "paused" as const,
          })),
        });
        return {
          ok: true,
          url: "https://example/pr/13",
          number: 13,
          message: "created while paused",
        };
      },
    });
    expect(counters.transportCalls).toBe(1);
    const after = getLoopGraph(root, loopId)!;
    expect(after.instances[0]?.status).toBe("paused");
    expect(after.instances[0]?.pendingGithubOp).toBeUndefined();
    const gh = after.instances[0]?.artifacts?.find(
      (item) => item.kind === "github_op_result",
    );
    expect(gh?.data).toMatchObject({
      ok: true,
      number: 13,
      deliveryStale: true,
    });
  });

  it("deny-before-HTTP refuses to erase journaled unknown in_flight", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-disp-deny-unk-"));
    roots.push(root);
    const { hooks, loopId } = seedPending(root);
    let doc = getLoopGraph(root, loopId)!;
    const inst = doc.instances[0]!;
    doc = upsertLoopGraph(root, {
      ...doc,
      instances: [
        {
          ...inst,
          pendingGithubOp: {
            ...inst.pendingGithubOp!,
            dispatchState: "in_flight",
            dispatchAttemptId: "gh_1",
            httpAttemptedAt: "2026-11-10T00:00:01.000Z",
            dispatchJournal: [
              {
                at: "2026-11-10T00:00:02.000Z",
                kind: "unknown",
                message: "prior unknown",
              },
            ],
          },
        },
      ],
    });
    const counters: GithubDispatchCounters = { prepareCalls: 0, transportCalls: 0, lookupCalls: 0, sideEffectCalls: 0 };
    // Second settle still looks up, never creates, never clears pending.
    await settleGithubDispatch({
      instanceId: inst.id,
      loadDocument: () => getLoopGraph(root, loopId),
      saveDocument: (next) => upsertLoopGraph(root, next),
      hooksFor: () => hooks,
      counters,
      listPullRequests: async () => ({ available: true, pullRequests: [] }),
      prepareOperation: async () => ({}),
      transportOperation: async () => {
        throw new Error("must not create");
      },
    });
    expect(counters.transportCalls).toBe(0);
    expect(counters.lookupCalls).toBe(1);
    const after = getLoopGraph(root, loopId)!;
    expect(after.instances[0]?.pendingGithubOp?.dispatchState).toBe("http_started");
    expect(
      (after.instances[0]?.pendingGithubOp?.dispatchJournal ?? []).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("final gate blocks transport when code goes stale during prepare (no in_flight exemption)", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-disp-prep-stale-"));
    roots.push(root);
    const { hooks, digester, loopId } = seedPending(root);
    const counters: GithubDispatchCounters = {
      prepareCalls: 0,
      transportCalls: 0,
      lookupCalls: 0,
      sideEffectCalls: 0,
    };
    await settleGithubDispatch({
      instanceId: getLoopGraph(root, loopId)!.instances[0]!.id,
      loadDocument: () => getLoopGraph(root, loopId),
      saveDocument: (next) => upsertLoopGraph(root, next),
      hooksFor: () => ({ ...hooks, digestWorkspacePaths: digester }),
      counters,
      listPullRequests: async () => ({ available: true, pullRequests: [] }),
      prepareOperation: async () => {
        // Mutate workspace during prepare — must fail final gate, 0 transport.
        writeFileSync(join(root, "src/a.ts"), "stale-during-prepare\n", "utf8");
        return {};
      },
      transportOperation: async () => {
        throw new Error("must not transport");
      },
    });
    expect(counters.prepareCalls).toBe(1);
    expect(counters.transportCalls).toBe(0);
    expect(counters.sideEffectCalls).toBe(0);
    const after = getLoopGraph(root, loopId)!;
    // preparing is clearable — pending gone, re-approve required
    expect(after.instances[0]?.pendingGithubOp).toBeUndefined();
  });

  it("lookup mid-cancel does not apply recovery onto cleared/replaced pending", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-disp-lookup-cancel-"));
    roots.push(root);
    const { hooks, loopId } = seedPending(root);
    let doc = getLoopGraph(root, loopId)!;
    const inst = doc.instances[0]!;
    const originalKey = inst.pendingGithubOp!.idempotencyKey!;
    doc = upsertLoopGraph(root, {
      ...doc,
      instances: [
        {
          ...inst,
          pendingGithubOp: {
            ...inst.pendingGithubOp!,
            dispatchState: "http_started",
            dispatchAttemptId: "gh_1",
            httpAttemptedAt: "2026-11-10T00:00:01.000Z",
          },
        },
      ],
    });
    const counters: GithubDispatchCounters = {
      prepareCalls: 0,
      transportCalls: 0,
      lookupCalls: 0,
      sideEffectCalls: 0,
    };
    await settleGithubDispatch({
      instanceId: inst.id,
      loadDocument: () => getLoopGraph(root, loopId),
      saveDocument: (next) => upsertLoopGraph(root, next),
      hooksFor: () => hooks,
      counters,
      listPullRequests: async () => {
        // During lookup await: replace with a different pending identity.
        const latest = getLoopGraph(root, loopId)!;
        const cur = latest.instances[0]!;
        upsertLoopGraph(root, {
          ...latest,
          instances: [
            {
              ...cur,
              pendingGithubOp: {
                ...cur.pendingGithubOp!,
                idempotencyKey: "brand-new-pending-key",
                payload: { title: "other", head: "feat/y", base: "main" },
                dispatchState: "queued",
                dispatchAttemptId: undefined,
                httpAttemptedAt: undefined,
              },
            },
          ],
        });
        return {
          available: true,
          pullRequests: [
            {
              number: 3,
              title: "feat",
              url: "https://example/pr/3",
              headRef: "feat/x",
              baseRef: "main",
              state: "open" as const,
            },
          ],
        };
      },
      prepareOperation: async () => ({}),
      transportOperation: async () => {
        throw new Error("must not transport");
      },
    });
    expect(counters.transportCalls).toBe(0);
    expect(counters.lookupCalls).toBe(1);
    const after = getLoopGraph(root, loopId)!;
    const pending = after.instances[0]?.pendingGithubOp;
    expect(pending?.idempotencyKey).toBe("brand-new-pending-key");
    expect(pending?.dispatchState).toBe("queued");
    // Must not have completed with PR #3 onto the new pending.
    expect(
      (after.instances[0]?.artifacts ?? []).some(
        (item) =>
          item.kind === "github_op_result" &&
          (item.data as { number?: number }).number === 3,
      ),
    ).toBe(false);
    expect(
      after.instances[0]?.events.some((event) =>
        (event.message ?? "").includes("Orphaned"),
      ),
    ).toBe(true);
    void originalKey;
  });
});
