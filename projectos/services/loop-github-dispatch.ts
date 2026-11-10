/**
 * Single production GitHub settle scheduler (LocalApi + tests share this).
 * Preflight before create HTTP; strict PR lookup; CAS across awaits; journal unknown.
 */
import type { ListedPullRequest } from "./git-context-service.js";
import type { LoopGraphDocument, LoopInstance } from "../contracts/loop-graph.js";
import type { LoopExecutionHooks, LoopGithubOperationResult } from "./loop-execution.js";
import { digestOperationPayload } from "./loop-approval-binding.js";
import {
  completePendingGithubOp,
  denyPendingGithubOpBeforeHttp,
  markPendingGithubOpInFlight,
  preflightPendingGithubDispatch,
} from "./loop-runtime-service.js";

export type GithubDispatchCounters = {
  createCalls: number;
  lookupCalls: number;
};

export type SettleGithubDispatchDeps = {
  instanceId: string;
  /** Always load latest persisted document (CAS). */
  loadDocument: () => LoopGraphDocument | null;
  saveDocument: (doc: LoopGraphDocument) => LoopGraphDocument;
  hooksFor: (doc: LoopGraphDocument) => LoopExecutionHooks;
  createOperation: (pending: NonNullable<LoopInstance["pendingGithubOp"]>) =>
    | Promise<LoopGithubOperationResult>
    | LoopGithubOperationResult;
  listPullRequests: () =>
    | Promise<{
        available: boolean;
        pullRequests: ListedPullRequest[];
        /** True when caller knows the page may be truncated. */
        incomplete?: boolean;
        message?: string;
      }>
    | {
        available: boolean;
        pullRequests: ListedPullRequest[];
        incomplete?: boolean;
        message?: string;
      };
  counters?: GithubDispatchCounters;
};

const instanceLocks = new Map<string, Promise<unknown>>();

async function withInstanceLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = instanceLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => gate);
  instanceLocks.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (instanceLocks.get(key) === tail) instanceLocks.delete(key);
  }
}

function appendJournal(
  pending: NonNullable<LoopInstance["pendingGithubOp"]>,
  kind: NonNullable<
    NonNullable<LoopInstance["pendingGithubOp"]>["dispatchJournal"]
  >[number]["kind"],
  message: string,
): NonNullable<LoopInstance["pendingGithubOp"]> {
  const entry = {
    at: new Date().toISOString(),
    kind,
    message: message.slice(0, 500),
  };
  return {
    ...pending,
    dispatchJournal: [...(pending.dispatchJournal ?? []), entry].slice(-20),
  };
}

function replaceInstance(
  doc: LoopGraphDocument,
  instance: LoopInstance,
): LoopGraphDocument {
  return {
    ...doc,
    instances: doc.instances.map((item) =>
      item.id === instance.id ? instance : item,
    ),
    updatedAt: new Date().toISOString(),
  };
}

/** Keep in_flight + journal; do NOT clear pending (blocks create#2 via re-approve). */
export function blockUnknownInFlightGithubDispatch(
  doc: LoopGraphDocument,
  instanceId: string,
  reason: string,
): LoopGraphDocument {
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance?.pendingGithubOp) return doc;
  const pending = appendJournal(
    {
      ...instance.pendingGithubOp,
      dispatchState: "in_flight",
    },
    "unknown",
    reason,
  );
  const next: LoopInstance = {
    ...instance,
    pendingGithubOp: pending,
    status: "awaiting_hitl",
    hitlQuestionIds: [`github_dispatch_unknown_${pending.nodeId}`],
    cursorNodeId: pending.nodeId,
    updatedAt: new Date().toISOString(),
  };
  const withEvent = {
    ...next,
    events: [
      ...next.events,
      {
        id: `evt_${Date.now()}`,
        at: new Date().toISOString(),
        type: "awaiting_hitl" as const,
        nodeId: pending.nodeId,
        message: `GitHub dispatch unknown (no create): ${reason.slice(0, 400)}`,
      },
    ].slice(-200),
  };
  return replaceInstance(doc, withEvent);
}

/** Parse `owner:ref` or bare `ref` — owner missing means identity incomplete for forks. */
export function parseGithubHeadIdentity(head: string): {
  owner?: string;
  ref: string;
} {
  const trimmed = head.trim();
  const idx = trimmed.lastIndexOf(":");
  if (idx > 0) {
    const owner = trimmed.slice(0, idx).trim();
    const ref = trimmed.slice(idx + 1).trim();
    if (owner && ref) return { owner, ref };
  }
  return { ref: trimmed };
}

/**
 * Strict match against ListedPullRequest contract fields (headRef/baseRef/state,
 * optional headOwner/headSha when the list DTO provides them).
 * Missing payload identity, unknown refs, cross-fork same branch name, multi-match,
 * closed/merged, incomplete list → unknown (safe block, never treat as success).
 */
export function matchListedPullRequestForPending(
  pending: NonNullable<LoopInstance["pendingGithubOp"]>,
  listed: {
    available: boolean;
    pullRequests: ListedPullRequest[];
    incomplete?: boolean;
  },
):
  | { kind: "exact"; pr: ListedPullRequest }
  | { kind: "unknown"; reason: string } {
  if (pending.operation !== "create_pr") {
    return { kind: "unknown", reason: "Lookup only supported for create_pr" };
  }
  if (!listed.available) {
    return { kind: "unknown", reason: "PR list unavailable" };
  }
  if (listed.incomplete) {
    return { kind: "unknown", reason: "PR list pagination incomplete" };
  }
  const headRaw =
    typeof pending.payload.head === "string" ? pending.payload.head.trim() : "";
  const baseRaw =
    typeof pending.payload.base === "string" ? pending.payload.base.trim() : "";
  if (!headRaw || !baseRaw) {
    return {
      kind: "unknown",
      reason: "Pending payload missing required head/base for identity match",
    };
  }
  const want = parseGithubHeadIdentity(headRaw);
  if (!want.ref) {
    return { kind: "unknown", reason: "Pending head ref empty after parse" };
  }
  const wantSha =
    typeof pending.payload.headSha === "string"
      ? pending.payload.headSha.trim().toLowerCase()
      : typeof pending.payload.sha === "string"
        ? pending.payload.sha.trim().toLowerCase()
        : "";
  const wantBase = baseRaw;
  const matches: ListedPullRequest[] = [];
  for (const pr of listed.pullRequests) {
    if (
      !pr.headRef ||
      !pr.baseRef ||
      pr.headRef === "unknown" ||
      pr.baseRef === "unknown"
    ) {
      continue;
    }
    if (pr.state !== "open") continue;
    if (pr.baseRef !== wantBase) continue;
    const listedHead = parseGithubHeadIdentity(pr.headRef);
    const listedOwner = (pr.headOwner?.trim() || listedHead.owner || "").toLowerCase();
    const wantOwner = (want.owner || "").toLowerCase();
    if (listedHead.ref !== want.ref) continue;
    // Cross-fork / owner mismatch: same branch name is not identity.
    if (wantOwner || listedOwner) {
      if (!wantOwner || !listedOwner || wantOwner !== listedOwner) continue;
    }
    if (wantSha) {
      const listedSha = pr.headSha?.trim().toLowerCase() ?? "";
      if (!listedSha || listedSha !== wantSha) continue;
    }
    matches.push(pr);
  }
  if (matches.length === 0) {
    return { kind: "unknown", reason: "No open PR matches head/base identity" };
  }
  if (matches.length > 1) {
    return {
      kind: "unknown",
      reason: `Multiple open PRs match head/base (${matches.length})`,
    };
  }
  return { kind: "exact", pr: matches[0]! };
}

/**
 * Reuse prior github_op_result only when dispatch identity matches
 * (idempotencyKey + operationDigest + engineering baseline when bound).
 * nodeId alone is never an idempotency key.
 */
export function findPriorGithubOpResult(
  instance: LoopInstance,
  pending: NonNullable<LoopInstance["pendingGithubOp"]>,
): {
  ok: true;
  url?: string;
  number?: number;
  message?: string;
  refs?: Record<string, string>;
} | null {
  if (!pending.idempotencyKey) return null;
  const wantOpDigest =
    pending.approvalBinding?.operationDigest ??
    digestOperationPayload(pending.payload);
  const wantBaseline = pending.approvalBinding?.engineeringBaseline;
  for (let i = (instance.artifacts ?? []).length - 1; i >= 0; i -= 1) {
    const item = instance.artifacts![i]!;
    if (item.kind !== "github_op_result") continue;
    if (item.nodeId !== pending.nodeId) continue;
    if (!item.data || typeof item.data !== "object") continue;
    const data = item.data as {
      ok?: boolean;
      idempotencyKey?: string;
      operationDigest?: string;
      engineeringBaseline?: string;
      url?: string;
      number?: number;
      message?: string;
      refs?: Record<string, string>;
    };
    if (data.ok !== true) continue;
    // Missing identity fields → cannot prove same dispatch (fail closed).
    if (
      typeof data.idempotencyKey !== "string" ||
      !data.idempotencyKey ||
      data.idempotencyKey !== pending.idempotencyKey
    ) {
      continue;
    }
    if (
      typeof data.operationDigest !== "string" ||
      !data.operationDigest ||
      data.operationDigest !== wantOpDigest
    ) {
      continue;
    }
    if (wantBaseline) {
      if (
        typeof data.engineeringBaseline !== "string" ||
        !data.engineeringBaseline ||
        data.engineeringBaseline !== wantBaseline
      ) {
        continue;
      }
    }
    return {
      ok: true,
      ...(data.url ? { url: data.url } : {}),
      ...(typeof data.number === "number" ? { number: data.number } : {}),
      ...(data.message ? { message: data.message } : {}),
      ...(data.refs ? { refs: data.refs } : {}),
    };
  }
  return null;
}

/**
 * Production settle entry — used by ProjectOsLocalApi and unit/integration tests.
 */
export async function settleGithubDispatch(
  deps: SettleGithubDispatchDeps,
): Promise<LoopGraphDocument> {
  const lockKey = `${deps.instanceId}`;
  return withInstanceLock(lockKey, async () => {
    const counters = deps.counters ?? { createCalls: 0, lookupCalls: 0 };

    let doc = deps.loadDocument();
    if (!doc) throw new Error("Loop document missing during GitHub settle");
    let instance = doc.instances.find((item) => item.id === deps.instanceId);
    if (!instance?.pendingGithubOp) return doc;
    let pending = instance.pendingGithubOp;

    const hooks = deps.hooksFor(doc);
    const prior = findPriorGithubOpResult(instance, pending);
    if (prior) {
      // Same dispatch identity — audit-append even under cancel/pause; do not resurrect.
      return deps.saveDocument(
        completePendingGithubOp(
          doc,
          deps.instanceId,
          {
            ok: true,
            message: prior.message ?? "Reusing prior result for same dispatch identity",
            ...(prior.url ? { url: prior.url } : {}),
            ...(typeof prior.number === "number" ? { number: prior.number } : {}),
            ...(prior.refs ? { refs: prior.refs } : {}),
          },
          hooks,
          {
            httpCompleted: true,
            deliveryStale:
              instance.status === "cancelled" || instance.status === "paused",
          },
        ),
      );
    }

    if (pending.dispatchState === "in_flight") {
      counters.lookupCalls += 1;
      const listed = await deps.listPullRequests();
      const matched = matchListedPullRequestForPending(pending, listed);
      if (matched.kind === "exact") {
        return deps.saveDocument(
          completePendingGithubOp(
            doc,
            deps.instanceId,
            {
              ok: true,
              message: "Recovered existing PR (strict identity lookup)",
              url: matched.pr.url,
              number: matched.pr.number,
              refs: Object.fromEntries(
                Object.entries(pending.payload).map(([key, value]) => [
                  key,
                  String(value),
                ]),
              ),
            },
            hooks,
            {
              httpCompleted: true,
              deliveryStale:
                instance.status === "cancelled" || instance.status === "paused",
            },
          ),
        );
      }
      // Cancel/pause/unknown: keep journaled in_flight (never deny-clear → create#2).
      return deps.saveDocument(
        blockUnknownInFlightGithubDispatch(
          doc,
          deps.instanceId,
          instance.status === "cancelled" || instance.status === "paused"
            ? `Instance ${instance.status} with unresolved in_flight: ${matched.reason}`
            : matched.reason,
        ),
      );
    }

    if (
      instance.status === "cancelled" ||
      instance.status === "paused" ||
      instance.status === "error" ||
      instance.status === "complete"
    ) {
      return deps.saveDocument(
        denyPendingGithubOpBeforeHttp(
          doc,
          deps.instanceId,
          `Instance status ${instance.status} forbids GitHub dispatch`,
        ),
      );
    }

    const preflight = preflightPendingGithubDispatch(doc, deps.instanceId, hooks);
    if (!preflight.ok) {
      return deps.saveDocument(
        denyPendingGithubOpBeforeHttp(doc, deps.instanceId, preflight.reason),
      );
    }

    const beforeMarkUpdatedAt = instance.updatedAt;
    const attemptId = `gh_dispatch_${Date.now()}`;
    doc = deps.saveDocument(
      markPendingGithubOpInFlight(doc, deps.instanceId, attemptId),
    );

    // Re-check cancel/auth window after awaits that may follow (token/import/create).
    const recheckAfterAwait = (): {
      ok: true;
      doc: LoopGraphDocument;
      instance: LoopInstance;
      pending: NonNullable<LoopInstance["pendingGithubOp"]>;
      hooks: LoopExecutionHooks;
    } | { ok: false; doc: LoopGraphDocument; reason: string } => {
      const latest = deps.loadDocument();
      if (!latest) {
        return { ok: false, doc, reason: "Document disappeared during settle" };
      }
      const latestInstance = latest.instances.find(
        (item) => item.id === deps.instanceId,
      );
      if (!latestInstance?.pendingGithubOp) {
        return {
          ok: false,
          doc: latest,
          reason: "Pending GitHub op cleared concurrently",
        };
      }
      if (
        latestInstance.status === "cancelled" ||
        latestInstance.status === "paused"
      ) {
        return {
          ok: false,
          doc: latest,
          reason: `Instance ${latestInstance.status} during dispatch window`,
        };
      }
      if (
        latestInstance.pendingGithubOp.idempotencyKey &&
        pending.idempotencyKey &&
        latestInstance.pendingGithubOp.idempotencyKey !== pending.idempotencyKey
      ) {
        return {
          ok: false,
          doc: latest,
          reason: "Pending dispatch identity changed concurrently",
        };
      }
      const latestHooks = deps.hooksFor(latest);
      const still = preflightPendingGithubDispatch(
        latest,
        deps.instanceId,
        latestHooks,
      );
      if (!still.ok && latestInstance.pendingGithubOp.dispatchState !== "in_flight") {
        return { ok: false, doc: latest, reason: still.reason };
      }
      return {
        ok: true,
        doc: latest,
        instance: latestInstance,
        pending: latestInstance.pendingGithubOp,
        hooks: latestHooks,
      };
    };

    // Token/import window — caller may await before create; we recheck here too.
    let gate = recheckAfterAwait();
    if (!gate.ok) {
      if (gate.reason.includes("cancelled") || gate.reason.includes("paused")) {
        // Keep journal; do not clear in_flight if HTTP never started after cancel.
        const inst = gate.doc.instances.find((item) => item.id === deps.instanceId);
        if (inst?.pendingGithubOp?.dispatchState === "in_flight") {
          return deps.saveDocument(
            blockUnknownInFlightGithubDispatch(
              gate.doc,
              deps.instanceId,
              `${gate.reason}; HTTP not started`,
            ),
          );
        }
      }
      return deps.saveDocument(
        denyPendingGithubOpBeforeHttp(gate.doc, deps.instanceId, gate.reason),
      );
    }

    counters.createCalls += 1;
    let result: LoopGithubOperationResult;
    try {
      result = await deps.createOperation(gate.pending);
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitHub create failed";
      const afterErr = deps.loadDocument() ?? gate.doc;
      return deps.saveDocument(
        blockUnknownInFlightGithubDispatch(
          afterErr,
          deps.instanceId,
          `Create threw before confirmed result: ${message}`,
        ),
      );
    }

    gate = recheckAfterAwait();
    const latestDoc = gate.ok ? gate.doc : gate.doc;
    const latestHooks = gate.ok
      ? gate.hooks
      : deps.hooksFor(latestDoc);
    const postflight = preflightPendingGithubDispatch(
      latestDoc,
      deps.instanceId,
      latestHooks,
    );

    // If cancelled mid-flight but HTTP returned ok — audit-append, do not resurrect.
    const latestInstance = latestDoc.instances.find(
      (item) => item.id === deps.instanceId,
    );
    if (
      latestInstance &&
      (latestInstance.status === "cancelled" || latestInstance.status === "paused")
    ) {
      if (result.ok) {
        return deps.saveDocument(
          completePendingGithubOp(latestDoc, deps.instanceId, result, latestHooks, {
            httpCompleted: true,
            deliveryStale: true,
          }),
        );
      }
      return deps.saveDocument(
        blockUnknownInFlightGithubDispatch(
          latestDoc,
          deps.instanceId,
          "Instance cancelled/paused with failed/unknown HTTP outcome",
        ),
      );
    }

    void beforeMarkUpdatedAt;
    return deps.saveDocument(
      completePendingGithubOp(latestDoc, deps.instanceId, result, latestHooks, {
        httpCompleted: true,
        deliveryStale: result.ok && !postflight.ok,
      }),
    );
  });
}

/** Thin in-memory adapter over settleGithubDispatch (production scheduler). */
export async function settlePendingGithubOpWithProbe(
  doc: LoopGraphDocument,
  instanceId: string,
  probe: {
    createCalls: number;
    lookupCalls: number;
    create: (pending: {
      operation: string;
      payload: Record<string, unknown>;
    }) => Promise<LoopGithubOperationResult> | LoopGithubOperationResult;
  },
  execution?: LoopExecutionHooks,
  listPullRequests?: SettleGithubDispatchDeps["listPullRequests"],
): Promise<LoopGraphDocument> {
  let current = doc;
  const counters = probe;
  return settleGithubDispatch({
    instanceId,
    loadDocument: () => current,
    saveDocument: (next) => {
      current = next;
      return next;
    },
    hooksFor: () =>
      execution ?? {
        leaf: null,
        readRun: () => null,
        readEvidence: () => null,
        startAgentRun: () => {
          throw new Error("unused");
        },
      },
    createOperation: (pending) =>
      probe.create({ operation: pending.operation, payload: pending.payload }),
    listPullRequests:
      listPullRequests ??
      (async () => ({ available: false, pullRequests: [] })),
    counters,
  });
}
