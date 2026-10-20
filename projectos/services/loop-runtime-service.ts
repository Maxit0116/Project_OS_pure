import { randomUUID } from "node:crypto";

import {
  trimLoopInstanceEvents,
  type LoopGraphDocument,
  type LoopHitlAnswer,
  type LoopInstance,
  type LoopInstanceEvent,
  type LoopSpec,
  validateLoopSpecTopology,
} from "../contracts/loop-graph.js";
import {
  LOOP_FILES_NOT_ATTACHED,
  LOOP_VERIFICATION_NOT_RUN,
  type LoopExecutionHooks,
} from "./loop-execution.js";
import { getLoopGraph, upsertLoopGraph } from "./loop-graph-service.js";

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
function attachPendingSpecDraft(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  reason: string,
): { doc: LoopGraphDocument; instance: LoopInstance } {
  const specDraft = cloneSpecAsPendingDraft(spec, reason);
  const compiledAt = specDraft.createdAt;
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
      },
    },
  };
}

function dependsOutgoing(spec: LoopSpec): Map<string, string | undefined> {
  const map = new Map<string, string | undefined>();
  for (const node of spec.nodes) map.set(node.id, undefined);
  for (const edge of spec.edges.filter((item) => item.kind === "depends")) {
    map.set(edge.from, edge.to);
  }
  return map;
}

function entryNodeId(spec: LoopSpec): string {
  const incoming = new Set(
    spec.edges.filter((edge) => edge.kind === "depends").map((edge) => edge.to),
  );
  const entry = spec.nodes.find((node) => !incoming.has(node.id));
  return entry?.id ?? spec.nodes[0]!.id;
}

function feedbackTarget(spec: LoopSpec): { from: string; to: string } | null {
  const edge = spec.edges.find((item) => item.kind === "feedback");
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
): LoopGraphDocument {
  const next = pushEvent(
    {
      ...instance,
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
 * Implement and fix complete only from an Agent Run. Verify completes only from evidence.
 */
export function stepLoopInstance(
  doc: LoopGraphDocument,
  instanceId: string,
  options?: { execution?: LoopExecutionHooks },
): LoopGraphDocument {
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance) throw new Error(`Instance not found: ${instanceId}`);
  if (!STEPPABLE.has(instance.status)) {
    return doc;
  }

  const spec = findSpec(doc, instance.specVersion);
  if (!spec) throw new Error(`Spec not found: ${instance.specVersion}`);
  const execution = options?.execution;

  let next = instance.status === "queued"
    ? pushEvent({ ...instance, status: "running" }, { type: "started" })
    : instance;

  const cursor = next.cursorNodeId ?? entryNodeId(spec);
  const node = spec.nodes.find((item) => item.id === cursor);
  if (!node) {
    next = pushEvent(
      { ...next, status: "error", errorMessage: `Missing node ${cursor}`, completedAt: nowIso() },
      { type: "errored", message: `Missing node ${cursor}` },
    );
    return replaceInstance(doc, next);
  }

  if (isImplementRole(node.role)) {
    return stepImplementNode(doc, next, spec, node, execution);
  }

  if (node.role === "decide" && next.events.at(-1)?.type === "hitl_resolved") {
    return advanceCursor(doc, { ...next, cursorNodeId: cursor }, spec, cursor);
  }

  next = pushEvent({ ...next, cursorNodeId: cursor }, {
    type: "node_entered",
    nodeId: cursor,
    message: node.goal,
  });

  if (node.role === "decide") {
    next = pushEvent(
      {
        ...next,
        status: "awaiting_hitl",
        hitlQuestionIds: [`decide_${node.id}`],
      },
      { type: "awaiting_hitl", nodeId: cursor, message: "Decision required" },
    );
    return replaceInstance(doc, next);
  }

  if (node.role === "verify") {
    return stepVerifyNode(doc, next, spec, node.id, execution);
  }

  return failNode(doc, next, cursor, `Unsupported loop role ${node.role}`);
}

function stepImplementNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpec["nodes"][number],
  execution: LoopExecutionHooks | undefined,
): LoopGraphDocument {
  const polling = instance.activeRunId && instance.activeRunNodeId === node.id;
  let next = polling
    ? { ...instance, cursorNodeId: node.id }
    : pushEvent({ ...instance, cursorNodeId: node.id }, {
        type: "node_entered",
        nodeId: node.id,
        message: node.goal,
      });

  let run = polling && next.activeRunId
    ? execution?.readRun(next.activeRunId) ?? null
    : null;

  if (!polling) {
    const leaf = execution?.leaf ?? null;
    if (!leaf || !execution) {
      return failNode(doc, next, node.id, LOOP_FILES_NOT_ATTACHED);
    }
    try {
      run = execution.startAgentRun({
        specNodeId: node.id,
        role: node.role as "implement" | "fix",
        featureNodeId: leaf.featureNodeId,
        filePath: leaf.filePath,
        goal: node.goal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : LOOP_FILES_NOT_ATTACHED;
      return failNode(doc, next, node.id, message);
    }
    next = {
      ...next,
      activeRunId: run.runId,
      activeRunNodeId: node.id,
      featureNodeId: leaf.featureNodeId,
    };
  }

  if (!run || !next.activeRunId) {
    return failNode(doc, next, node.id, LOOP_FILES_NOT_ATTACHED);
  }

  if (run.status === "queued" || run.status === "running") {
    return replaceInstance(doc, { ...next, status: "running" });
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
    next = pushEvent(next, {
      type: "node_completed",
      nodeId: node.id,
      message: `Agent run ${run.runId} applied`,
      agentRunId: run.runId,
    });
    return advanceCursor(doc, next, spec, node.id);
  }

  return failNode(
    doc,
    next,
    node.id,
    run.status === "cancelled"
      ? `Agent run ${run.runId} cancelled`
      : `Agent run ${run.runId} did not apply`,
  );
}

function stepVerifyNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  nodeId: string,
  execution: LoopExecutionHooks | undefined,
): LoopGraphDocument {
  const evidence = instance.activeRunId
    ? execution?.readEvidence(instance.activeRunId) ?? null
    : null;
  if (!evidence || evidence.status === "not_run" || evidence.runId !== instance.activeRunId) {
    const next = pushEvent(
      {
        ...instance,
        status: "awaiting_hitl",
        hitlQuestionIds: ["verification_not_run"],
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

  if (evidence.status === "failed" && spec.retryPolicy.onFailure === "replan") {
    const proposed = attachPendingSpecDraft(
      doc,
      instance,
      spec,
      "Verification failed and retry policy is replan. Approve a new spec version before the instance can follow different steps.",
    );
    return replaceInstance(proposed.doc, proposed.instance);
  }

  if (evidence.status === "failed") {
    const fb = feedbackTarget(spec);
    const round = instance.round + 1;
    if (!fb || fb.from !== nodeId) {
      return failNode(doc, instance, nodeId, "Verification failed without feedback edge");
    }
    const target = spec.nodes.find((item) => item.id === fb.to);
    if (!target || !isImplementRole(target.role)) {
      return failNode(doc, instance, nodeId, "Feedback target is not an implement node");
    }
    if (round > spec.stopPolicy.maxRounds) {
      const next = pushEvent(
        {
          ...instance,
          status: "awaiting_hitl",
          round,
          hitlQuestionIds: ["stop_policy"],
        },
        {
          type: "awaiting_hitl",
          nodeId,
          message: `Stop policy reached (${spec.stopPolicy.maxRounds} rounds)`,
          evidenceId: evidence.id,
        },
      );
      return replaceInstance(doc, next);
    }
    const next = pushEvent(
      {
        ...instance,
        round,
        cursorNodeId: fb.to,
        activeRunId: undefined,
        activeRunNodeId: undefined,
        attemptCounts: {
          ...instance.attemptCounts,
          [fb.to]: (instance.attemptCounts[fb.to] ?? 0) + 1,
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

  const next = pushEvent(instance, {
    type: "node_completed",
    nodeId,
    message: "Verification passed",
    evidenceId: evidence.id,
    ...(instance.activeRunId ? { agentRunId: instance.activeRunId } : {}),
  });
  return advanceCursor(doc, next, spec, nodeId);
}

function advanceCursor(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  cursor: string,
): LoopGraphDocument {
  const nextId = dependsOutgoing(spec).get(cursor);
  if (!nextId) {
    const next = pushEvent(
      { ...instance, status: "complete", completedAt: nowIso(), cursorNodeId: cursor },
      { type: "completed", message: "Loop complete" },
    );
    return replaceInstance(doc, next);
  }
  return replaceInstance(doc, { ...instance, cursorNodeId: nextId, updatedAt: nowIso() });
}

function upsertable(doc: LoopGraphDocument, instance: LoopInstance): LoopGraphDocument {
  return replaceInstance(doc, instance);
}

export function startLoopInstance(
  workspaceRoot: string,
  loopId: string,
  specVersion?: string,
  execution?: LoopExecutionHooks,
): LoopGraphDocument {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const spec =
    (specVersion
      ? doc.approvedSpecs.find((item) => item.version === specVersion)
      : doc.approvedSpecs[doc.approvedSpecs.length - 1]) ?? undefined;
  if (!spec) throw new Error("No approved Loop Spec to run");
  const issues = validateLoopSpecTopology(spec);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join("; "));
  }

  const active = doc.instances.find((item) =>
    item.status === "queued" ||
    item.status === "running" ||
    item.status === "paused" ||
    item.status === "awaiting_hitl" ||
    item.status === "awaiting_review",
  );
  if (active) {
    throw new Error("A loop instance is already active");
  }

  const startedAt = nowIso();
  const instance: LoopInstance = {
    id: `inst_${randomUUID()}`,
    specVersion: spec.version,
    status: "queued",
    cursorNodeId: entryNodeId(spec),
    round: 0,
    attemptCounts: {},
    events: [],
    startedAt,
    updatedAt: startedAt,
  };

  let nextDoc: LoopGraphDocument = {
    ...doc,
    instances: [...doc.instances, instance],
  };
  nextDoc = stepLoopInstance(nextDoc, instance.id, { execution });
  return upsertLoopGraph(workspaceRoot, nextDoc);
}

export function pauseLoopInstance(
  workspaceRoot: string,
  loopId: string,
  instanceId: string,
): LoopGraphDocument {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance) throw new Error(`Instance not found: ${instanceId}`);
  if (
    instance.status !== "running" &&
    instance.status !== "queued" &&
    instance.status !== "awaiting_review"
  ) {
    return doc;
  }
  const next = pushEvent({ ...instance, status: "paused" }, {
    type: "paused",
    message: "Paused by user",
  });
  return upsertLoopGraph(workspaceRoot, replaceInstance(doc, next));
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
  let next = pushEvent({ ...instance, status: "running" }, {
    type: "resumed",
    message: "Resumed by user",
  });
  let nextDoc = replaceInstance(doc, next);
  nextDoc = stepLoopInstance(nextDoc, instanceId, { execution });
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

  const summary = answers.map((item) => `${item.questionId}=${item.answer}`).join("; ");
  let next = pushEvent(
    {
      ...instance,
      status: "running",
      hitlQuestionIds: [],
    },
    { type: "hitl_resolved", message: summary || "HITL resolved" },
  );

  // stop_policy HITL: end the loop as error unless answer says continue
  if (instance.hitlQuestionIds?.includes("stop_policy")) {
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
  }

  let nextDoc = replaceInstance(doc, next);
  nextDoc = stepLoopInstance(nextDoc, instanceId, { execution });
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
  const next = stepLoopInstance(doc, instanceId, { execution });
  return upsertLoopGraph(workspaceRoot, next);
}
