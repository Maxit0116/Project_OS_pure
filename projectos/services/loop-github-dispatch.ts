/**
 * Product-boundary GitHub settle helpers (testable with HTTP probes).
 * Preflight MUST run before any create HTTP; successful HTTP results are retained
 * even when evidence drifts afterward (delivery_stale).
 */
import type { LoopGraphDocument } from "../contracts/loop-graph.js";
import type { LoopExecutionHooks, LoopGithubOperationResult } from "./loop-execution.js";
import {
  completePendingGithubOp,
  denyPendingGithubOpBeforeHttp,
  markPendingGithubOpInFlight,
  preflightPendingGithubDispatch,
} from "./loop-runtime-service.js";

export type GithubHttpProbe = {
  createCalls: number;
  lookupCalls: number;
  create: (pending: {
    operation: string;
    payload: Record<string, unknown>;
  }) => Promise<LoopGithubOperationResult> | LoopGithubOperationResult;
  lookup?: (pending: {
    operation: string;
    payload: Record<string, unknown>;
    dispatchState?: string;
  }) => Promise<LoopGithubOperationResult | null> | LoopGithubOperationResult | null;
};

/**
 * Settle one pending GitHub op with explicit preflight → optional lookup →
 * single create → postflight retain semantics.
 */
export async function settlePendingGithubOpWithProbe(
  doc: LoopGraphDocument,
  instanceId: string,
  probe: GithubHttpProbe,
  execution?: LoopExecutionHooks,
): Promise<LoopGraphDocument> {
  const instance = doc.instances.find((item) => item.id === instanceId);
  const pending = instance?.pendingGithubOp;
  if (!pending) return doc;

  const priorOk = [...(instance.artifacts ?? [])]
    .reverse()
    .find(
      (item) =>
        item.kind === "github_op_result" &&
        item.nodeId === pending.nodeId &&
        typeof item.data === "object" &&
        item.data &&
        (item.data as { ok?: boolean }).ok === true,
    );
  if (priorOk) {
    return completePendingGithubOp(
      doc,
      instanceId,
      {
        ok: true,
        message: "Reusing prior GitHub op result (no re-dispatch)",
        ...((priorOk.data as { url?: string }).url
          ? { url: (priorOk.data as { url?: string }).url }
          : {}),
        ...((priorOk.data as { number?: number }).number !== undefined
          ? { number: (priorOk.data as { number?: number }).number }
          : {}),
      },
      execution,
      { httpCompleted: true },
    );
  }

  if (pending.dispatchState === "in_flight") {
    probe.lookupCalls += 1;
    const lookedUp = probe.lookup
      ? await probe.lookup({
          operation: pending.operation,
          payload: pending.payload,
          dispatchState: pending.dispatchState,
        })
      : null;
    if (lookedUp) {
      return completePendingGithubOp(doc, instanceId, lookedUp, execution, {
        httpCompleted: true,
      });
    }
    return denyPendingGithubOpBeforeHttp(
      doc,
      instanceId,
      "GitHub dispatch was in_flight with unknown result; confirm remote state before retry (no blind resend)",
    );
  }

  const preflight = preflightPendingGithubDispatch(doc, instanceId, execution);
  if (!preflight.ok) {
    return denyPendingGithubOpBeforeHttp(doc, instanceId, preflight.reason);
  }

  let current = markPendingGithubOpInFlight(
    doc,
    instanceId,
    `probe_${probe.createCalls + 1}`,
  );
  probe.createCalls += 1;
  const result = await probe.create({
    operation: pending.operation,
    payload: pending.payload,
  });
  const postflight = preflightPendingGithubDispatch(
    current,
    instanceId,
    execution,
  );
  return completePendingGithubOp(current, instanceId, result, execution, {
    httpCompleted: true,
    deliveryStale: result.ok && !postflight.ok,
  });
}
