/**
 * Single production GitHub settle scheduler (LocalApi + tests share this).
 *
 * Flow: prepare (awaitable, no side effects) → final auth/code gate →
 * atomic http_started claim → transport (create/push). Identity-safe writeback
 * after every await — never apply an old result onto a replaced pending.
 */
import type { ListedPullRequest } from "./git-context-service.js";
import type { LoopGraphDocument, LoopInstance } from "../contracts/loop-graph.js";
import type { LoopExecutionHooks, LoopGithubOperationResult } from "./loop-execution.js";
import { digestOperationPayload } from "./loop-approval-binding.js";
import {
  completePendingGithubOp,
  denyPendingGithubOpBeforeHttp,
  markPendingGithubOpHttpStarted,
  markPendingGithubOpPreparing,
  preflightPendingGithubDispatch,
} from "./loop-runtime-service.js";

export type GithubDispatchCounters = {
  prepareCalls: number;
  transportCalls: number;
  lookupCalls: number;
  /** Push/create side effects inside transport (create_pr pushHead / create_branch push). */
  sideEffectCalls: number;
};

export type GithubDispatchPrepared = {
  accessToken?: string;
};

export type SettleGithubDispatchDeps = {
  instanceId: string;
  /** Always load latest persisted document before mutating. */
  loadDocument: () => LoopGraphDocument | null;
  saveDocument: (doc: LoopGraphDocument) => LoopGraphDocument;
  hooksFor: (doc: LoopGraphDocument) => LoopExecutionHooks;
  /** Awaitable setup only — token resolve / dynamic import. No push/create. */
  prepareOperation: (
    pending: NonNullable<LoopInstance["pendingGithubOp"]>,
  ) => Promise<GithubDispatchPrepared> | GithubDispatchPrepared;
  /**
   * Actual remote side effects (push head, create PR/branch). Invoked only after
   * final gate + persisted http_started claim.
   */
  transportOperation: (
    pending: NonNullable<LoopInstance["pendingGithubOp"]>,
    prepared: GithubDispatchPrepared,
  ) => Promise<LoopGithubOperationResult> | LoopGithubOperationResult;
  listPullRequests: (prepared?: GithubDispatchPrepared) =>
    | Promise<{
        available: boolean;
        pullRequests: ListedPullRequest[];
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

/** True when HTTP/push may already have happened (must not clear / must not create#2). */
export function isHttpStartedDispatchState(
  state: NonNullable<LoopInstance["pendingGithubOp"]>["dispatchState"] | undefined,
): boolean {
  return state === "http_started" || state === "in_flight";
}

export function sameGithubDispatchIdentity(
  expected: {
    idempotencyKey?: string;
    dispatchAttemptId?: string;
  },
  pending: NonNullable<LoopInstance["pendingGithubOp"]> | undefined,
): boolean {
  if (!pending) return false;
  if (expected.idempotencyKey) {
    return pending.idempotencyKey === expected.idempotencyKey;
  }
  if (expected.dispatchAttemptId) {
    return pending.dispatchAttemptId === expected.dispatchAttemptId;
  }
  return false;
}

/** Keep http_started + journal; do NOT clear pending (blocks create#2 via re-approve). */
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
      dispatchState: "http_started",
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

/**
 * When pending was replaced/cleared during an await, journal the orphaned outcome
 * on the instance without mutating the new pending.
 */
export function journalOrphanedGithubDispatchResult(
  doc: LoopGraphDocument,
  instanceId: string,
  message: string,
): LoopGraphDocument {
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance) return doc;
  const at = new Date().toISOString();
  const events = [
    ...instance.events,
    {
      id: `evt_${Date.now()}`,
      at,
      type: "awaiting_hitl" as const,
      message: `Orphaned GitHub dispatch result (not applied to current pending): ${message.slice(0, 400)}`,
    },
  ].slice(-200);
  // If a pending still exists but identity differs, append orphan journal entry only.
  if (instance.pendingGithubOp) {
    const pending = appendJournal(
      instance.pendingGithubOp,
      "orphaned_result",
      message,
    );
    return replaceInstance(doc, {
      ...instance,
      pendingGithubOp: pending,
      events,
      updatedAt: at,
    });
  }
  return replaceInstance(doc, {
    ...instance,
    events,
    updatedAt: at,
  });
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

type IdentitySnapshot = {
  idempotencyKey?: string;
  dispatchAttemptId?: string;
};

function loadForIdentity(
  deps: SettleGithubDispatchDeps,
  expected: IdentitySnapshot,
):
  | {
      ok: true;
      doc: LoopGraphDocument;
      instance: LoopInstance;
      pending: NonNullable<LoopInstance["pendingGithubOp"]>;
    }
  | {
      ok: false;
      doc: LoopGraphDocument | null;
      reason: "missing_doc" | "cleared" | "replaced";
    } {
  const latest = deps.loadDocument();
  if (!latest) return { ok: false, doc: null, reason: "missing_doc" };
  const instance = latest.instances.find((item) => item.id === deps.instanceId);
  if (!instance) return { ok: false, doc: latest, reason: "cleared" };
  if (!instance.pendingGithubOp) {
    return { ok: false, doc: latest, reason: "cleared" };
  }
  if (!sameGithubDispatchIdentity(expected, instance.pendingGithubOp)) {
    return { ok: false, doc: latest, reason: "replaced" };
  }
  return {
    ok: true,
    doc: latest,
    instance,
    pending: instance.pendingGithubOp,
  };
}

/**
 * Production settle entry — used by ProjectOsLocalApi and unit/integration tests.
 */
export async function settleGithubDispatch(
  deps: SettleGithubDispatchDeps,
): Promise<LoopGraphDocument> {
  return withInstanceLock(deps.instanceId, async () => {
    const counters = deps.counters ?? {
      prepareCalls: 0,
      transportCalls: 0,
      lookupCalls: 0,
      sideEffectCalls: 0,
    };

    let doc = deps.loadDocument();
    if (!doc) throw new Error("Loop document missing during GitHub settle");
    let instance = doc.instances.find((item) => item.id === deps.instanceId);
    if (!instance?.pendingGithubOp) return doc;
    let pending = instance.pendingGithubOp;
    const identity: IdentitySnapshot = {
      ...(pending.idempotencyKey
        ? { idempotencyKey: pending.idempotencyKey }
        : {}),
      ...(pending.dispatchAttemptId
        ? { dispatchAttemptId: pending.dispatchAttemptId }
        : {}),
    };

    const hooks = deps.hooksFor(doc);
    const prior = findPriorGithubOpResult(instance, pending);
    if (prior) {
      return deps.saveDocument(
        completePendingGithubOp(
          doc,
          deps.instanceId,
          {
            ok: true,
            message:
              prior.message ?? "Reusing prior result for same dispatch identity",
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

    // Recovery path: HTTP may already have happened.
    if (isHttpStartedDispatchState(pending.dispatchState)) {
      counters.lookupCalls += 1;
      const listed = await deps.listPullRequests();
      const afterLookup = loadForIdentity(deps, identity);
      if (!afterLookup.ok) {
        if (!afterLookup.doc) {
          throw new Error("Loop document missing after PR lookup");
        }
        return deps.saveDocument(
          journalOrphanedGithubDispatchResult(
            afterLookup.doc,
            deps.instanceId,
            `Lookup finished but pending ${afterLookup.reason}; result not applied`,
          ),
        );
      }
      doc = afterLookup.doc;
      instance = afterLookup.instance;
      pending = afterLookup.pending;
      const matched = matchListedPullRequestForPending(pending, listed);
      const latestHooks = deps.hooksFor(doc);
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
            latestHooks,
            {
              httpCompleted: true,
              deliveryStale:
                instance.status === "cancelled" || instance.status === "paused",
            },
          ),
        );
      }
      return deps.saveDocument(
        blockUnknownInFlightGithubDispatch(
          doc,
          deps.instanceId,
          instance.status === "cancelled" || instance.status === "paused"
            ? `Instance ${instance.status} with unresolved http_started: ${matched.reason}`
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

    const attemptId = `gh_dispatch_${Date.now()}`;
    doc = deps.saveDocument(
      markPendingGithubOpPreparing(doc, deps.instanceId, attemptId),
    );
    identity.dispatchAttemptId = attemptId;

    // —— prepare window (awaitable, no side effects) ——
    counters.prepareCalls += 1;
    let prepared: GithubDispatchPrepared;
    try {
      const prepPending = loadForIdentity(deps, identity);
      if (!prepPending.ok) {
        const latest = prepPending.doc ?? deps.loadDocument() ?? doc;
        return deps.saveDocument(
          denyPendingGithubOpBeforeHttp(
            latest,
            deps.instanceId,
            "Pending cleared/replaced during prepare window",
          ),
        );
      }
      prepared = await deps.prepareOperation(prepPending.pending);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "GitHub prepare failed";
      const latest = deps.loadDocument() ?? doc;
      return deps.saveDocument(
        denyPendingGithubOpBeforeHttp(
          latest,
          deps.instanceId,
          `Prepare failed before HTTP: ${message}`,
        ),
      );
    }

    // —— final gate: ALWAYS re-validate auth/code (preparing is NOT an exemption) ——
    const beforeClaim = loadForIdentity(deps, identity);
    if (!beforeClaim.ok) {
      const latest = beforeClaim.doc ?? deps.loadDocument();
      if (!latest) throw new Error("Loop document missing before HTTP claim");
      return deps.saveDocument(
        journalOrphanedGithubDispatchResult(
          latest,
          deps.instanceId,
          `Prepare finished but pending ${beforeClaim.reason}; transport skipped`,
        ),
      );
    }
    if (
      beforeClaim.instance.status === "cancelled" ||
      beforeClaim.instance.status === "paused"
    ) {
      return deps.saveDocument(
        denyPendingGithubOpBeforeHttp(
          beforeClaim.doc,
          deps.instanceId,
          `Instance ${beforeClaim.instance.status} during prepare window (HTTP not started)`,
        ),
      );
    }
    const claimHooks = deps.hooksFor(beforeClaim.doc);
    const finalGate = preflightPendingGithubDispatch(
      beforeClaim.doc,
      deps.instanceId,
      claimHooks,
    );
    if (!finalGate.ok) {
      // preparing → clearable; never skip this check just because state≠queued
      return deps.saveDocument(
        denyPendingGithubOpBeforeHttp(
          beforeClaim.doc,
          deps.instanceId,
          finalGate.reason,
        ),
      );
    }

    // —— atomic http_started claim (persisted before any transport) ——
    doc = deps.saveDocument(
      markPendingGithubOpHttpStarted(beforeClaim.doc, deps.instanceId, attemptId),
    );

    counters.transportCalls += 1;
    counters.sideEffectCalls += 1;
    let result: LoopGithubOperationResult;
    try {
      const transportPending = loadForIdentity(deps, identity);
      if (!transportPending.ok) {
        const latest = transportPending.doc ?? deps.loadDocument();
        if (!latest) throw new Error("Loop document missing at transport");
        return deps.saveDocument(
          blockUnknownInFlightGithubDispatch(
            latest,
            deps.instanceId,
            `Pending ${transportPending.reason} after http_started claim; transport aborted`,
          ),
        );
      }
      result = await deps.transportOperation(transportPending.pending, prepared);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "GitHub transport failed";
      const afterErr = loadForIdentity(deps, identity);
      const latest = afterErr.ok
        ? afterErr.doc
        : afterErr.doc ?? deps.loadDocument() ?? doc;
      if (!afterErr.ok) {
        return deps.saveDocument(
          journalOrphanedGithubDispatchResult(
            latest,
            deps.instanceId,
            `Transport threw (${message}) and pending ${afterErr.reason}`,
          ),
        );
      }
      return deps.saveDocument(
        blockUnknownInFlightGithubDispatch(
          latest,
          deps.instanceId,
          `Transport threw before confirmed result: ${message}`,
        ),
      );
    }

    // —— writeback: only against the original dispatch identity ——
    const afterTransport = loadForIdentity(deps, identity);
    if (!afterTransport.ok) {
      const latest = afterTransport.doc ?? deps.loadDocument();
      if (!latest) throw new Error("Loop document missing after transport");
      return deps.saveDocument(
        journalOrphanedGithubDispatchResult(
          latest,
          deps.instanceId,
          `Transport returned ok=${result.ok} but pending ${afterTransport.reason}; not applied to new pending`,
        ),
      );
    }
    doc = afterTransport.doc;
    instance = afterTransport.instance;
    const latestHooks = deps.hooksFor(doc);
    const postflight = preflightPendingGithubDispatch(
      doc,
      deps.instanceId,
      latestHooks,
    );

    if (instance.status === "cancelled" || instance.status === "paused") {
      if (result.ok) {
        return deps.saveDocument(
          completePendingGithubOp(doc, deps.instanceId, result, latestHooks, {
            httpCompleted: true,
            deliveryStale: true,
          }),
        );
      }
      return deps.saveDocument(
        blockUnknownInFlightGithubDispatch(
          doc,
          deps.instanceId,
          "Instance cancelled/paused with failed/unknown HTTP outcome",
        ),
      );
    }

    return deps.saveDocument(
      completePendingGithubOp(doc, deps.instanceId, result, latestHooks, {
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
  const counters: GithubDispatchCounters = {
    prepareCalls: 0,
    transportCalls: 0,
    lookupCalls: 0,
    sideEffectCalls: 0,
  };
  const result = await settleGithubDispatch({
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
    prepareOperation: async () => ({}),
    transportOperation: (pending) => {
      probe.createCalls += 1;
      return probe.create({
        operation: pending.operation,
        payload: pending.payload,
      });
    },
    listPullRequests:
      listPullRequests ??
      (async () => ({ available: false, pullRequests: [] })),
    counters,
  });
  probe.lookupCalls = counters.lookupCalls;
  return result;
}
