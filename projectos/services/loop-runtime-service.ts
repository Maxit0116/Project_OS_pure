import { createHash, randomUUID } from "node:crypto";

import {
  trimLoopInstanceEvents,
  type LoopGraphDocument,
  type LoopHitlAnswer,
  type LoopInstance,
  type LoopInstanceCheckpoint,
  type LoopInstanceEvent,
  type LoopLaunch,
  type LoopNodeRecord,
  type LoopNodeRecordStatus,
  type LoopReplanProposal,
  type LoopSpec,
  type LoopSpecNode,
  validateLoopSpecTopology,
} from "../contracts/loop-graph.js";
import {
  LOOP_FILES_NOT_ATTACHED,
  LOOP_VERIFICATION_NOT_RUN,
  type LoopExecutionHooks,
  type LoopGithubOperationResult,
} from "./loop-execution.js";
import { getLoopGraph, upsertLoopGraph } from "./loop-graph-service.js";
import {
  buildChangeSetFromRun,
  buildCoderGoal,
  buildHeuristicDevPlan,
  buildHeuristicReviewResult,
  isPlannerAgent,
  isReviewerAgent,
} from "./loop-agent-roles.js";
import {
  isHighRiskTerminalCommand,
  parseTerminalExecCommand,
} from "./loop-terminal-action.js";
import {
  buildApprovalBinding,
  buildDefaultActionPayload,
  accumulateDeliveryScope,
  combineFileDigests,
  computeEngineeringBaseline,
  digestOperationPayload,
  invalidatePendingApproval,
  isApprovalBindingCurrent,
  isApprovalChoice,
} from "./loop-approval-binding.js";
import {
  assertAgentCallBudget,
  recordAgentCallEnd,
  recordAgentCallStart,
  resolveAgentCallBudgetLimits,
} from "./loop-agent-call-budget.js";
import {
  describeOfflineConnector,
  invokeOfflineConnector,
} from "./loop-connector-offline.js";
import {
  assertCodeDigestComplete,
  assertCredentialAllowedByFreeze,
  assertLaunchContextForBinding,
  buildRunBindingSnapshot,
} from "./loop-run-binding.js";
import { preflightLoopRunStart } from "./loop-run-preflight.js";
import {
  architectureOf,
  conditionalOutgoing,
  controlIncomingIds,
  dependsIncoming,
  dependsOutgoingIds,
  dependsOutgoingMap,
  effectiveMaxIterations,
  evidenceToTestReport,
  fallbackOutgoing,
  feedbackEdge,
  findRequestChangesTarget,
  humanQuestionId,
  isActionNode,
  isAgentNode,
  isHumanNode,
  isLogicNode,
  isTestActionNode,
  latestArtifact,
  matchConditionBranch,
  nodeCompleted,
  parseHumanModeFromQuestionId,
  pushArtifact,
  resolveTestStatus,
} from "./loop-runtime-architecture.js";

export type { LoopExecutionHooks } from "./loop-execution.js";

function nowIso(): string {
  return new Date().toISOString();
}

function pushEvent(
  instance: LoopInstance,
  event: Omit<LoopInstanceEvent, "id" | "at"> & { at?: string },
): LoopInstance {
  const nextEvent: LoopInstanceEvent = {
    id: `evt_${randomUUID()}`,
    at: event.at ?? nowIso(),
    type: event.type,
    nodeId: event.nodeId,
    message: event.message,
    ...(event.agentRunId ? { agentRunId: event.agentRunId } : {}),
    ...(event.evidenceId ? { evidenceId: event.evidenceId } : {}),
  };
  return {
    ...instance,
    events: trimLoopInstanceEvents([...instance.events, nextEvent]),
    updatedAt: nextEvent.at,
  };
}

const TERMINAL_NODE_STATUSES = new Set<LoopNodeRecordStatus>([
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
]);

function upsertNodeRecord(
  instance: LoopInstance,
  nodeId: string,
  patch: Partial<Omit<LoopNodeRecord, "nodeId">> & { status: LoopNodeRecordStatus },
): LoopInstance {
  const updatedAt = patch.updatedAt ?? nowIso();
  const records = [...(instance.nodeRecords ?? [])];
  const index = records.findIndex((item) => item.nodeId === nodeId);
  const prev = index >= 0 ? records[index] : undefined;
  const next: LoopNodeRecord = {
    nodeId,
    status: patch.status,
    updatedAt,
    ...(patch.agentRunId !== undefined
      ? { agentRunId: patch.agentRunId }
      : prev?.agentRunId
        ? { agentRunId: prev.agentRunId }
        : {}),
    ...(patch.evidenceId !== undefined
      ? { evidenceId: patch.evidenceId }
      : prev?.evidenceId
        ? { evidenceId: prev.evidenceId }
        : {}),
    ...(patch.artifactIds !== undefined
      ? { artifactIds: patch.artifactIds }
      : prev?.artifactIds
        ? { artifactIds: prev.artifactIds }
        : {}),
    ...(patch.errorMessage !== undefined
      ? { errorMessage: patch.errorMessage }
      : prev?.errorMessage
        ? { errorMessage: prev.errorMessage }
        : {}),
    ...(patch.attempt !== undefined
      ? { attempt: patch.attempt }
      : prev?.attempt !== undefined
        ? { attempt: prev.attempt }
        : {}),
  };
  if (index >= 0) records[index] = next;
  else records.push(next);
  return { ...instance, nodeRecords: records };
}

function recordStatus(
  instance: LoopInstance,
  nodeId: string,
): LoopNodeRecordStatus | undefined {
  return instance.nodeRecords?.find((item) => item.nodeId === nodeId)?.status;
}

function parentsSucceeded(spec: LoopSpec, instance: LoopInstance, nodeId: string): boolean {
  const parents = dependsIncoming(spec, nodeId);
  if (parents.length === 0) return true;
  return parents.every(
    (parentId) =>
      recordStatus(instance, parentId) === "succeeded" || nodeCompleted(instance, parentId),
  );
}

/** GC-2.3 P0: unlock ready nodes; pick one successor (serial drain of Parallel forks). */
function pickNextCursor(
  spec: LoopSpec,
  instance: LoopInstance,
  fromNodeId: string,
): { cursor: string | null; instance: LoopInstance } {
  let next = instance;
  const children = dependsOutgoingIds(spec, fromNodeId);
  for (const childId of children) {
    const status = recordStatus(next, childId);
    if (status && TERMINAL_NODE_STATUSES.has(status)) continue;
    if (parentsSucceeded(spec, next, childId)) {
      next = upsertNodeRecord(next, childId, { status: "ready" });
    }
  }

  // Unlock any other nodes whose parents just became complete.
  for (const node of spec.nodes) {
    const status = recordStatus(next, node.id);
    if (status && TERMINAL_NODE_STATUSES.has(status)) continue;
    if (status === "running" || status === "waiting_approval") continue;
    if (!parentsSucceeded(spec, next, node.id)) continue;
    if (node.id === fromNodeId) continue;
    next = upsertNodeRecord(next, node.id, {
      status: architectureOf(node).logicKind === "merge" ? "waiting" : "ready",
    });
  }

  const mergeReady = spec.nodes.find((node) => {
    if (architectureOf(node).logicKind !== "merge") return false;
    if (recordStatus(next, node.id) === "succeeded") return false;
    return parentsSucceeded(spec, next, node.id);
  });
  if (mergeReady) {
    next = upsertNodeRecord(next, mergeReady.id, { status: "ready" });
    return { cursor: mergeReady.id, instance: next };
  }

  // Prefer direct depends successors so Sequence cannot be pre-empted by an
  // earlier sibling still marked ready (e.g. skipped Test after a forced jump).
  // Parallel: when this node has no children, still drain other ready peers
  // (no-merge fan-out terminals, independent roots) — do NOT treat every
  // terminal as whole-run complete.
  const readyChildren = children.filter(
    (childId) => recordStatus(next, childId) === "ready",
  );
  if (readyChildren.length > 0) {
    return { cursor: readyChildren[0]!, instance: next };
  }

  // Only "ready" (not merge "waiting") — Merge is handled above when joinable.
  const ready = spec.nodes.filter((node) => recordStatus(next, node.id) === "ready");
  if (ready.length > 0) {
    return { cursor: ready[0]!.id, instance: next };
  }

  if (children.length === 1) {
    return { cursor: children[0]!, instance: next };
  }
  if (children.length > 1) {
    return { cursor: children[0]!, instance: next };
  }
  return { cursor: null, instance: next };
}

function cloneSpecAsPendingDraft(spec: LoopSpec, reason: string): LoopSpec {
  const copy = structuredClone(spec);
  const assumptions = [
    ...(copy.assumptions ?? []),
    {
      id: `assume_${randomUUID()}`,
      text: reason.slice(0, 500),
    },
  ].slice(-30);
  return {
    ...copy,
    version: `draft_${randomUUID()}`,
    createdAt: nowIso(),
    assumptions,
  };
}

/**
 * Record a spec revision that still needs approval.
 * The running instance keeps `specVersion` and its current node set.
 */
function buildReplanProposal(from: LoopSpec, to: LoopSpec, reason: string): LoopReplanProposal {
  const fromIds = new Set(from.nodes.map((node) => node.id));
  const toIds = new Set(to.nodes.map((node) => node.id));
  const reusedNodeIds = [...toIds].filter((id) => fromIds.has(id));
  const addedNodeIds = [...toIds].filter((id) => !fromIds.has(id));
  const removedNodeIds = [...fromIds].filter((id) => !toIds.has(id));
  const fromPerms = new Set(from.permissions.map((item) => `${item.action}:${item.scope}`));
  const permissionDelta = to.permissions
    .map((item) => `${item.action}:${item.scope}`)
    .filter((key) => !fromPerms.has(key));
  const riskNotes: string[] = [];
  if (permissionDelta.length > 0) {
    riskNotes.push("Proposed spec adds permissions; approval must not silently expand rights.");
  }
  if (addedNodeIds.length > 0) {
    riskNotes.push(`Adds ${addedNodeIds.length} node(s).`);
  }
  if (removedNodeIds.length > 0) {
    riskNotes.push(`Removes ${removedNodeIds.length} node(s).`);
  }
  return {
    reason: reason.slice(0, 500),
    fromSpecVersion: from.version,
    reusedNodeIds,
    addedNodeIds,
    removedNodeIds,
    permissionDelta,
    riskNotes,
  };
}

function attachPendingSpecDraft(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  reason: string,
): { doc: LoopGraphDocument; instance: LoopInstance } {
  const specDraft = cloneSpecAsPendingDraft(spec, reason);
  const compiledAt = specDraft.createdAt;
  const replan = buildReplanProposal(spec, specDraft, reason);
  // GC-4.4: never silently expand permissions in a replan draft.
  specDraft.permissions = spec.permissions.map((item) => ({ ...item }));
  const nextInstance = pushEvent(
    {
      ...instance,
      status: "awaiting_hitl",
      hitlQuestionIds: ["spec_revision"],
    },
    {
      type: "awaiting_hitl",
      nodeId: instance.cursorNodeId ?? undefined,
      message: `Proposed spec draft ${specDraft.version}; running spec remains ${instance.specVersion}`,
    },
  );
  return {
    instance: nextInstance,
    doc: {
      ...doc,
      pendingCompile: {
        specDraft,
        assumptions: specDraft.assumptions ?? [],
        cycleGates: specDraft.cycleGates ?? [],
        compiledAt,
        replan,
      },
    },
  };
}

function snapshotCheckpoint(instance: LoopInstance): LoopInstanceCheckpoint {
  return {
    savedAt: nowIso(),
    cursorNodeId: instance.cursorNodeId,
    status: instance.status,
    round: instance.round,
    attemptCounts: { ...instance.attemptCounts },
    ...(instance.loopIterations ? { loopIterations: { ...instance.loopIterations } } : {}),
    ...(instance.nodeRecords
      ? { nodeRecords: instance.nodeRecords.map((item) => ({ ...item })) }
      : {}),
    ...(instance.activeRunId ? { activeRunId: instance.activeRunId } : {}),
    ...(instance.activeRunNodeId ? { activeRunNodeId: instance.activeRunNodeId } : {}),
    ...(instance.activeRunIds ? { activeRunIds: [...instance.activeRunIds] } : {}),
    ...(instance.hitlQuestionIds ? { hitlQuestionIds: [...instance.hitlQuestionIds] } : {}),
  };
}

function stampCheckpoint(
  instance: LoopInstance,
  options?: { emitEvent?: boolean },
): LoopInstance {
  const checkpoint = snapshotCheckpoint(instance);
  const next = { ...instance, checkpoint };
  if (!options?.emitEvent) return next;
  return pushEvent(next, {
    type: "checkpoint_saved",
    nodeId: instance.cursorNodeId ?? undefined,
    message: `Checkpoint at ${checkpoint.cursorNodeId ?? "null"} (round ${checkpoint.round})`,
  });
}

function withCheckpoint(instance: LoopInstance): LoopInstance {
  return stampCheckpoint(instance, { emitEvent: true });
}

function replaceInstanceWithCheckpoint(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  options?: { emitEvent?: boolean },
): LoopGraphDocument {
  return replaceInstance(doc, stampCheckpoint(instance, options));
}

function fingerprintContext(input: {
  featureNodeId?: string;
  leafPath?: string;
  specVersion: string;
}): string {
  return createHash("sha256")
    .update(
      `${input.specVersion}|${input.featureNodeId ?? ""}|${input.leafPath ?? ""}`,
      "utf8",
    )
    .digest("hex")
    .slice(0, 32);
}

function applyBudgetAndFreshness(
  instance: LoopInstance,
  spec: LoopSpec,
  execution: LoopExecutionHooks | undefined,
): LoopInstance {
  const startedMs = Date.parse(instance.startedAt);
  const wallClockMs = Number.isFinite(startedMs)
    ? Math.max(0, Date.now() - startedMs)
    : 0;
  const retries = Object.values(instance.attemptCounts).reduce((sum, n) => sum + n, 0);
  let next: LoopInstance = {
    ...instance,
    budgetUsage: {
      ...(instance.budgetUsage ?? {}),
      wallClockMs,
      retries,
    },
  };

  const featureNodeId =
    instance.featureNodeId ?? execution?.leaf?.featureNodeId;
  const pathFingerprint = fingerprintContext({
    ...(featureNodeId ? { featureNodeId } : {}),
    ...(execution?.leaf?.filePath ? { leafPath: execution.leaf.filePath } : {}),
    specVersion: instance.specVersion,
  });
  const baselineId = next.freshness?.baselineId ?? pathFingerprint;
  const stale = next.freshness?.baselineId
    ? next.freshness.baselineId !== pathFingerprint
    : false;
  next = {
    ...next,
    freshness: {
      status: next.freshness?.baselineId ? (stale ? "stale" : "fresh") : "fresh",
      baselineId,
      pathFingerprint,
      checkedAt: nowIso(),
    },
  };

  if (stale && (spec.stalePolicy ?? "warn") === "pause_hitl") {
    next = pushEvent(
      {
        ...next,
        status: "awaiting_hitl",
        hitlQuestionIds: ["freshness_stale"],
      },
      {
        type: "freshness_stale",
        nodeId: next.cursorNodeId ?? undefined,
        message: "Context fingerprint changed since baseline",
      },
    );
    next = pushEvent(next, {
      type: "awaiting_hitl",
      nodeId: next.cursorNodeId ?? undefined,
      message: "Freshness stale — confirm continue",
    });
    return next;
  }
  if (stale) {
    next = pushEvent(next, {
      type: "freshness_stale",
      nodeId: next.cursorNodeId ?? undefined,
      message: "Context fingerprint changed (warn-only)",
    });
  }

  const tokenBudget = spec.stopPolicy.maxBudgetTokens;
  if (typeof tokenBudget === "number" && (next.budgetUsage?.tokens ?? 0) > tokenBudget) {
    next = pushEvent(
      {
        ...next,
        status: "awaiting_hitl",
        hitlQuestionIds: ["budget_exceeded"],
      },
      {
        type: "budget_exceeded",
        message: `Token budget exceeded (${next.budgetUsage?.tokens}/${tokenBudget})`,
      },
    );
    next = pushEvent(next, {
      type: "awaiting_hitl",
      message: "Budget exceeded — confirm continue",
    });
  }
  return next;
}

function validateLaunchParams(
  spec: LoopSpec,
  params: Record<string, unknown> | undefined,
): void {
  const declared = spec.inputParams ?? [];
  if (declared.length === 0) return;
  const provided = params ?? {};
  for (const param of declared) {
    const value = provided[param.name] ?? param.defaultValue;
    if (param.required !== false && (value === undefined || value === null || value === "")) {
      throw new Error(`Missing required launch param: ${param.name}`);
    }
    if (value === undefined) continue;
    if (param.type === "string" && typeof value !== "string") {
      throw new Error(`Launch param ${param.name} must be a string`);
    }
    if (param.type === "number" && typeof value !== "number") {
      throw new Error(`Launch param ${param.name} must be a number`);
    }
    if (param.type === "boolean" && typeof value !== "boolean") {
      throw new Error(`Launch param ${param.name} must be a boolean`);
    }
  }
}

function entryNodeId(spec: LoopSpec): string {
  const incoming = controlIncomingIds(spec);
  const entry = spec.nodes.find((node) => !incoming.has(node.id));
  return entry?.id ?? spec.nodes[0]!.id;
}

function feedbackTarget(spec: LoopSpec): { from: string; to: string } | null {
  const edge = feedbackEdge(spec);
  return edge ? { from: edge.from, to: edge.to } : null;
}

function findSpec(doc: LoopGraphDocument, specVersion: string): LoopSpec | undefined {
  return doc.approvedSpecs.find((spec) => spec.version === specVersion);
}

function replaceInstance(doc: LoopGraphDocument, instance: LoopInstance): LoopGraphDocument {
  return {
    ...doc,
    instances: doc.instances.map((item) => (item.id === instance.id ? instance : item)),
  };
}

const STEPPABLE = new Set(["queued", "running", "awaiting_review"]);

function failNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  nodeId: string,
  message: string,
  options?: { execution?: LoopExecutionHooks; spec?: LoopSpec },
): LoopGraphDocument {
  let next = upsertNodeRecord(instance, nodeId, {
    status: "failed",
    errorMessage: message.slice(0, 1000),
  });

  const spec = options?.spec ?? findSpec(doc, instance.specVersion);
  const fallback = spec ? fallbackOutgoing(spec, nodeId) : undefined;
  if (fallback && spec) {
    next = pushEvent(next, {
      type: "fallback_taken",
      nodeId,
      message: `Fallback to ${fallback.to}: ${message}`.slice(0, 2000),
    });
    next = upsertNodeRecord(next, fallback.to, { status: "ready" });
    next = {
      ...next,
      status: "running",
      cursorNodeId: fallback.to,
      errorMessage: undefined,
      completedAt: undefined,
      activeRunId: undefined,
      activeRunNodeId: undefined,
    };
    return replaceInstance(doc, next);
  }

  if (spec?.retryPolicy.onFailure === "fallback") {
    next = pushEvent(
      {
        ...next,
        status: "awaiting_hitl",
        hitlQuestionIds: ["fallback_missing"],
        errorMessage: message.slice(0, 1000),
      },
      {
        type: "awaiting_hitl",
        nodeId,
        message: "Failure policy is fallback but no fallback edge exists",
      },
    );
    return replaceInstance(doc, next);
  }

  next = pushEvent(
    {
      ...next,
      status: "error",
      errorMessage: message.slice(0, 1000),
      completedAt: nowIso(),
    },
    { type: "node_failed", nodeId, message },
  );
  return replaceInstance(doc, next);
}

function isImplementRole(role: string): role is "implement" | "fix" {
  return role === "implement" || role === "fix";
}

/**
 * One scheduler tick. Updates only the instance (cursor, round, events, status).
 * Approved specs stay frozen. A replan writes `pendingCompile` and waits;
 * it does not switch `specVersion`.
 * Dispatch prefers architecture `type`, then legacy roles.
 */
function checkWallClockTimeout(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
): LoopGraphDocument | null {
  const limit = spec.stopPolicy.maxWallClockMs;
  if (!limit || limit <= 0) return null;
  const started = Date.parse(instance.startedAt);
  if (!Number.isFinite(started)) return null;
  const elapsed = Date.now() - started;
  if (elapsed < limit) return null;
  const next = pushEvent(
    {
      ...instance,
      status: "awaiting_hitl",
      hitlQuestionIds: ["wall_clock_timeout"],
      errorMessage: `Wall-clock budget exceeded (${limit}ms)`,
    },
    {
      type: "awaiting_hitl",
      nodeId: instance.cursorNodeId ?? undefined,
      message: `Wall-clock timeout after ${elapsed}ms (limit ${limit}ms)`,
    },
  );
  return replaceInstance(doc, next);
}

export function stepLoopInstance(
  doc: LoopGraphDocument,
  instanceId: string,
  options?: { execution?: LoopExecutionHooks | undefined },
): LoopGraphDocument {
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance) throw new Error(`Instance not found: ${instanceId}`);
  if (!STEPPABLE.has(instance.status)) {
    return doc;
  }
  // Async GitHub settle owns the cursor until completePendingGithubOp advances.
  if (instance.pendingGithubOp) {
    return doc;
  }

  const spec = findSpec(doc, instance.specVersion);
  if (!spec) throw new Error(`Spec not found: ${instance.specVersion}`);
  const timedOut = checkWallClockTimeout(doc, instance, spec);
  if (timedOut) return timedOut;
  const execution = options?.execution;

  let next = applyBudgetAndFreshness(instance, spec, execution);
  if (next.status === "awaiting_hitl" && instance.status !== "awaiting_hitl") {
    return replaceInstanceWithCheckpoint(doc, next, { emitEvent: true });
  }

  next = next.status === "queued"
    ? pushEvent({ ...next, status: "running" }, { type: "started" })
    : next;

  const cursor = next.cursorNodeId ?? entryNodeId(spec);
  const node = spec.nodes.find((item) => item.id === cursor);
  if (!node) {
    next = pushEvent(
      { ...next, status: "error", errorMessage: `Missing node ${cursor}`, completedAt: nowIso() },
      { type: "errored", message: `Missing node ${cursor}` },
    );
    return replaceInstance(doc, next);
  }
  next = upsertNodeRecord(next, cursor, { status: "running" });

  // After HITL resolve on human/decide, advance (unless resolveLoopHitl already redirected).
  if (
    isHumanNode(node) &&
    next.events.at(-1)?.type === "hitl_resolved" &&
    !next.hitlQuestionIds?.length
  ) {
    return advanceCursor(doc, { ...next, cursorNodeId: cursor }, spec, cursor);
  }

  if (isLogicNode(node)) {
    return stepLogicNode(doc, next, spec, node, execution);
  }

  if (isActionNode(node) || isTestActionNode(node)) {
    if (isTestActionNode(node)) {
      return stepVerifyNode(doc, next, spec, node, execution);
    }
    return stepActionNode(doc, next, spec, node, execution);
  }

  if (isHumanNode(node) && !isImplementRole(node.role) && !isAgentNode(node)) {
    return stepHumanNode(doc, next, node);
  }

  if (isAgentNode(node) || isImplementRole(node.role)) {
    if (isPlannerAgent(node)) {
      return stepPlannerNode(doc, next, spec, node);
    }
    if (isReviewerAgent(node)) {
      return stepReviewerNode(doc, next, spec, node);
    }
    return stepImplementNode(doc, next, spec, node, execution);
  }

  if (node.role === "verify") {
    return stepVerifyNode(doc, next, spec, node, execution);
  }

  return failNode(doc, next, cursor, `Unsupported loop node ${node.id}`, { spec });
}

function stepPlannerNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
): LoopGraphDocument {
  let next = pushEvent(
    { ...instance, cursorNodeId: node.id, status: "running" },
    { type: "node_entered", nodeId: node.id, message: node.goal },
  );

  const plan = buildHeuristicDevPlan({
    goal: spec.goal,
    nodeGoal: node.goal,
    constraints: node.constraints,
  });

  next = pushArtifact(next, {
    nodeId: node.id,
    kind: "dev_plan",
    data: plan,
  });
  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: `Planner emitted DevPlan with ${plan.tasks.length} tasks`,
  });
  return advanceCursor(doc, next, spec, node.id);
}

function stepReviewerNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
): LoopGraphDocument {
  let next = pushEvent(
    { ...instance, cursorNodeId: node.id, status: "running" },
    { type: "node_entered", nodeId: node.id, message: node.goal },
  );

  const result = buildHeuristicReviewResult(next);
  next = pushArtifact(next, {
    nodeId: node.id,
    kind: "review_result",
    data: result,
  });

  if (result.verdict === "blocked") {
    next = pushEvent(
      {
        ...next,
        status: "awaiting_hitl",
        hitlQuestionIds: [`human_review_${node.id}`],
      },
      {
        type: "awaiting_hitl",
        nodeId: node.id,
        message: result.summary ?? "Review blocked",
      },
    );
    return replaceInstance(doc, next);
  }

  if (result.verdict === "needs_changes") {
    const target = findRequestChangesTarget(spec, node.id);
    if (!target) {
      return failNode(
        doc,
        next,
        node.id,
        "Reviewer needs_changes but no coder/planner target",
      );
    }
    const attempts = (next.attemptCounts[target] ?? 0) + 1;
    const max = effectiveMaxIterations(spec, target);
    if (attempts > max) {
      next = pushEvent(
        {
          ...next,
          status: "awaiting_hitl",
          attemptCounts: { ...next.attemptCounts, [target]: attempts },
          hitlQuestionIds: ["stop_policy"],
        },
        {
          type: "awaiting_hitl",
          nodeId: node.id,
          message: `Reviewer retries exhausted (${max})`,
        },
      );
      return replaceInstance(doc, next);
    }
    next = pushEvent(next, {
      type: "node_completed",
      nodeId: node.id,
      message: `Reviewer needs_changes → ${target}`,
    });
    return replaceInstance(doc, {
      ...next,
      cursorNodeId: target,
      round: next.round + 1,
      attemptCounts: { ...next.attemptCounts, [target]: attempts },
      activeRunId: undefined,
      activeRunNodeId: undefined,
      status: "running",
      updatedAt: nowIso(),
    });
  }

  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: result.summary ?? "Reviewer passed",
  });
  return advanceCursor(doc, next, spec, node.id);
}

function stepLogicNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
  execution: LoopExecutionHooks | undefined,
): LoopGraphDocument {
  const arch = architectureOf(node);
  const kind = arch.logicKind ?? "condition";

  if (kind === "condition") {
    return stepConditionNode(doc, instance, spec, node, execution);
  }
  if (kind === "exit") {
    return stepExitNode(doc, instance, node);
  }
  if (kind === "merge") {
    return stepMergeNode(doc, instance, spec, node);
  }
  if (kind === "loop") {
    return stepLoopLogicNode(doc, instance, spec, node);
  }
  if (kind === "retry") {
    return stepRetryLogicNode(doc, instance, spec, node);
  }
  if (kind === "wait") {
    return stepWaitLogicNode(doc, instance, spec, node);
  }

  return failNode(
    doc,
    instance,
    node.id,
    `Unsupported logic kind ${kind}`,
    { spec },
  );
}

function stepRetryLogicNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
): LoopGraphDocument {
  const max = node.maxIterations ?? spec.retryPolicy.maxAutoRetries ?? 3;
  const attempts = (instance.attemptCounts[node.id] ?? 0) + 1;
  let next = upsertNodeRecord(
    {
      ...instance,
      cursorNodeId: node.id,
      attemptCounts: { ...instance.attemptCounts, [node.id]: attempts },
    },
    node.id,
    { status: "running", attempt: attempts },
  );
  next = pushEvent(next, {
    type: "node_entered",
    nodeId: node.id,
    message: `Retry gate ${attempts}/${max}`,
  });

  if (attempts > max) {
    next = pushEvent(
      {
        ...next,
        status: "awaiting_hitl",
        hitlQuestionIds: ["stop_policy"],
      },
      {
        type: "awaiting_hitl",
        nodeId: node.id,
        message: `Retry budget exhausted (${max})`,
      },
    );
    next = upsertNodeRecord(next, node.id, { status: "waiting_approval" });
    return replaceInstance(doc, next);
  }

  const target =
    dependsOutgoingIds(spec, node.id)[0] ??
    feedbackTarget(spec)?.to ??
    null;
  if (!target) {
    return failNode(doc, next, node.id, "Retry node has no depends/feedback target", {
      spec,
    });
  }

  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: `Retry redirect to ${target} (attempt ${attempts})`,
  });
  next = upsertNodeRecord(next, node.id, { status: "succeeded" });
  next = upsertNodeRecord(next, target, { status: "ready", attempt: attempts });
  return replaceInstance(doc, {
    ...next,
    cursorNodeId: target,
    round: next.round + 1,
    activeRunId: undefined,
    activeRunNodeId: undefined,
    updatedAt: nowIso(),
  });
}

function stepWaitLogicNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
): LoopGraphDocument {
  let next = upsertNodeRecord(
    { ...instance, cursorNodeId: node.id, status: "running" },
    node.id,
    { status: "waiting" },
  );
  next = pushEvent(next, {
    type: "node_entered",
    nodeId: node.id,
    message: node.goal,
  });

  const parents = dependsIncoming(spec, node.id);
  const missing = parents.filter(
    (parentId) =>
      recordStatus(next, parentId) !== "succeeded" && !nodeCompleted(next, parentId),
  );
  if (missing.length > 0) {
    next = pushEvent(next, {
      type: "message",
      nodeId: node.id,
      message: `Wait for: ${missing.join(", ")}`,
    });
    return replaceInstance(doc, next);
  }

  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: "Wait satisfied",
  });
  return advanceCursor(doc, next, spec, node.id);
}

function stepConditionNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
  execution: LoopExecutionHooks | undefined,
): LoopGraphDocument {
  let next = pushEvent(
    { ...instance, cursorNodeId: node.id, status: "running" },
    { type: "node_entered", nodeId: node.id, message: node.goal },
  );

  const status = resolveTestStatus(next, execution);
  if (!status) {
    return failNode(
      doc,
      next,
      node.id,
      "Condition has no TestReport/evidence to branch on",
    );
  }

  const edges = conditionalOutgoing(spec, node.id);
  const matched = matchConditionBranch(status, edges);
  if (!matched) {
    return failNode(
      doc,
      next,
      node.id,
      `Condition status "${status}" matched no conditional branch`,
    );
  }

  const branchKey = (matched.branchKey ?? "").toLowerCase();
  const isFailBranch = ["fail", "failed", "false", "no", "error"].includes(branchKey);
  const attempts = isFailBranch
    ? (next.attemptCounts[matched.to] ?? 0) + 1
    : (next.attemptCounts[matched.to] ?? 0);
  const max = effectiveMaxIterations(spec, matched.to);
  if (isFailBranch && attempts > max) {
    next = pushEvent(
      {
        ...next,
        status: "awaiting_hitl",
        attemptCounts: {
          ...next.attemptCounts,
          [matched.to]: attempts,
        },
        hitlQuestionIds: ["stop_policy"],
      },
      {
        type: "awaiting_hitl",
        nodeId: node.id,
        message: `Condition fail retries exhausted (${max})`,
      },
    );
    return replaceInstance(doc, next);
  }

  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: `Condition branched ${matched.branchKey} (${status})`,
  });
  return replaceInstance(doc, {
    ...next,
    cursorNodeId: matched.to,
    round: isFailBranch ? next.round + 1 : next.round,
    attemptCounts: isFailBranch
      ? { ...next.attemptCounts, [matched.to]: attempts }
      : next.attemptCounts,
    activeRunId: isFailBranch ? undefined : next.activeRunId,
    activeRunNodeId: isFailBranch ? undefined : next.activeRunNodeId,
    updatedAt: nowIso(),
  });
}

function stepLoopLogicNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
): LoopGraphDocument {
  const max = node.maxIterations ?? effectiveMaxIterations(spec, node.id);
  const current = (instance.loopIterations?.[node.id] ?? 0) + 1;
  let next: LoopInstance = {
    ...instance,
    cursorNodeId: node.id,
    loopIterations: {
      ...(instance.loopIterations ?? {}),
      [node.id]: current,
    },
  };
  next = pushEvent(next, {
    type: "node_entered",
    nodeId: node.id,
    message: `Loop iteration ${current}/${max}`,
  });

  if (current > max) {
    next = pushEvent(
      {
        ...next,
        status: "awaiting_hitl",
        hitlQuestionIds: ["loop_max_iterations"],
      },
      {
        type: "awaiting_hitl",
        nodeId: node.id,
        message: `Loop maxIterations (${max}) reached`,
      },
    );
    return replaceInstance(doc, next);
  }

  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: `Loop continue iteration ${current}`,
  });
  return advanceCursor(doc, next, spec, node.id);
}

function stepExitNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  node: LoopSpecNode,
): LoopGraphDocument {
  const artifactKinds = (instance.artifacts ?? [])
    .map((item) => item.kind)
    .join(", ");
  let next = pushEvent(
    { ...instance, cursorNodeId: node.id },
    { type: "node_entered", nodeId: node.id, message: node.goal },
  );
  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: artifactKinds
      ? `Exit with artifacts: ${artifactKinds}`
      : "Exit workflow",
  });
  next = pushEvent(
    {
      ...next,
      status: "complete",
      completedAt: nowIso(),
      cursorNodeId: node.id,
    },
    { type: "completed", message: "Loop complete via Exit node" },
  );
  return replaceInstance(doc, next);
}

function stepMergeNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
): LoopGraphDocument {
  let next = upsertNodeRecord(
    { ...instance, cursorNodeId: node.id, status: "running" },
    node.id,
    { status: "waiting" },
  );
  next = pushEvent(next, {
    type: "node_entered",
    nodeId: node.id,
    message: node.goal,
  });
  const parents = dependsIncoming(spec, node.id);
  const missing = parents.filter(
    (parentId) =>
      recordStatus(next, parentId) !== "succeeded" && !nodeCompleted(next, parentId),
  );
  if (missing.length > 0) {
    next = pushEvent(next, {
      type: "message",
      nodeId: node.id,
      message: `Merge waiting for: ${missing.join(", ")}`,
    });

    // P0 serial drain: if other fork siblings are ready, leave Merge and run them.
    const readySibling = spec.nodes.find((candidate) => {
      if (candidate.id === node.id) return false;
      return recordStatus(next, candidate.id) === "ready";
    });
    if (readySibling) {
      return replaceInstance(doc, {
        ...next,
        cursorNodeId: readySibling.id,
        updatedAt: nowIso(),
      });
    }

    const failedParent = parents.find(
      (parentId) => recordStatus(next, parentId) === "failed",
    );
    if (failedParent) {
      const fallback = fallbackOutgoing(spec, failedParent);
      if (fallback) {
        return failNode(doc, next, failedParent, "Merge parent failed", { spec });
      }
      next = pushEvent(
        {
          ...next,
          status: "awaiting_hitl",
          hitlQuestionIds: ["merge_blocked"],
        },
        {
          type: "awaiting_hitl",
          nodeId: node.id,
          message: `Merge blocked: parent ${failedParent} failed`,
        },
      );
      return replaceInstance(doc, next);
    }

    // No parents ever succeeded and nothing else is ready → blocked.
    if (parents.length > 0 && missing.length === parents.length) {
      next = pushEvent(
        {
          ...next,
          status: "awaiting_hitl",
          hitlQuestionIds: ["merge_blocked"],
        },
        {
          type: "awaiting_hitl",
          nodeId: node.id,
          message: "Merge has no completed inbound branches",
        },
      );
    }
    return replaceInstance(doc, next);
  }

  next = upsertNodeRecord(next, node.id, { status: "succeeded" });
  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: `Merge joined ${parents.length || 0} branches`,
  });
  return advanceCursor(doc, next, spec, node.id);
}

function stepHumanNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  node: LoopSpecNode,
): LoopGraphDocument {
  const arch = architectureOf(node);
  const mode = arch.humanMode ?? "approval";
  const questionId = humanQuestionId(node);
  const next = pushEvent(
    {
      ...instance,
      cursorNodeId: node.id,
      status: "awaiting_hitl",
      hitlQuestionIds: [questionId],
    },
    {
      type: "node_entered",
      nodeId: node.id,
      message: node.goal,
    },
  );
  return replaceInstance(
    doc,
    pushEvent(next, {
      type: "awaiting_hitl",
      nodeId: node.id,
      message: `Waiting for human ${mode}`,
    }),
  );
}

function stepActionNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
  execution: LoopExecutionHooks | undefined,
): LoopGraphDocument {
  const arch = architectureOf(node);
  let next = pushEvent(
    { ...instance, cursorNodeId: node.id, status: "running" },
    { type: "node_entered", nodeId: node.id, message: node.goal },
  );

  const requiresApproval =
    arch.actionIntegration === "github" ||
    arch.actionIntegration === "terminal" ||
    spec.permissions.some(
      (perm) =>
        perm.requiresApproval &&
        (perm.action.includes(arch.actionOperation ?? "") ||
          perm.action.includes(arch.actionIntegration ?? "")),
    );

  const defaultPayload = buildDefaultActionPayload({
    nodeId: node.id,
    ...(arch.actionIntegration
      ? { actionIntegration: arch.actionIntegration }
      : {}),
    ...(arch.actionOperation ? { actionOperation: arch.actionOperation } : {}),
  });
  const approvedPayload = next.pendingActionPayload;
  const bindingOk = Boolean(
    next.pendingApprovalBinding &&
      approvedPayload &&
      isApprovalBindingCurrent({
        binding: next.pendingApprovalBinding,
        instance: next,
        payload: approvedPayload,
        actionNodeId: node.id,
        ...(arch.actionIntegration
          ? { actionIntegration: arch.actionIntegration }
          : {}),
        ...(arch.actionOperation
          ? { actionOperation: arch.actionOperation }
          : {}),
        ...(execution ? { execution } : {}),
      }),
  );
  // Fail-closed: a historical human_decision with choice≈approve is not enough.
  // Delivery-gate Actions require a live binding to Action node + artifacts + params.
  const hasApproval = bindingOk;

  if (requiresApproval && !hasApproval) {
    const stale =
      Boolean(next.pendingApprovalBinding || approvedPayload) ||
      Boolean(latestArtifact(next, "human_decision"));
    if (stale) {
      next = invalidatePendingApproval(
        next,
        "Approval binding no longer matches Action target, engineering baseline, or payload",
      );
      next = pushEvent(next, {
        type: "approval_stale",
        nodeId: node.id,
        message:
          "Prior approval invalidated; re-approval required before side-effect Action",
      });
    }
    next = pushEvent(
      {
        ...next,
        status: "awaiting_hitl",
        hitlQuestionIds: [`human_approval_${node.id}`],
        // Surface default params awaiting approval (not only editedPayload).
        pendingActionPayload: approvedPayload ?? defaultPayload,
      },
      {
        type: "awaiting_hitl",
        nodeId: node.id,
        message: stale
          ? `Action ${arch.actionOperation ?? arch.actionIntegration} approval stale — re-approve`
          : `Action ${arch.actionOperation ?? arch.actionIntegration} requires approval`,
      },
    );
    return replaceInstance(doc, next);
  }

  const payload = approvedPayload ?? defaultPayload;

  if (arch.actionIntegration === "github") {
    return stepGithubAction(doc, next, spec, node, execution, payload);
  }
  if (arch.actionIntegration === "terminal") {
    return stepTerminalAction(doc, next, spec, node, execution, payload, Boolean(hasApproval));
  }
  // SaaS connectors (Batch1–3 + Gmail): freeze check + DI settle / fail-closed.
  // Must not fall through to the synthetic "Executed …" success below.
  if (
    arch.actionIntegration === "slack" ||
    arch.actionIntegration === "feishu" ||
    arch.actionIntegration === "lark" ||
    arch.actionIntegration === "sentry" ||
    arch.actionIntegration === "gmail" ||
    arch.actionIntegration === "supabase" ||
    arch.actionIntegration === "posthog" ||
    arch.actionIntegration === "linear" ||
    arch.actionIntegration === "jira_cloud" ||
    arch.actionIntegration === "notion" ||
    arch.actionIntegration === "vercel"
  ) {
    const capabilityId = arch.actionOperation ?? "post_message";
    const credentialRefId =
      typeof payload.credentialRefId === "string"
        ? payload.credentialRefId
        : typeof (node as { credentialRefId?: string }).credentialRefId ===
            "string"
          ? (node as { credentialRefId?: string }).credentialRefId
          : undefined;

    const freezeCred = assertCredentialAllowedByFreeze(
      next.runBinding,
      credentialRefId,
    );
    if (!freezeCred.ok) {
      return failNode(doc, next, node.id, freezeCred.reason, { spec });
    }

    if (execution?.executeConnectorOperation) {
      let connectorResult: {
        ok: boolean;
        deferred?: boolean;
        message?: string;
        credentialRefId?: string;
      };
      try {
        connectorResult = execution.executeConnectorOperation({
          vendorId: arch.actionIntegration,
          capabilityId,
          payload,
          ...(credentialRefId ? { credentialRefId } : {}),
          nodeId: node.id,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Connector operation failed";
        return failNode(doc, next, node.id, message, { spec });
      }
      if (connectorResult.deferred) {
        const cred =
          connectorResult.credentialRefId ?? credentialRefId ?? "";
        if (!cred) {
          return failNode(
            doc,
            next,
            node.id,
            "Connector settle requires credentialRefId (configured ≠ authorized)",
            { spec },
          );
        }
        const idempotencyKey = [
          next.id,
          node.id,
          arch.actionIntegration,
          capabilityId,
          digestOperationPayload(payload),
        ].join(":");
        const pendingConnectorOp = {
          nodeId: node.id,
          vendorId: arch.actionIntegration,
          capabilityId,
          payload,
          credentialRefId: cred,
          idempotencyKey,
          queuedAt: nowIso(),
          dispatchState: "queued" as const,
        };
        const queued = pushEvent(
          {
            ...next,
            pendingActionPayload: undefined,
            pendingApprovalBinding: undefined,
            pendingConnectorOp,
            status: "running" as const,
          },
          {
            type: "message",
            nodeId: node.id,
            message:
              connectorResult.message ??
              `${arch.actionIntegration}.${capabilityId} queued for settle`,
          },
        );
        return replaceInstance(doc, queued);
      }
      if (!connectorResult.ok) {
        return failNode(
          doc,
          next,
          node.id,
          connectorResult.message || "Connector operation failed",
          { spec },
        );
      }
      let advanced = pushArtifact(next, {
        nodeId: node.id,
        kind: "change_set",
        data: {
          summary: `Connector ${arch.actionIntegration}.${capabilityId} completed`,
        },
      });
      advanced = {
        ...advanced,
        pendingActionPayload: undefined,
        pendingApprovalBinding: undefined,
        pendingConnectorOp: undefined,
      };
      advanced = pushEvent(advanced, {
        type: "node_completed",
        nodeId: node.id,
        message: `Action ${arch.actionIntegration}.${capabilityId} completed`,
      });
      return advanceCursor(doc, advanced, spec, node.id);
    }

    // No DI bridge — fail closed (brand ≠ executable). Never synthetic success.
    const offlineKind = arch.actionIntegration;
    const blockedMessage =
      offlineKind === "slack" ||
      offlineKind === "feishu" ||
      offlineKind === "lark" ||
      offlineKind === "sentry"
        ? invokeOfflineConnector(
            describeOfflineConnector(
              offlineKind,
              credentialRefId ? "offline" : "unconfigured",
            ),
            capabilityId,
          ).message
        : credentialRefId
          ? `${offlineKind}.${capabilityId} offline — inject connector transport/secret before settle (configured ≠ authorized / not live)`
          : `${offlineKind}.${capabilityId} unconfigured — credentialRefId required (catalog ≠ authorized)`;
    next = pushEvent(
      {
        ...next,
        status: "error",
        errorMessage: blockedMessage.slice(0, 1000),
        pendingActionPayload: undefined,
        pendingApprovalBinding: undefined,
      },
      {
        type: "node_failed",
        nodeId: node.id,
        message: blockedMessage,
      },
    );
    return replaceInstance(doc, next);
  }

  next = pushArtifact(next, {
    nodeId: node.id,
    kind: "change_set",
    data: {
      files: [],
      summary: `Executed ${arch.actionIntegration}.${arch.actionOperation}`,
    },
  });
  next = {
    ...next,
    pendingActionPayload: undefined,
    pendingApprovalBinding: undefined,
  };
  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: `Action ${arch.actionIntegration}.${arch.actionOperation} completed`,
  });
  return advanceCursor(doc, next, spec, node.id);
}

function stepGithubAction(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
  execution: LoopExecutionHooks | undefined,
  payload: Record<string, unknown>,
): LoopGraphDocument {
  const arch = architectureOf(node);
  const operation = arch.actionOperation ?? "create_pr";
  let githubResult: LoopGithubOperationResult = {
    ok: true,
    simulated: true,
    message: "Simulated GitHub action (MVP)",
    refs: Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [key, String(value)]),
    ),
  };

  if (execution?.executeGithubOperation) {
    try {
      githubResult = execution.executeGithubOperation({ operation, payload });
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitHub operation failed";
      return failNode(doc, instance, node.id, message, { spec });
    }
  }

  if (githubResult.deferred) {
    const bindingSnapshot = instance.pendingApprovalBinding;
    const idempotencyKey = [
      instance.id,
      node.id,
      operation,
      digestOperationPayload(payload),
    ].join(":");
    const pendingGithubOp = {
      nodeId: node.id,
      operation,
      payload,
      queuedAt: nowIso(),
      dispatchState: "queued" as const,
      idempotencyKey,
      ...(bindingSnapshot ? { approvalBinding: bindingSnapshot } : {}),
    };
    const queued = {
      ...instance,
      pendingActionPayload: undefined,
      pendingApprovalBinding: undefined,
      pendingGithubOp,
      status: "running" as const,
    };
    const withEvent = pushEvent(queued, {
      type: "message",
      nodeId: node.id,
      message: githubResult.message ?? `GitHub ${operation} queued for settle`,
    });
    return replaceInstance(doc, {
      ...withEvent,
      pendingActionPayload: undefined,
      pendingApprovalBinding: undefined,
      pendingGithubOp,
      status: "running" as const,
    });
  }

  if (!githubResult.ok) {
    return failNode(
      doc,
      instance,
      node.id,
      githubResult.message || "GitHub operation failed",
    );
  }

  let next = pushArtifact(instance, {
    nodeId: node.id,
    kind: "github_op_result",
    data: {
      operation,
      ok: true,
      ...(githubResult.url ? { url: githubResult.url } : {}),
      ...(typeof githubResult.number === "number" ? { number: githubResult.number } : {}),
      ...(githubResult.refs ? { refs: githubResult.refs } : {}),
      message: githubResult.message,
    },
  });
  next = {
    ...next,
    pendingActionPayload: undefined,
    pendingApprovalBinding: undefined,
    pendingGithubOp: undefined,
  };
  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: `Action github.${operation} completed`,
  });
  return advanceCursor(doc, next, spec, node.id);
}

function stepTerminalAction(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
  execution: LoopExecutionHooks | undefined,
  payload: Record<string, unknown>,
  hasApproval: boolean,
): LoopGraphDocument {
  const parsed = parseTerminalExecCommand({
    payload,
    nodeGoal: node.goal,
  });
  const commandLine = [parsed.command, ...parsed.args].join(" ");

  if (isHighRiskTerminalCommand(commandLine) && !hasApproval) {
    return replaceInstance(
      doc,
      pushEvent(
        {
          ...instance,
          status: "awaiting_hitl",
          hitlQuestionIds: [`human_approval_${node.id}`],
        },
        {
          type: "awaiting_hitl",
          nodeId: node.id,
          message: `High-risk terminal command requires approval: ${commandLine.slice(0, 160)}`,
        },
      ),
    );
  }

  if (!execution?.executeTerminalCommand) {
    let next = pushArtifact(instance, {
      nodeId: node.id,
      kind: "change_set",
      data: {
        files: [],
        summary: `Terminal policy-gated (no executor): ${commandLine.slice(0, 240)}`,
      },
    });
    next = {
      ...next,
      pendingActionPayload: undefined,
      pendingApprovalBinding: undefined,
    };
    next = pushEvent(next, {
      type: "node_completed",
      nodeId: node.id,
      message: `Action terminal.exec completed (dry)`,
    });
    return advanceCursor(doc, next, spec, node.id);
  }

  let result;
  try {
    result = execution.executeTerminalCommand({
      command: parsed.command,
      args: parsed.args,
      timeoutMs: parsed.timeoutMs,
      ...(typeof payload.cwd === "string" ? { cwd: payload.cwd } : {}),
      approved: hasApproval,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terminal execution failed";
    return failNode(doc, instance, node.id, message, { spec });
  }

  if (result.policyDenied) {
    return failNode(doc, instance, node.id, result.message || "Terminal policy_denied", {
      spec,
    });
  }
  if (result.blocked || result.timedOut) {
    let next = pushEvent(
      {
        ...instance,
        status: "awaiting_hitl",
        hitlQuestionIds: ["terminal_blocked"],
      },
      {
        type: "awaiting_hitl",
        nodeId: node.id,
        message: result.message || "Terminal blocked / timed out",
      },
    );
    next = pushArtifact(next, {
      nodeId: node.id,
      kind: "change_set",
      data: {
        files: [],
        summary: result.message,
        problems: [result.message],
      },
    });
    return replaceInstance(doc, next);
  }
  if (!result.ok) {
    return failNode(doc, instance, node.id, result.message || "Terminal command failed", {
      spec,
    });
  }

  let next = pushArtifact(instance, {
    nodeId: node.id,
    kind: "change_set",
    data: {
      files: [],
      summary: result.message.slice(0, 500),
    },
  });
  next = {
    ...next,
    pendingActionPayload: undefined,
    pendingApprovalBinding: undefined,
  };
  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: `Action terminal.exec completed (exit ${result.exitCode ?? 0})`,
  });
  return advanceCursor(doc, next, spec, node.id);
}

/**
 * Preflight approval/cancel/target checks BEFORE any HTTP dispatch.
 * Callers that send GitHub HTTP must invoke this and abort on !ok (zero HTTP).
 */
export function preflightPendingGithubDispatch(
  doc: LoopGraphDocument,
  instanceId: string,
  execution?: LoopExecutionHooks,
): { ok: true } | { ok: false; reason: string } {
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance?.pendingGithubOp) {
    return { ok: false, reason: "No pending GitHub operation" };
  }
  if (
    instance.status === "cancelled" ||
    instance.status === "paused" ||
    instance.status === "error" ||
    instance.status === "complete"
  ) {
    return {
      ok: false,
      reason: `Instance status ${instance.status} forbids GitHub dispatch`,
    };
  }
  const pending = instance.pendingGithubOp;
  const spec = findSpec(doc, instance.specVersion);
  if (!spec) return { ok: false, reason: "Spec not found" };
  const actionNode = spec.nodes.find((item) => item.id === pending.nodeId);
  if (!actionNode) {
    return { ok: false, reason: `Action node missing: ${pending.nodeId}` };
  }
  const arch = architectureOf(actionNode);
  if ((arch.actionOperation ?? "create_pr") !== pending.operation) {
    return {
      ok: false,
      reason: `Pending operation ${pending.operation} mismatches node ${arch.actionOperation}`,
    };
  }
  if (!pending.approvalBinding) {
    return { ok: false, reason: "Pending GitHub op lacks approval binding" };
  }
  const stillValid = isApprovalBindingCurrent({
    binding: pending.approvalBinding,
    instance: {
      ...instance,
      pendingActionPayload: pending.payload,
      pendingApprovalBinding: pending.approvalBinding,
    },
    payload: pending.payload,
    actionNodeId: pending.nodeId,
    ...(arch.actionIntegration
      ? { actionIntegration: arch.actionIntegration }
      : {}),
    actionOperation: pending.operation,
    ...(execution ? { execution } : {}),
  });
  if (!stillValid) {
    return {
      ok: false,
      reason:
        "Approval binding stale vs current run/code/operation/target (preflight)",
    };
  }
  return { ok: true };
}

/**
 * Block dispatch with zero HTTP — clear queue and re-require approval.
 * Never clears `http_started` / legacy `in_flight` / journaled-unknown pending:
 * wiping would let a later approve create a second side effect.
 * `preparing` (no transport yet) may clear.
 */
export function denyPendingGithubOpBeforeHttp(
  doc: LoopGraphDocument,
  instanceId: string,
  reason: string,
): LoopGraphDocument {
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance?.pendingGithubOp) return doc;
  const pending = instance.pendingGithubOp;
  const journaledUnknown = (pending.dispatchJournal ?? []).some(
    (item) => item.kind === "unknown",
  );
  const httpMayHaveStarted =
    pending.dispatchState === "http_started" ||
    pending.dispatchState === "in_flight" ||
    journaledUnknown;
  if (httpMayHaveStarted) {
    const entry = {
      at: nowIso(),
      kind: "unknown" as const,
      message: `deny-before-HTTP refused to clear http_started/unknown: ${reason}`.slice(
        0,
        500,
      ),
    };
    const kept: LoopInstance = {
      ...instance,
      status: "awaiting_hitl",
      hitlQuestionIds: [`github_dispatch_unknown_${pending.nodeId}`],
      cursorNodeId: pending.nodeId,
      pendingGithubOp: {
        ...pending,
        dispatchState: "http_started",
        dispatchJournal: [...(pending.dispatchJournal ?? []), entry].slice(-20),
      },
      updatedAt: nowIso(),
    };
    return replaceInstance(
      doc,
      pushEvent(kept, {
        type: "awaiting_hitl",
        nodeId: pending.nodeId,
        message: `GitHub dispatch unknown retained (no create#2): ${reason.slice(0, 400)}`,
      }),
    );
  }
  let blocked = invalidatePendingApproval(
    {
      ...instance,
      pendingActionPayload: pending.payload,
      pendingApprovalBinding: pending.approvalBinding,
    },
    reason,
  );
  blocked = {
    ...blocked,
    pendingGithubOp: undefined,
    status: "awaiting_hitl",
    hitlQuestionIds: [`human_approval_${pending.nodeId}`],
    cursorNodeId: pending.nodeId,
  };
  blocked = pushEvent(blocked, {
    type: "approval_stale",
    nodeId: pending.nodeId,
    message: `GitHub dispatch blocked before HTTP: ${reason.slice(0, 400)}`,
  });
  blocked = pushEvent(blocked, {
    type: "awaiting_hitl",
    nodeId: pending.nodeId,
    message: `Re-approve github.${pending.operation} (zero HTTP sent)`,
  });
  return replaceInstance(doc, blocked);
}

/** Mark preparing (token/import window) — no remote side effect yet. */
export function markPendingGithubOpPreparing(
  doc: LoopGraphDocument,
  instanceId: string,
  attemptId: string,
): LoopGraphDocument {
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance?.pendingGithubOp) return doc;
  if (
    instance.pendingGithubOp.dispatchState === "http_started" ||
    instance.pendingGithubOp.dispatchState === "in_flight"
  ) {
    return doc;
  }
  const journal = [
    ...(instance.pendingGithubOp.dispatchJournal ?? []),
    {
      at: nowIso(),
      kind: "preparing" as const,
      message: `Preparing dispatch ${attemptId}`,
    },
  ].slice(-20);
  return replaceInstance(doc, {
    ...instance,
    pendingGithubOp: {
      ...instance.pendingGithubOp,
      dispatchState: "preparing",
      dispatchAttemptId: attemptId,
      dispatchJournal: journal,
    },
    updatedAt: nowIso(),
  });
}

/**
 * Atomic claim immediately before transport/push (crash → lookup, don't blind resend).
 * Legacy alias: markPendingGithubOpInFlight.
 */
export function markPendingGithubOpHttpStarted(
  doc: LoopGraphDocument,
  instanceId: string,
  attemptId: string,
): LoopGraphDocument {
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance?.pendingGithubOp) return doc;
  if (
    instance.pendingGithubOp.dispatchState === "http_started" ||
    instance.pendingGithubOp.dispatchState === "in_flight"
  ) {
    return doc;
  }
  const journal = [
    ...(instance.pendingGithubOp.dispatchJournal ?? []),
    {
      at: nowIso(),
      kind: "http_started" as const,
      message: `HTTP/push claimed ${attemptId}`,
    },
  ].slice(-20);
  return replaceInstance(doc, {
    ...instance,
    pendingGithubOp: {
      ...instance.pendingGithubOp,
      dispatchState: "http_started",
      dispatchAttemptId: attemptId,
      httpAttemptedAt: nowIso(),
      dispatchJournal: journal,
    },
    updatedAt: nowIso(),
  });
}

/** @deprecated Use markPendingGithubOpHttpStarted */
export function markPendingGithubOpInFlight(
  doc: LoopGraphDocument,
  instanceId: string,
  attemptId: string,
): LoopGraphDocument {
  return markPendingGithubOpHttpStarted(doc, instanceId, attemptId);
}

/**
 * Finish a deferred GitHub Action after HTTP returned (or after lookup of an
 * already-created remote). Never erases a successful side effect when evidence
 * drifts post-dispatch — records delivery_stale and keeps the result.
 */
export function completePendingGithubOp(
  doc: LoopGraphDocument,
  instanceId: string,
  result: LoopGithubOperationResult,
  execution?: LoopExecutionHooks,
  options?: { httpCompleted?: boolean; deliveryStale?: boolean },
): LoopGraphDocument {
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance?.pendingGithubOp) return doc;
  const spec = findSpec(doc, instance.specVersion);
  if (!spec) throw new Error(`Spec not found: ${instance.specVersion}`);

  const pending = instance.pendingGithubOp;
  const httpCompleted = options?.httpCompleted === true;
  const actionNode = spec.nodes.find((item) => item.id === pending.nodeId);
  const arch = actionNode ? architectureOf(actionNode) : undefined;

  let deliveryStale = options?.deliveryStale === true;
  if (httpCompleted && pending.approvalBinding && !deliveryStale) {
    const stillValid = isApprovalBindingCurrent({
      binding: pending.approvalBinding,
      instance: {
        ...instance,
        pendingActionPayload: pending.payload,
        pendingApprovalBinding: pending.approvalBinding,
      },
      payload: pending.payload,
      actionNodeId: pending.nodeId,
      ...(arch?.actionIntegration
        ? { actionIntegration: arch.actionIntegration }
        : {}),
      actionOperation: pending.operation,
      ...(execution ? { execution } : {}),
    });
    deliveryStale = !stillValid;
  }

  // Pre-HTTP path must use denyPendingGithubOpBeforeHttp — never wipe a real result.
  if (!httpCompleted && !result.ok) {
    return denyPendingGithubOpBeforeHttp(
      doc,
      instanceId,
      result.message || "GitHub dispatch denied before HTTP",
    );
  }

  if (!result.ok) {
    return failNode(
      doc,
      {
        ...instance,
        pendingGithubOp: undefined,
      },
      pending.nodeId,
      result.message || "GitHub operation failed",
    );
  }

  const resultData = {
    operation: pending.operation,
    ok: true as const,
    ...(result.url ? { url: result.url } : {}),
    ...(typeof result.number === "number" ? { number: result.number } : {}),
    ...(result.refs ? { refs: result.refs } : {}),
    message: result.message,
    ...(deliveryStale ? { deliveryStale: true } : {}),
    ...(pending.idempotencyKey
      ? { idempotencyKey: pending.idempotencyKey }
      : {}),
    ...(pending.approvalBinding?.operationDigest
      ? { operationDigest: pending.approvalBinding.operationDigest }
      : { operationDigest: digestOperationPayload(pending.payload) }),
    ...(pending.approvalBinding?.engineeringBaseline
      ? { engineeringBaseline: pending.approvalBinding.engineeringBaseline }
      : {}),
  };

  // Cancelled/paused mid-flight: audit-append result, clear pending, do not resurrect.
  if (instance.status === "cancelled" || instance.status === "paused") {
    let next = pushArtifact(
      { ...instance, pendingGithubOp: undefined },
      {
        nodeId: pending.nodeId,
        kind: "github_op_result",
        data: { ...resultData, deliveryStale: true },
      },
    );
    next = pushEvent(next, {
      type: "delivery_stale",
      nodeId: pending.nodeId,
      message: `GitHub result audited under ${instance.status} (run not resurrected)`,
    });
    return replaceInstance(doc, {
      ...next,
      status: instance.status,
      pendingGithubOp: undefined,
    });
  }

  let next = pushArtifact(
    { ...instance, pendingGithubOp: undefined },
    {
      nodeId: pending.nodeId,
      kind: "github_op_result",
      data: resultData,
    },
  );
  if (deliveryStale) {
    next = pushEvent(next, {
      type: "delivery_stale",
      nodeId: pending.nodeId,
      message:
        "GitHub side effect retained after post-dispatch evidence drift (do not redo)",
    });
  }
  next = pushEvent(next, {
    type: "node_completed",
    nodeId: pending.nodeId,
    message: `Action github.${pending.operation} completed`,
  });
  return advanceCursor(doc, next, spec, pending.nodeId);
}

function stepImplementNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpec["nodes"][number],
  execution: LoopExecutionHooks | undefined,
): LoopGraphDocument {
  const polling = instance.activeRunId && instance.activeRunNodeId === node.id;
  const bound = buildCoderGoal({ node, instance, specGoal: spec.goal });
  let next = polling
    ? { ...instance, cursorNodeId: node.id }
    : pushEvent({ ...instance, cursorNodeId: node.id }, {
        type: "node_entered",
        nodeId: node.id,
        message: bound.task
          ? `Coder task ${bound.task.id}: ${bound.task.title}`
          : node.goal,
      });

  let run = polling && next.activeRunId
    ? execution?.readRun(next.activeRunId) ?? null
    : null;

  if (!polling) {
    const leaf = execution?.leaf ?? null;
    if (!leaf || !execution) {
      return failNode(doc, next, node.id, LOOP_FILES_NOT_ATTACHED, { spec });
    }
    const frozenBudget = next.runBinding?.budget;
    const budget = assertAgentCallBudget(
      next,
      frozenBudget
        ? {
            maxAgentCalls: frozenBudget.maxAgentCalls,
            maxAgentCallDepth: frozenBudget.maxAgentCallDepth,
          }
        : resolveAgentCallBudgetLimits(spec),
    );
    if (!budget.ok) {
      return failNode(doc, next, node.id, budget.reason, { spec });
    }
    const implementRole: "implement" | "fix" =
      node.role === "fix" || node.repairMode ? "fix" : "implement";
    try {
      run = execution.startAgentRun({
        specNodeId: node.id,
        role: implementRole,
        featureNodeId: leaf.featureNodeId,
        filePath: leaf.filePath,
        goal: bound.goal,
        ...(bound.task ? { taskId: bound.task.id } : {}),
        agentRole: "coder",
        ...(node.agentDefinitionId
          ? { agentDefinitionId: node.agentDefinitionId }
          : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : LOOP_FILES_NOT_ATTACHED;
      return failNode(doc, next, node.id, message, { spec });
    }
    const priorIds = activeRunIdsOf(next);
    next = recordAgentCallStart({
      ...next,
      activeRunId: run.runId,
      activeRunNodeId: node.id,
      featureNodeId: leaf.featureNodeId,
      activeRunIds: [...new Set([...priorIds, run.runId])],
    });
  }

  if (!run || !next.activeRunId) {
    return failNode(doc, next, node.id, LOOP_FILES_NOT_ATTACHED, { spec });
  }

  if (run.status === "queued" || run.status === "running") {
    const runningDoc = replaceInstanceWithCheckpoint(doc, {
      ...next,
      status: "running",
    });
    return kickConcurrentReadyRuns(
      runningDoc,
      runningDoc.instances.find((item) => item.id === next.id) ?? {
        ...next,
        status: "running",
      },
      spec,
      execution,
    );
  }
  if (run.status === "interrupted") {
    return replaceInstance(doc, pushEvent(
      { ...next, status: "paused" },
      {
        type: "paused",
        nodeId: node.id,
        message: `Agent run ${run.runId} interrupted`,
        agentRunId: run.runId,
      },
    ));
  }
  if (run.status === "awaiting_review") {
    return replaceInstance(doc, { ...next, status: "awaiting_review" });
  }
  if (run.status === "complete" && run.applySucceeded) {
    const leafPath = execution?.leaf?.filePath ?? "unknown";
    const priorScope = accumulateDeliveryScope(next);
    const writeScope = bound.task?.writeScope ?? [];
    const deliveryFiles = [
      ...new Set(
        [
          ...(leafPath !== "unknown" ? [leafPath] : []),
          ...writeScope,
          ...priorScope.files,
        ].filter(Boolean),
      ),
    ].slice(0, 200);
    let contentDigest: string | undefined;
    let fileDigests: Record<string, string> | undefined;
    if (deliveryFiles.length > 0 && execution?.digestWorkspacePaths) {
      const digested = execution.digestWorkspacePaths(deliveryFiles, {
        deletedPaths: priorScope.deletedFiles,
      });
      if (
        digested.missing.length === 0 &&
        digested.unreadable.length === 0 &&
        (digested.undeleted?.length ?? 0) === 0
      ) {
        fileDigests = digested.digests;
        const withTombs = {
          ...digested.digests,
          ...Object.fromEntries(
            (digested.tombstones ?? []).map((path) => [
              `tombstone:${path}`,
              "deleted",
            ]),
          ),
        };
        contentDigest = combineFileDigests(withTombs);
      }
    }
    const changeSet = buildChangeSetFromRun({
      filePath: leafPath !== "unknown" ? leafPath : deliveryFiles[0] ?? "unknown",
      goal: bound.goal,
      agentRunId: run.runId,
      task: bound.task,
      additionalFiles: deliveryFiles.filter((path) => path !== leafPath),
      ...(priorScope.deletedFiles.length
        ? { deletedFiles: priorScope.deletedFiles }
        : {}),
      ...(contentDigest ? { contentDigest } : {}),
      ...(fileDigests ? { fileDigests } : {}),
      ...(run.unifiedDiff ? { unifiedDiff: run.unifiedDiff } : {}),
    });
    next = pushArtifact(next, {
      nodeId: node.id,
      kind: "change_set",
      data: changeSet,
    });
    if (bound.task) {
      next = {
        ...next,
        attemptCounts: {
          ...next.attemptCounts,
          [bound.task.id]: (next.attemptCounts[bound.task.id] ?? 0) + 1,
        },
      };
    }
    next = recordAgentCallEnd(next);
    next = pushEvent(next, {
      type: "node_completed",
      nodeId: node.id,
      message: bound.task
        ? `Coder applied ${bound.task.id} via ${run.runId}`
        : `Agent run ${run.runId} applied`,
      agentRunId: run.runId,
    });
    return advanceCursor(doc, next, spec, node.id);
  }

  return failNode(
    doc,
    recordAgentCallEnd(next),
    node.id,
    run.status === "cancelled"
      ? `Agent run ${run.runId} cancelled`
      : `Agent run ${run.runId} did not apply`,
    { spec },
  );
}

function stepVerifyNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode | string,
  execution: LoopExecutionHooks | undefined,
): LoopGraphDocument {
  const nodeId = typeof node === "string" ? node : node.id;
  const specNode =
    typeof node === "string"
      ? spec.nodes.find((item) => item.id === node)
      : node;

  const last = instance.events.at(-1);
  const entering =
    !(last?.type === "node_entered" && last.nodeId === nodeId);
  let working =
    entering && !instance.verificationCodeDigest
      ? pushEvent(
          { ...instance, cursorNodeId: nodeId },
          {
            type: "node_entered",
            nodeId,
            message: specNode?.goal ?? "Verify",
            ...(instance.activeRunId
              ? { agentRunId: instance.activeRunId }
              : {}),
          },
        )
      : { ...instance, cursorNodeId: nodeId };

  // Capture live delivery-scope digest once per verify attempt (not ChangeSet self-stamp).
  // Do not re-snapshot on HITL re-entry — that would let new code + old evidence stamp.
  if (!working.verificationCodeDigest) {
    const scope = accumulateDeliveryScope(working);
    if (scope.parseFailed || scope.emptyIllegal) {
      const next = pushEvent(
        {
          ...working,
          status: "awaiting_hitl",
          hitlQuestionIds: ["verification_not_run"],
        },
        {
          type: "awaiting_hitl",
          nodeId,
          message: "Verification blocked: illegal/empty ChangeSet delivery scope",
        },
      );
      return replaceInstance(doc, next);
    }
    const hasDeliveryClaim =
      scope.files.length > 0 || scope.deletedFiles.length > 0;
    if (hasDeliveryClaim && !execution?.digestWorkspacePaths) {
      const next = pushEvent(
        {
          ...working,
          status: "awaiting_hitl",
          hitlQuestionIds: ["verification_not_run"],
          verificationCodeDigest: undefined,
        },
        {
          type: "awaiting_hitl",
          nodeId,
          message:
            "Verification cannot stamp evidence without workspace digester (fail-closed)",
        },
      );
      return replaceInstance(doc, next);
    }
    if (!hasDeliveryClaim) {
      // No ChangeSet delivery claim — bind EMPTY only (cannot invent file coverage).
      working = {
        ...working,
        verificationCodeDigest: combineFileDigests({}),
      };
    } else {
      const digested = execution!.digestWorkspacePaths!(scope.files, {
        deletedPaths: scope.deletedFiles,
      });
      if (
        digested.missing.length > 0 ||
        digested.unreadable.length > 0 ||
        (digested.undeleted?.length ?? 0) > 0
      ) {
        const next = pushEvent(
          {
            ...working,
            status: "awaiting_hitl",
            hitlQuestionIds: ["verification_not_run"],
          },
          {
            type: "awaiting_hitl",
            nodeId,
            message: `Verification blocked: delivery scope unreadable/missing (${[
              ...digested.missing,
              ...digested.unreadable,
              ...(digested.undeleted ?? []),
            ]
              .slice(0, 6)
              .join(", ")})`,
          },
        );
        return replaceInstance(doc, next);
      }
      const withTombs = {
        ...digested.digests,
        ...Object.fromEntries(
          (digested.tombstones ?? []).map((path) => [
            `tombstone:${path}`,
            "deleted",
          ]),
        ),
      };
      working = {
        ...working,
        verificationCodeDigest: combineFileDigests(withTombs),
      };
    }
    // New verification session — do not inherit a prior evidence id.
    working = { ...working, verificationEvidenceId: undefined };
    // Kick read-only configured tests against the bound AgentRun (no writable agent).
    if (working.activeRunId && execution?.requestVerification) {
      try {
        execution.requestVerification(working.activeRunId);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Verification request failed";
        const next = pushEvent(
          {
            ...working,
            status: "awaiting_hitl",
            hitlQuestionIds: ["verification_not_run"],
          },
          {
            type: "awaiting_hitl",
            nodeId,
            message: `Verification could not start: ${message.slice(0, 300)}`,
          },
        );
        return replaceInstance(doc, next);
      }
    }
  }

  if (!working.activeRunId) {
    const next = pushEvent(
      {
        ...working,
        status: "awaiting_hitl",
        hitlQuestionIds: ["verification_not_run"],
      },
      {
        type: "awaiting_hitl",
        nodeId,
        message: LOOP_VERIFICATION_NOT_RUN,
      },
    );
    return replaceInstance(doc, next);
  }

  const runView = execution?.readRun(working.activeRunId) ?? null;
  // Side-effect / implement run still in flight: never stamp early evidence.
  if (
    !runView ||
    runView.status === "queued" ||
    runView.status === "running" ||
    runView.status === "awaiting_review"
  ) {
    return replaceInstance(doc, {
      ...working,
      status: "running",
      updatedAt: nowIso(),
    });
  }

  const evidence = execution?.readEvidence(working.activeRunId) ?? null;
  if (
    !evidence ||
    evidence.status === "not_run" ||
    evidence.runId !== working.activeRunId
  ) {
    const next = pushEvent(
      {
        ...working,
        status: "awaiting_hitl",
        hitlQuestionIds: ["verification_not_run"],
        // Do not clear verificationCodeDigest — still required when evidence arrives.
      },
      {
        type: "awaiting_hitl",
        nodeId,
        message: LOOP_VERIFICATION_NOT_RUN,
        ...(evidence ? { evidenceId: evidence.id } : {}),
      },
    );
    return replaceInstance(doc, next);
  }

  // Bind evidence identity when first accepted; refuse stamping a different cache.
  if (!working.verificationEvidenceId) {
    // Re-check live digest at evidence-accept time (not only at enter/end).
    const midScope = accumulateDeliveryScope(working);
    const midHasClaim =
      midScope.files.length > 0 || midScope.deletedFiles.length > 0;
    let midDigest = combineFileDigests({});
    if (midHasClaim && execution?.digestWorkspacePaths) {
      const mid = execution.digestWorkspacePaths(midScope.files, {
        deletedPaths: midScope.deletedFiles,
      });
      if (
        mid.missing.length > 0 ||
        mid.unreadable.length > 0 ||
        (mid.undeleted?.length ?? 0) > 0
      ) {
        const next = pushEvent(
          {
            ...working,
            status: "awaiting_hitl",
            hitlQuestionIds: ["verification_not_run"],
            verificationCodeDigest: undefined,
            verificationEvidenceId: undefined,
          },
          {
            type: "awaiting_hitl",
            nodeId,
            message:
              "Verification blocked: delivery scope changed before evidence accept",
          },
        );
        return replaceInstance(doc, next);
      }
      midDigest = combineFileDigests({
        ...mid.digests,
        ...Object.fromEntries(
          (mid.tombstones ?? []).map((path) => [`tombstone:${path}`, "deleted"]),
        ),
      });
    }
    if (
      working.verificationCodeDigest &&
      working.verificationCodeDigest !== midDigest
    ) {
      const next = pushEvent(
        {
          ...working,
          status: "awaiting_hitl",
          hitlQuestionIds: ["verification_not_run"],
          verificationCodeDigest: undefined,
          verificationEvidenceId: undefined,
        },
        {
          type: "awaiting_hitl",
          nodeId,
          message:
            "Code changed before evidence accept; refuse to stamp cached/old evidence with new digest",
          evidenceId: evidence.id,
        },
      );
      return replaceInstance(doc, next);
    }
    working = {
      ...working,
      verificationEvidenceId: evidence.id,
    };
  } else if (working.verificationEvidenceId !== evidence.id) {
    const next = pushEvent(
      {
        ...working,
        status: "awaiting_hitl",
        hitlQuestionIds: ["verification_not_run"],
        verificationCodeDigest: undefined,
        verificationEvidenceId: undefined,
      },
      {
        type: "awaiting_hitl",
        nodeId,
        message: `Evidence id changed during verification (${working.verificationEvidenceId} → ${evidence.id}); re-run tests`,
        evidenceId: evidence.id,
      },
    );
    return replaceInstance(doc, next);
  }

  // End-of-verify: re-digest and only stamp if snapshot unchanged.
  const endScope = accumulateDeliveryScope(working);
  const endHasClaim =
    endScope.files.length > 0 || endScope.deletedFiles.length > 0;
  let endDigest = combineFileDigests({});
  if (endHasClaim) {
    const endDigested = execution?.digestWorkspacePaths
      ? execution.digestWorkspacePaths(endScope.files, {
          deletedPaths: endScope.deletedFiles,
        })
      : null;
    if (
      !endDigested ||
      endDigested.missing.length > 0 ||
      endDigested.unreadable.length > 0 ||
      (endDigested.undeleted?.length ?? 0) > 0
    ) {
      const next = pushEvent(
        {
          ...working,
          status: "awaiting_hitl",
          hitlQuestionIds: ["verification_not_run"],
          verificationCodeDigest: undefined,
        },
        {
          type: "awaiting_hitl",
          nodeId,
          message:
            "Verification end digest failed; refuse to stamp stale/cached evidence",
        },
      );
      return replaceInstance(doc, next);
    }
    endDigest = combineFileDigests({
      ...endDigested.digests,
      ...Object.fromEntries(
        (endDigested.tombstones ?? []).map((path) => [
          `tombstone:${path}`,
          "deleted",
        ]),
      ),
    });
  }
  if (
    !working.verificationCodeDigest ||
    working.verificationCodeDigest !== endDigest
  ) {
    const next = pushEvent(
      {
        ...working,
        status: "awaiting_hitl",
        hitlQuestionIds: ["verification_not_run"],
        verificationCodeDigest: undefined,
      },
      {
        type: "awaiting_hitl",
        nodeId,
        message:
          "Code changed during verification (start/end snapshot mismatch); re-run tests",
      },
    );
    return replaceInstance(doc, next);
  }

  const report = evidenceToTestReport(
    evidence,
    "configured-test",
    endHasClaim ? endDigest : undefined,
  );
  if (report) {
    working = pushArtifact(working, {
      nodeId,
      kind: "test_report",
      data: report,
    });
  }

  if (evidence.status === "failed" && spec.retryPolicy.onFailure === "replan") {
    const proposed = attachPendingSpecDraft(
      doc,
      working,
      spec,
      "Verification failed and retry policy is replan. Approve a new spec version before the instance can follow different steps.",
    );
    return replaceInstance(proposed.doc, proposed.instance);
  }

  if (evidence.status === "failed") {
    // Feature Dev style: Test → Condition. Complete with failed report and let Condition branch.
    const nextDependsId = dependsOutgoingMap(spec).get(nodeId);
    const nextDependsNode = nextDependsId
      ? spec.nodes.find((item) => item.id === nextDependsId)
      : undefined;
    if (
      nextDependsNode &&
      architectureOf(nextDependsNode).type === "logic" &&
      architectureOf(nextDependsNode).logicKind === "condition"
    ) {
      const next = pushEvent(working, {
        type: "node_completed",
        nodeId,
        message: "Verification failed (handed to Condition)",
        evidenceId: evidence.id,
        ...(working.activeRunId ? { agentRunId: working.activeRunId } : {}),
      });
      return advanceCursor(doc, next, spec, nodeId);
    }

    // Direct conditional fail edges from this node (rare).
    const failBranch = matchConditionBranch(
      "failed",
      conditionalOutgoing(spec, nodeId),
    );
    if (failBranch) {
      const attempts = (working.attemptCounts[failBranch.to] ?? 0) + 1;
      const max = effectiveMaxIterations(spec, failBranch.to);
      if (attempts > max) {
        const next = pushEvent(
          {
            ...working,
            status: "awaiting_hitl",
            round: working.round + 1,
            attemptCounts: {
              ...working.attemptCounts,
              [failBranch.to]: attempts,
            },
            hitlQuestionIds: ["stop_policy"],
          },
          {
            type: "awaiting_hitl",
            nodeId,
            message: `Retry budget reached (${max})`,
            evidenceId: evidence.id,
          },
        );
        return replaceInstance(doc, next);
      }
      const next = pushEvent(
        {
          ...working,
          round: working.round + 1,
          cursorNodeId: failBranch.to,
          activeRunId: undefined,
          activeRunNodeId: undefined,
          verificationCodeDigest: undefined,
          verificationEvidenceId: undefined,
          attemptCounts: {
            ...working.attemptCounts,
            [failBranch.to]: attempts,
          },
        },
        {
          type: "feedback_taken",
          nodeId,
          message: `Retry via condition fail → ${failBranch.to} (attempt ${attempts})`,
          evidenceId: evidence.id,
        },
      );
      return replaceInstance(doc, next);
    }

    const fb = feedbackTarget(spec);
    const round = working.round + 1;
    if (!fb || fb.from !== nodeId) {
      return failNode(doc, working, nodeId, "Verification failed without feedback edge", {
        spec,
      });
    }
    const target = spec.nodes.find((item) => item.id === fb.to);
    if (!target || !isImplementRole(target.role)) {
      return failNode(doc, working, nodeId, "Feedback target is not an implement node", {
        spec,
      });
    }
    const attempts = (working.attemptCounts[fb.to] ?? 0) + 1;
    const max = effectiveMaxIterations(spec, fb.to);
    // Frozen budget at start wins over live Spec edits (consumption, not serialize-only).
    const frozenMaxRounds = working.runBinding?.budget?.maxRounds;
    const maxRounds = frozenMaxRounds ?? spec.stopPolicy.maxRounds;
    if (round > maxRounds || attempts > max) {
      const next = pushEvent(
        {
          ...working,
          status: "awaiting_hitl",
          round,
          verificationCodeDigest: undefined,
          verificationEvidenceId: undefined,
          attemptCounts: {
            ...working.attemptCounts,
            [fb.to]: attempts,
          },
          hitlQuestionIds: ["stop_policy"],
        },
        {
          type: "awaiting_hitl",
          nodeId,
          message: `Stop policy reached (${Math.min(maxRounds, max)} rounds)`,
          evidenceId: evidence.id,
        },
      );
      return replaceInstance(doc, next);
    }
    const next = pushEvent(
      {
        ...working,
        round,
        cursorNodeId: fb.to,
        activeRunId: undefined,
        activeRunNodeId: undefined,
        verificationCodeDigest: undefined,
        verificationEvidenceId: undefined,
        attemptCounts: {
          ...working.attemptCounts,
          [fb.to]: attempts,
        },
      },
      {
        type: "feedback_taken",
        nodeId,
        message: `Retry via feedback to ${fb.to} (round ${round})`,
        evidenceId: evidence.id,
      },
    );
    return replaceInstance(doc, next);
  }

  const next = pushEvent(
    {
      ...working,
      verificationCodeDigest: undefined,
      verificationEvidenceId: undefined,
    },
    {
    type: "node_completed",
    nodeId,
    message: "Verification passed",
    evidenceId: evidence.id,
    ...(working.activeRunId ? { agentRunId: working.activeRunId } : {}),
  });
  return advanceCursor(doc, next, spec, nodeId);
}

function advanceCursor(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  cursor: string,
): LoopGraphDocument {
  let next = upsertNodeRecord(instance, cursor, { status: "succeeded" });
  const picked = pickNextCursor(spec, next, cursor);
  next = picked.instance;
  if (!picked.cursor) {
    next = pushEvent(
      {
        ...next,
        status: "complete",
        completedAt: nowIso(),
        cursorNodeId: cursor,
      },
      { type: "completed", message: "Loop complete" },
    );
    return replaceInstanceWithCheckpoint(doc, next, { emitEvent: true });
  }
  next = upsertNodeRecord(next, picked.cursor, { status: "ready" });
  // Keep activeRunId so verify / evidence steppers can read the just-finished run.
  return replaceInstanceWithCheckpoint(doc, {
    ...next,
    cursorNodeId: picked.cursor,
    updatedAt: nowIso(),
  });
}

/**
 * GC-7.1: when multi_run is enabled, attempt to start ready sibling implement nodes
 * while one AgentRun is already in flight. Shared leaf write scope → blocked + HITL.
 */
function kickConcurrentReadyRuns(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  execution: LoopExecutionHooks | undefined,
): LoopGraphDocument {
  if (!execution?.allowConcurrentLoopRuns) return doc;
  if (instance.status !== "running") return doc;
  const inFlight = activeRunIdsOf(instance);
  if (inFlight.length === 0) return doc;

  const readySiblings = spec.nodes.filter((node) => {
    if (recordStatus(instance, node.id) !== "ready") return false;
    if (node.id === instance.cursorNodeId || node.id === instance.activeRunNodeId) {
      return false;
    }
    return isImplementRole(node.role) || isAgentNode(node);
  });
  if (readySiblings.length === 0) return doc;

  // Shared worktree leaf: starting a second writer is unsafe.
  if (execution.leaf) {
    let next = pushEvent(
      {
        ...instance,
        status: "blocked",
        hitlQuestionIds: ["write_conflict"],
        activeRunIds: inFlight,
      },
      {
        type: "awaiting_hitl",
        nodeId: readySiblings[0]!.id,
        message:
          "Parallel multi_run write conflict on shared leaf — resolve HITL to continue serially",
      },
    );
    next = {
      ...next,
      status: "awaiting_hitl",
    };
    return replaceInstanceWithCheckpoint(doc, next, { emitEvent: true });
  }

  // No leaf bound yet: track sibling as ready-but-blocked for observability.
  return replaceInstanceWithCheckpoint(
    doc,
    {
      ...instance,
      activeRunIds: inFlight,
    },
  );
}

export type StartLoopInstanceOptions = {
  specVersion?: string;
  execution?: LoopExecutionHooks;
  launch?: LoopLaunch;
  /** When restoring after crash: reuse checkpoint fields instead of fresh cursor. */
  restoreCheckpoint?: boolean;
  /**
   * Project-workflow binding snapshot — frozen on the Instance; editing
   * Intent/Spec must not rewrite it after start.
   */
  runBinding?: LoopInstance["runBinding"];
  /**
   * When true, refuse start if preflight reports blockers.
   * LocalApi project starts pass true; unit helpers may omit (default false).
   */
  requirePreflight?: boolean;
  materials?: import("../contracts/loop-task-materials.js").LoopTaskMaterial[];
  branch?: string;
  projectId?: string;
};

export function startLoopInstance(
  workspaceRoot: string,
  loopId: string,
  specVersionOrOptions?: string | StartLoopInstanceOptions,
  executionArg?: LoopExecutionHooks,
): LoopGraphDocument {
  const options: StartLoopInstanceOptions =
    typeof specVersionOrOptions === "string" || specVersionOrOptions === undefined
      ? {
          ...(specVersionOrOptions ? { specVersion: specVersionOrOptions } : {}),
          ...(executionArg ? { execution: executionArg } : {}),
          launch: { kind: "manual" },
        }
      : {
          launch: { kind: "manual" },
          ...specVersionOrOptions,
        };

  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const spec =
    (options.specVersion
      ? doc.approvedSpecs.find((item) => item.version === options.specVersion)
      : doc.approvedSpecs[doc.approvedSpecs.length - 1]) ?? undefined;
  if (!spec) throw new Error("No approved Loop Spec to run");
  const issues = validateLoopSpecTopology(spec);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join("; "));
  }

  const launchKind =
    options.launch?.kind === "event"
      ? "event"
      : options.launch?.kind === "params"
        ? "params"
        : "manual";
  // Production project starts always freeze RunBinding via shared create+preflight.
  // Unit helpers may omit projectId (no binding); never skip binding when projectId set
  // without preflight — that would sneak past permission/context gates.
  if (options.projectId) {
    assertLaunchContextForBinding({
      projectId: options.projectId,
      requirePreflight: options.requirePreflight === true,
      launchKind,
    });
  }

  let preflightNotes: string[] | undefined;
  if (options.requirePreflight === true) {
    const preflight = preflightLoopRunStart({
      document: doc,
      specVersion: spec.version,
      ...(options.branch ? { branch: options.branch } : {}),
      ...(options.materials ? { materials: options.materials } : {}),
    });
    if (!preflight.canStart) {
      const blockers = preflight.items
        .filter((item) => item.severity === "blocker")
        .map((item) => item.message)
        .join("; ");
      throw new Error(`Loop preflight blocked start: ${blockers}`);
    }
    preflightNotes = preflight.items
      .map((item) => `[${item.severity}] ${item.code}: ${item.message}`)
      .slice(0, 40);
  }

  validateLaunchParams(spec, options.launch?.params);

  const idempotencyKey = options.launch?.idempotencyKey;
  if (idempotencyKey) {
    const existingByKey = doc.instances.find(
      (item) => item.launch?.idempotencyKey === idempotencyKey,
    );
    if (existingByKey) {
      return doc;
    }
  }

  const active = doc.instances.find((item) =>
    item.status === "queued" ||
    item.status === "running" ||
    item.status === "paused" ||
    item.status === "awaiting_hitl" ||
    item.status === "awaiting_review" ||
    item.status === "blocked",
  );
  if (active) {
    throw new Error("A loop instance is already active");
  }

  const startedAt = nowIso();
  const entry = entryNodeId(spec);
  const execution = options.execution;
  const pathFingerprint = fingerprintContext({
    specVersion: spec.version,
    ...(execution?.leaf?.featureNodeId
      ? { featureNodeId: execution.leaf.featureNodeId }
      : {}),
    ...(execution?.leaf?.filePath ? { leafPath: execution.leaf.filePath } : {}),
  });
  const runBinding =
    options.runBinding ??
    (options.projectId
      ? buildRunBindingSnapshot({
          projectId: options.projectId,
          workspaceRoot,
          document: doc,
          spec,
          createdAt: startedAt,
          launchKind,
          ...(options.materials ? { materials: options.materials } : {}),
          ...(options.branch ? { declaredBranch: options.branch } : {}),
          ...(preflightNotes ? { preflightNotes } : {}),
        })
      : undefined);
  // Production starts: incomplete content digests must fail closed (not path-hash masquerade).
  if (runBinding && options.requirePreflight === true) {
    assertCodeDigestComplete(runBinding);
  }

  let instance: LoopInstance = {
    id: `inst_${randomUUID()}`,
    specVersion: spec.version,
    status: "queued",
    cursorNodeId: entry,
    round: 0,
    attemptCounts: {},
    nodeRecords: spec.nodes.map((node) => ({
      nodeId: node.id,
      status: node.id === entry ? ("ready" as const) : ("pending" as const),
      updatedAt: startedAt,
    })),
    freshness: {
      status: "fresh",
      baselineId: pathFingerprint,
      pathFingerprint,
      checkedAt: startedAt,
    },
    budgetUsage: { tokens: 0, wallClockMs: 0, retries: 0 },
    ...(options.launch ? { launch: options.launch } : {}),
    ...(runBinding ? { runBinding } : {}),
    events: [],
    startedAt,
    updatedAt: startedAt,
  };
  instance = upsertNodeRecord(instance, entry, { status: "ready" });
  instance = withCheckpoint(instance);

  let nextDoc: LoopGraphDocument = {
    ...doc,
    instances: [...doc.instances, instance],
  };
  nextDoc = stepLoopInstance(nextDoc, instance.id, execution !== undefined ? { execution } : {});
  return upsertLoopGraph(workspaceRoot, nextDoc);
}

export function startLoopInstanceWithParams(
  workspaceRoot: string,
  loopId: string,
  params: Record<string, unknown>,
  options?: Omit<StartLoopInstanceOptions, "launch"> & {
    idempotencyKey?: string;
  },
): LoopGraphDocument {
  return startLoopInstance(workspaceRoot, loopId, {
    ...options,
    launch: {
      kind: "params",
      params,
      ...(options?.idempotencyKey
        ? { idempotencyKey: options.idempotencyKey }
        : {}),
    },
  });
}

export function startLoopInstanceFromEvent(
  workspaceRoot: string,
  loopId: string,
  event: { eventId: string; eventType: string; payload?: Record<string, unknown> },
  options?: Omit<StartLoopInstanceOptions, "launch">,
): LoopGraphDocument {
  const dedupeKey = `event:${event.eventType}:${event.eventId}`;
  return startLoopInstance(workspaceRoot, loopId, {
    ...options,
    launch: {
      kind: "event",
      eventId: event.eventId,
      eventType: event.eventType,
      ...(event.payload ? { params: event.payload } : {}),
      idempotencyKey: dedupeKey,
    },
  });
}

export function restoreLoopInstanceFromCheckpoint(
  workspaceRoot: string,
  loopId: string,
  instanceId: string,
  execution?: LoopExecutionHooks,
): LoopGraphDocument {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance) throw new Error(`Instance not found: ${instanceId}`);
  const checkpoint = instance.checkpoint;
  if (!checkpoint) throw new Error(`No checkpoint on instance ${instanceId}`);

  let restored: LoopInstance = {
    ...instance,
    status:
      checkpoint.status === "complete" || checkpoint.status === "cancelled"
        ? "running"
        : checkpoint.status === "error"
          ? "running"
          : checkpoint.status,
    cursorNodeId: checkpoint.cursorNodeId,
    round: checkpoint.round,
    attemptCounts: { ...checkpoint.attemptCounts },
    ...(checkpoint.loopIterations
      ? { loopIterations: { ...checkpoint.loopIterations } }
      : {}),
    ...(checkpoint.nodeRecords
      ? { nodeRecords: checkpoint.nodeRecords.map((item) => ({ ...item })) }
      : {}),
    ...(checkpoint.activeRunId ? { activeRunId: checkpoint.activeRunId } : {}),
    ...(checkpoint.activeRunNodeId
      ? { activeRunNodeId: checkpoint.activeRunNodeId }
      : {}),
    ...(checkpoint.activeRunIds ? { activeRunIds: [...checkpoint.activeRunIds] } : {}),
    ...(checkpoint.hitlQuestionIds
      ? { hitlQuestionIds: [...checkpoint.hitlQuestionIds] }
      : { hitlQuestionIds: [] }),
    errorMessage: undefined,
    completedAt: undefined,
    updatedAt: nowIso(),
  };
  restored = pushEvent(restored, {
    type: "message",
    message: `Restored from checkpoint saved at ${checkpoint.savedAt}`,
  });
  let nextDoc = replaceInstance(doc, restored);
  if (restored.status === "paused") {
    return upsertLoopGraph(workspaceRoot, nextDoc);
  }
  if (restored.status === "awaiting_hitl" || restored.status === "awaiting_review") {
    return upsertLoopGraph(workspaceRoot, nextDoc);
  }
  nextDoc = stepLoopInstance(
    nextDoc,
    instanceId,
    execution !== undefined ? { execution } : {},
  );
  return upsertLoopGraph(workspaceRoot, nextDoc);
}

/**
 * A run in the history list. The optional fields are left out when empty (not set to undefined), which is
 * how the API and its clients declare them.
 */
export type LoopRunHistoryItem = Pick<LoopInstance, "id" | "status" | "specVersion" | "startedAt" | "round"> & {
  completedAt?: string;
  launch?: NonNullable<LoopInstance["launch"]>;
  errorMessage?: string;
};

export function listLoopRunHistory(
  workspaceRoot: string,
  loopId: string,
): LoopRunHistoryItem[] {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  return [...doc.instances]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((item) => ({
      id: item.id,
      status: item.status,
      specVersion: item.specVersion,
      startedAt: item.startedAt,
      ...(item.completedAt ? { completedAt: item.completedAt } : {}),
      round: item.round,
      ...(item.launch ? { launch: item.launch } : {}),
      ...(item.errorMessage ? { errorMessage: item.errorMessage } : {}),
    }));
}

/** GC-6.3 weak Iterate: copy current draft from a finished instance's approved spec graphRevision cue. */
export function deriveDraftFromInstance(
  workspaceRoot: string,
  loopId: string,
  instanceId: string,
): LoopGraphDocument {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance) throw new Error(`Instance not found: ${instanceId}`);
  const spec = findSpec(doc, instance.specVersion);
  if (!spec) throw new Error(`Spec not found: ${instance.specVersion}`);

  const now = nowIso();
  const nextDraft = {
    ...doc.draft,
    revision: doc.draft.revision + 1,
    graphPrompt:
      `${doc.draft.graphPrompt}\n\n[Derived from run ${instance.id} · ${instance.status}]`.slice(
        0,
        4000,
      ),
  };
  return upsertLoopGraph(workspaceRoot, {
    ...doc,
    draft: nextDraft,
    updatedAt: now,
  });
}

function activeRunIdsOf(instance: LoopInstance): string[] {
  const ids = new Set<string>();
  if (instance.activeRunId) ids.add(instance.activeRunId);
  for (const id of instance.activeRunIds ?? []) ids.add(id);
  return [...ids];
}

export function pauseLoopInstance(
  workspaceRoot: string,
  loopId: string,
  instanceId: string,
  execution?: LoopExecutionHooks,
): LoopGraphDocument {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance) throw new Error(`Instance not found: ${instanceId}`);
  if (
    instance.status !== "running" &&
    instance.status !== "queued" &&
    instance.status !== "awaiting_review" &&
    instance.status !== "awaiting_hitl"
  ) {
    return doc;
  }
  for (const runId of activeRunIdsOf(instance)) {
    try {
      execution?.pauseAgentRun?.(runId);
    } catch {
      // Pause should still mark the Loop instance even if a run hook fails.
    }
  }
  let next = instance;
  if (instance.cursorNodeId) {
    next = upsertNodeRecord(next, instance.cursorNodeId, { status: "waiting" });
  }
  next = pushEvent({ ...next, status: "paused" }, {
    type: "paused",
    message: "Paused by user",
  });
  return upsertLoopGraph(
    workspaceRoot,
    replaceInstanceWithCheckpoint(doc, next, { emitEvent: true }),
  );
}

export function cancelLoopInstance(
  workspaceRoot: string,
  loopId: string,
  instanceId: string,
  execution?: LoopExecutionHooks,
): LoopGraphDocument {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance) throw new Error(`Instance not found: ${instanceId}`);
  if (
    instance.status === "complete" ||
    instance.status === "cancelled" ||
    instance.status === "error"
  ) {
    return doc;
  }
  for (const runId of activeRunIdsOf(instance)) {
    try {
      execution?.cancelAgentRun?.(runId);
    } catch {
      // Cancel should still mark the Loop instance even if a run hook fails.
    }
  }
  let next = instance;
  if (instance.cursorNodeId) {
    next = upsertNodeRecord(next, instance.cursorNodeId, { status: "cancelled" });
  }
  // Unwind agent-call depth on cancel so nested budget cannot leak across runs.
  let cancelled = next;
  const depth = cancelled.budgetUsage?.agentCallDepth ?? 0;
  for (let i = 0; i < depth; i += 1) {
    cancelled = recordAgentCallEnd(cancelled);
  }
  cancelled = pushEvent(
    {
      ...cancelled,
      status: "cancelled",
      completedAt: nowIso(),
      activeRunId: undefined,
      activeRunNodeId: undefined,
      activeRunIds: undefined,
      hitlQuestionIds: [],
    },
    { type: "cancelled", message: "Cancelled by user" },
  );
  return upsertLoopGraph(workspaceRoot, replaceInstance(doc, cancelled));
}

export function resumeLoopInstance(
  workspaceRoot: string,
  loopId: string,
  instanceId: string,
  execution?: LoopExecutionHooks,
): LoopGraphDocument {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance) throw new Error(`Instance not found: ${instanceId}`);
  if (instance.status !== "paused") return doc;

  // GC-4.3: unknown in-flight side effects → blocked (do not blind-continue).
  for (const runId of activeRunIdsOf(instance)) {
    const view = execution?.readRun(runId) ?? null;
    if (!view) {
      const blocked = pushEvent(
        {
          ...instance,
          status: "blocked",
          hitlQuestionIds: ["unknown_side_effects"],
        },
        {
          type: "awaiting_hitl",
          message: `Cannot safely resume — AgentRun ${runId} is missing from runtime`,
        },
      );
      return upsertLoopGraph(
        workspaceRoot,
        replaceInstanceWithCheckpoint(
          doc,
          { ...blocked, status: "awaiting_hitl" },
          { emitEvent: true },
        ),
      );
    }
  }

  for (const runId of activeRunIdsOf(instance)) {
    try {
      execution?.continueAgentRun?.(runId);
    } catch {
      // Resume continues Loop stepping even if harness continue fails.
    }
  }
  let next = instance;
  if (instance.cursorNodeId) {
    next = upsertNodeRecord(next, instance.cursorNodeId, { status: "ready" });
  }
  next = pushEvent({ ...next, status: "running" }, {
    type: "resumed",
    message: "Resumed by user",
  });
  next = stampCheckpoint(next, { emitEvent: true });
  let nextDoc = replaceInstance(doc, next);
  nextDoc = stepLoopInstance(nextDoc, instanceId, execution !== undefined ? { execution } : {});
  return upsertLoopGraph(workspaceRoot, nextDoc);
}

export function resolveLoopHitl(
  workspaceRoot: string,
  loopId: string,
  instanceId: string,
  answers: LoopHitlAnswer[],
  execution?: LoopExecutionHooks,
): LoopGraphDocument {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance) throw new Error(`Instance not found: ${instanceId}`);
  if (instance.status !== "awaiting_hitl") return doc;

  const spec = findSpec(doc, instance.specVersion);
  if (!spec) throw new Error(`Spec not found: ${instance.specVersion}`);

  const summary = answers.map((item) => `${item.questionId}=${item.answer}`).join("; ");
  let next = pushEvent(
    {
      ...instance,
      status: "running",
      hitlQuestionIds: [],
    },
    {
      type: "hitl_resolved",
      nodeId: instance.cursorNodeId ?? undefined,
      message: summary || "HITL resolved",
    },
  );

  const humanGateQuestions = (instance.hitlQuestionIds ?? []).filter(
    (id) => id.startsWith("human_") || id.startsWith("decide_"),
  );
  // GC-3.4: policy/system HITL also gets a HumanDecision (human_* still recorded below).
  if (humanGateQuestions.length === 0) {
    next = pushArtifact(next, {
      nodeId: instance.cursorNodeId ?? "loop",
      kind: "human_decision",
      data: {
        mode: "gate",
        questionIds: instance.hitlQuestionIds ?? [],
        answers: answers.map((item) => ({
          questionId: item.questionId,
          answer: item.answer,
          ...(item.editedPayload ? { editedPayload: item.editedPayload } : {}),
        })),
        summary: summary || "HITL resolved",
        at: nowIso(),
        nodeId: instance.cursorNodeId ?? null,
      },
    });
  }

  // stop_policy / loop_max_iterations / wall_clock_timeout / freshness / budget / conflict HITL
  if (
    instance.hitlQuestionIds?.includes("stop_policy") ||
    instance.hitlQuestionIds?.includes("loop_max_iterations") ||
    instance.hitlQuestionIds?.includes("wall_clock_timeout") ||
    instance.hitlQuestionIds?.includes("freshness_stale") ||
    instance.hitlQuestionIds?.includes("budget_exceeded") ||
    instance.hitlQuestionIds?.includes("write_conflict") ||
    instance.hitlQuestionIds?.includes("unknown_side_effects")
  ) {
    const continueAnswer = answers.find((item) =>
      /continue|继续/i.test(item.answer),
    );
    if (!continueAnswer) {
      next = pushEvent(
        {
          ...next,
          status: "error",
          errorMessage: "Stopped after HITL at stop policy",
          completedAt: nowIso(),
        },
        { type: "errored", message: "Stop policy HITL declined continue" },
      );
      return upsertLoopGraph(workspaceRoot, replaceInstance(doc, next));
    }
    // Fall back to serial drain after conflict / unknown side-effect acknowledgement.
    if (
      instance.hitlQuestionIds?.includes("write_conflict") ||
      instance.hitlQuestionIds?.includes("unknown_side_effects")
    ) {
      next = {
        ...next,
        activeRunIds: next.activeRunId ? [next.activeRunId] : undefined,
      };
    }
  }

  if (instance.hitlQuestionIds?.includes("merge_blocked")) {
    const continueAnswer = answers.find((item) =>
      /continue|继续|force/i.test(item.answer),
    );
    if (!continueAnswer) {
      next = pushEvent(
        {
          ...next,
          status: "error",
          errorMessage: "Merge blocked without completed inbound branches",
          completedAt: nowIso(),
        },
        { type: "errored", message: "Merge HITL declined continue" },
      );
      return upsertLoopGraph(workspaceRoot, replaceInstance(doc, next));
    }
  }

  const cursorId = instance.cursorNodeId;
  const cursorNode = cursorId
    ? spec.nodes.find((item) => item.id === cursorId)
    : undefined;
  const humanQuestions = (instance.hitlQuestionIds ?? []).filter(
    (id) => id.startsWith("human_") || id.startsWith("decide_"),
  );

  for (const questionId of humanQuestions) {
    const answer = answers.find((item) => item.questionId === questionId) ?? answers[0];
    if (!answer || !cursorNode) continue;
    const mode = parseHumanModeFromQuestionId(questionId);
    const choice = answer.answer.trim();
    const choiceLower = choice.toLowerCase();

    const decisionMode =
      mode === "legacy"
        ? (architectureOf(cursorNode).humanMode ?? "approval")
        : mode;

    // Legacy decide_* keeps prior semantics: stepper advances on hitl_resolved only.
    if (mode === "legacy") {
      next = pushArtifact(next, {
        nodeId: cursorNode.id,
        kind: "human_decision",
        data: {
          mode: decisionMode,
          choice,
          ...(answer.editedPayload ? { editedPayload: answer.editedPayload } : {}),
          ...(answer.actor ? { actor: answer.actor } : {}),
          at: nowIso(),
          nodeId: cursorNode.id,
        },
      });
      let nextDoc = replaceInstance(doc, next);
      nextDoc = stepLoopInstance(nextDoc, instanceId, { execution });
      return upsertLoopGraph(workspaceRoot, nextDoc);
    }

    if (mode === "approval" || mode === "takeover") {
      // Exact whitelist via isApprovalChoice — never substring-match "approve"
      // inside phrases like "not approved".
      const affirmative = isApprovalChoice(choice);
      const explicitReject =
        /^(reject|denied|deny|拒绝|驳回|not approved|not_approved|unapproved|disapprove|不同意|不批准)$/i.test(
          choice.trim(),
        );
      const explicitTakeover =
        mode === "takeover" ||
        /^(takeover|take.?over|接管)$/i.test(choice.trim()) ||
        Boolean(
          answer.editedPayload &&
            typeof answer.editedPayload === "object" &&
            (answer.editedPayload as { humanTakeover?: unknown }).humanTakeover ===
              true,
        );
      if (explicitTakeover) {
        // Human takeover: invalidate any pending side-effect approval; pause with
        // readable NodeRun context so a later resume/agent can continue from cursor.
        next = invalidatePendingApproval(next, "Human took over the task");
        next = pushArtifact(next, {
          nodeId: cursorNode.id,
          kind: "human_decision",
          data: {
            mode: "takeover",
            choice: "takeover",
            ...(answer.editedPayload ? { editedPayload: answer.editedPayload } : {}),
            ...(answer.actor ? { actor: answer.actor } : {}),
            at: nowIso(),
            nodeId: cursorNode.id,
            cursorNodeId: cursorNode.id,
            preservedStatus: instance.status,
          },
        });
        next = pushEvent(
          {
            ...next,
            status: "paused",
            hitlQuestionIds: [],
            pendingActionPayload: undefined,
            pendingApprovalBinding: undefined,
          },
          {
            type: "paused",
            nodeId: cursorNode.id,
            message: "Human takeover — Agent must read current NodeRun context on resume",
          },
        );
        return upsertLoopGraph(workspaceRoot, replaceInstance(doc, next));
      }
      const actionTarget = (() => {
        if (isActionNode(cursorNode) && !isTestActionNode(cursorNode)) {
          return cursorNode;
        }
        const outs = dependsOutgoingIds(spec, cursorNode.id);
        for (const outId of outs) {
          const candidate = spec.nodes.find((item) => item.id === outId);
          if (candidate && isActionNode(candidate) && !isTestActionNode(candidate)) {
            return candidate;
          }
        }
        return undefined;
      })();
      if (explicitReject) {
        next = invalidatePendingApproval(next, "Human rejected the action");
        next = pushArtifact(next, {
          nodeId: cursorNode.id,
          kind: "human_decision",
          data: {
            mode: "approval",
            choice,
            ...(answer.actor ? { actor: answer.actor } : {}),
            at: nowIso(),
            nodeId: cursorNode.id,
          },
        });
        next = pushEvent(
          {
            ...next,
            status: "error",
            errorMessage: "Human rejected the action",
            completedAt: nowIso(),
          },
          {
            type: "errored",
            nodeId: cursorNode.id,
            message: "Approval rejected",
          },
        );
        return upsertLoopGraph(workspaceRoot, replaceInstance(doc, next));
      }
      // Delivery Action gates require whitelist affirmatives. Pure decide→agent
      // gates still accept free-form answers without authorizing side effects.
      if (!affirmative && actionTarget) {
        next = invalidatePendingApproval(next, "Approval choice not recognized");
        next = pushArtifact(next, {
          nodeId: cursorNode.id,
          kind: "human_decision",
          data: {
            mode: "approval",
            choice,
            ...(answer.actor ? { actor: answer.actor } : {}),
            at: nowIso(),
            nodeId: cursorNode.id,
          },
        });
        next = pushEvent(
          {
            ...next,
            status: "awaiting_hitl",
            hitlQuestionIds: [`human_approval_${cursorNode.id}`],
            pendingApprovalBinding: undefined,
          },
          {
            type: "awaiting_hitl",
            nodeId: cursorNode.id,
            message: "Approval choice not recognized — re-confirm required",
          },
        );
        return upsertLoopGraph(workspaceRoot, replaceInstance(doc, next));
      }
      const actionArch = actionTarget ? architectureOf(actionTarget) : undefined;
      const defaultPayload = buildDefaultActionPayload({
        nodeId: actionTarget?.id ?? cursorNode.id,
        ...(actionArch?.actionIntegration
          ? { actionIntegration: actionArch.actionIntegration }
          : {}),
        ...(actionArch?.actionOperation
          ? { actionOperation: actionArch.actionOperation }
          : {}),
      });

      if (answer.editedPayload) {
        next = {
          ...next,
          pendingActionPayload: {
            ...defaultPayload,
            ...answer.editedPayload,
          },
        };
      } else if (affirmative) {
        next = {
          ...next,
          pendingActionPayload: next.pendingActionPayload ?? defaultPayload,
        };
      }

      const decisionId = `art_${randomUUID()}`;
      let bindingPayload:
        | ReturnType<typeof buildApprovalBinding>
        | undefined;
      if (next.pendingActionPayload && affirmative) {
        const engineering = computeEngineeringBaseline(next, execution);
        if (!engineering.evidenceFresh || !actionTarget) {
          next = pushEvent(
            {
              ...next,
              status: "awaiting_hitl",
              hitlQuestionIds: [`human_approval_${cursorNode.id}`],
              pendingActionPayload: next.pendingActionPayload,
              pendingApprovalBinding: undefined,
            },
            {
              type: "approval_stale",
              nodeId: cursorNode.id,
              message:
                engineering.failClosedReason ??
                "Approval refused: missing Action target or stale/unverified engineering evidence",
            },
          );
          next = pushEvent(next, {
            type: "awaiting_hitl",
            nodeId: cursorNode.id,
            message: "Cannot bind approval — evidence fail-closed",
          });
          return upsertLoopGraph(workspaceRoot, replaceInstance(doc, next));
        }
        const operationDigest = digestOperationPayload(next.pendingActionPayload);
        bindingPayload = buildApprovalBinding({
          instanceId: next.id,
          decisionNodeId: cursorNode.id,
          actionNodeId: actionTarget.id,
          engineering,
          operationDigest,
          instance: next,
          ...(actionArch?.actionIntegration
            ? { actionIntegration: actionArch.actionIntegration }
            : {}),
          ...(actionArch?.actionOperation
            ? { actionOperation: actionArch.actionOperation }
            : {}),
          ...(answer.actor ? { actor: answer.actor } : {}),
        });
      }

      next = pushArtifact(next, {
        id: decisionId,
        nodeId: cursorNode.id,
        kind: "human_decision",
        data: {
          mode: "approval",
          choice,
          ...(answer.editedPayload ? { editedPayload: answer.editedPayload } : {}),
          ...(answer.actor ? { actor: answer.actor } : {}),
          at: nowIso(),
          nodeId: cursorNode.id,
          ...(bindingPayload ? { binding: bindingPayload } : {}),
        },
      });
      if (bindingPayload) {
        next = {
          ...next,
          pendingApprovalBinding: {
            decisionArtifactId: decisionId,
            instanceId: next.id,
            nodeId: bindingPayload.nodeId,
            ...(bindingPayload.decisionNodeId
              ? { decisionNodeId: bindingPayload.decisionNodeId }
              : {}),
            ...(bindingPayload.actionIntegration
              ? { actionIntegration: bindingPayload.actionIntegration }
              : {}),
            ...(bindingPayload.actionOperation
              ? { actionOperation: bindingPayload.actionOperation }
              : {}),
            artifactIds: [...bindingPayload.artifactIds],
            engineeringBaseline: bindingPayload.engineeringBaseline,
            ...(bindingPayload.codeDigest
              ? { codeDigest: bindingPayload.codeDigest }
              : {}),
            ...(bindingPayload.runApprovalContextDigest
              ? {
                  runApprovalContextDigest:
                    bindingPayload.runApprovalContextDigest,
                }
              : {}),
            operationDigest: bindingPayload.operationDigest,
            ...(answer.actor ? { actor: answer.actor } : {}),
            actorKind: bindingPayload.actorKind ?? "unspecified",
            approvedAt: nowIso(),
          },
        };
      }

      // Action node self-gated: re-enter Action stepper with approved payload.
      if (isActionNode(cursorNode) && !isTestActionNode(cursorNode)) {
        let nextDoc = replaceInstance(doc, next);
        nextDoc = stepLoopInstance(nextDoc, instanceId, { execution });
        return upsertLoopGraph(workspaceRoot, nextDoc);
      }

      next = pushEvent(next, {
        type: "node_completed",
        nodeId: cursorNode.id,
        message: `Human approval: ${choice}`,
      });
      // Advance now so the following step does not re-enter HITL.
      const advanced = advanceCursor(doc, next, spec, cursorNode.id);
      const advancedInstance = advanced.instances.find((item) => item.id === instanceId);
      if (!advancedInstance) {
        return upsertLoopGraph(workspaceRoot, advanced);
      }
      let nextDoc = replaceInstance(doc, advancedInstance);
      if (STEPPABLE.has(advancedInstance.status)) {
        nextDoc = stepLoopInstance(nextDoc, instanceId, { execution });
      }
      return upsertLoopGraph(workspaceRoot, nextDoc);
    }

    next = pushArtifact(next, {
      nodeId: cursorNode.id,
      kind: "human_decision",
      data: {
        mode: decisionMode,
        choice,
        ...(answer.editedPayload ? { editedPayload: answer.editedPayload } : {}),
        ...(answer.actor ? { actor: answer.actor } : {}),
        at: nowIso(),
        nodeId: cursorNode.id,
      },
    });

    if (mode === "review") {
      if (/reject|拒绝/i.test(choiceLower)) {
        next = pushEvent(
          {
            ...next,
            status: "error",
            errorMessage: "Human review rejected",
            completedAt: nowIso(),
          },
          {
            type: "errored",
            nodeId: cursorNode.id,
            message: "Review rejected",
          },
        );
        return upsertLoopGraph(workspaceRoot, replaceInstance(doc, next));
      }
      if (/request.?changes|changes|修改|返工/i.test(choiceLower)) {
        const target = findRequestChangesTarget(spec, cursorNode.id);
        if (!target) {
          return upsertLoopGraph(
            workspaceRoot,
            failNode(doc, next, cursorNode.id, "Review requested changes but no target"),
          );
        }
        next = pushEvent(next, {
          type: "node_completed",
          nodeId: cursorNode.id,
          message: `Review requested changes → ${target}`,
        });
        next = {
          ...next,
          cursorNodeId: target,
          activeRunId: undefined,
          activeRunNodeId: undefined,
          status: "running",
        };
        let nextDoc = replaceInstance(doc, next);
        nextDoc = stepLoopInstance(nextDoc, instanceId, { execution });
        return upsertLoopGraph(workspaceRoot, nextDoc);
      }
      // accept
      next = pushEvent(next, {
        type: "node_completed",
        nodeId: cursorNode.id,
        message: `Human review accepted: ${choice}`,
      });
      const advanced = advanceCursor(doc, next, spec, cursorNode.id);
      const advancedInstance = advanced.instances.find((item) => item.id === instanceId)!;
      let nextDoc = replaceInstance(doc, advancedInstance);
      if (STEPPABLE.has(advancedInstance.status)) {
        nextDoc = stepLoopInstance(nextDoc, instanceId, { execution });
      }
      return upsertLoopGraph(workspaceRoot, nextDoc);
    }

    if (mode === "input" || mode === "decision") {
      next = {
        ...next,
        pendingActionPayload: {
          ...(next.pendingActionPayload ?? {}),
          input: choice,
          ...(answer.editedPayload ?? {}),
        },
      };
      next = pushEvent(next, {
        type: "node_completed",
        nodeId: cursorNode.id,
        message: `Human input received`,
      });
      const advanced = advanceCursor(doc, next, spec, cursorNode.id);
      const advancedInstance = advanced.instances.find((item) => item.id === instanceId)!;
      let nextDoc = replaceInstance(doc, advancedInstance);
      if (STEPPABLE.has(advancedInstance.status)) {
        nextDoc = stepLoopInstance(nextDoc, instanceId, { execution });
      }
      return upsertLoopGraph(workspaceRoot, nextDoc);
    }
  }

  let nextDoc = replaceInstance(doc, next);
  nextDoc = stepLoopInstance(nextDoc, instanceId, execution !== undefined ? { execution } : {});
  return upsertLoopGraph(workspaceRoot, nextDoc);
}

export function getLoopInstanceEvents(
  workspaceRoot: string,
  loopId: string,
  instanceId: string,
): LoopInstanceEvent[] {
  const doc = getLoopGraph(workspaceRoot, loopId);
  const instance = doc?.instances.find((item) => item.id === instanceId);
  return instance?.events ?? [];
}

export function advanceLoopInstance(
  workspaceRoot: string,
  loopId: string,
  instanceId: string,
  execution?: LoopExecutionHooks,
): LoopGraphDocument {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const next = stepLoopInstance(doc, instanceId, execution !== undefined ? { execution } : {});
  return upsertLoopGraph(workspaceRoot, next);
}
