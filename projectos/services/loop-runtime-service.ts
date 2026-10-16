import { randomUUID } from "node:crypto";

import {
  type LoopGraphDocument,
  type LoopHitlAnswer,
  type LoopInstance,
  type LoopInstanceEvent,
  type LoopSpec,
  validateLoopSpecTopology,
} from "../contracts/loop-graph.js";
import { getLoopGraph, upsertLoopGraph } from "./loop-graph-service.js";

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
  };
  return {
    ...instance,
    events: [...instance.events, nextEvent].slice(-500),
    updatedAt: nextEvent.at,
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

/** Execute one scheduler tick: advance cursor, apply verify/feedback/HITL rules. */
export function stepLoopInstance(
  doc: LoopGraphDocument,
  instanceId: string,
  options?: { forceFailVerify?: boolean },
): LoopGraphDocument {
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance) throw new Error(`Instance not found: ${instanceId}`);
  if (instance.status !== "running" && instance.status !== "queued") {
    return doc;
  }

  const spec = findSpec(doc, instance.specVersion);
  if (!spec) throw new Error(`Spec not found: ${instance.specVersion}`);

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
    return upsertable(doc, next);
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
    return upsertable(doc, next);
  }

  if (node.role === "verify") {
    const failed = options?.forceFailVerify === true;
    if (failed) {
      const fb = feedbackTarget(spec);
      const round = next.round + 1;
      if (!fb || fb.from !== node.id) {
        next = pushEvent(
          {
            ...next,
            status: "error",
            errorMessage: "Verification failed without feedback edge",
            completedAt: nowIso(),
          },
          { type: "node_failed", nodeId: cursor, message: "Verification failed" },
        );
        return upsertable(doc, next);
      }
      if (round > spec.stopPolicy.maxRounds) {
        next = pushEvent(
          {
            ...next,
            status: "awaiting_hitl",
            round,
            hitlQuestionIds: ["stop_policy"],
          },
          {
            type: "awaiting_hitl",
            nodeId: cursor,
            message: `Stop policy reached (${spec.stopPolicy.maxRounds} rounds)`,
          },
        );
        return upsertable(doc, next);
      }
      next = pushEvent(
        {
          ...next,
          round,
          cursorNodeId: fb.to,
          attemptCounts: {
            ...next.attemptCounts,
            [fb.to]: (next.attemptCounts[fb.to] ?? 0) + 1,
          },
        },
        {
          type: "feedback_taken",
          nodeId: cursor,
          message: `Retry via feedback to ${fb.to} (round ${round})`,
        },
      );
      return upsertable(doc, next);
    }

    next = pushEvent({ ...next }, {
      type: "node_completed",
      nodeId: cursor,
      message: "Verification passed",
    });
  } else {
    // implement / fix / unknown: mark complete for MVP deterministic runner
    next = pushEvent({ ...next }, {
      type: "node_completed",
      nodeId: cursor,
      message: `Completed ${node.role}`,
    });
  }

  const nextId = dependsOutgoing(spec).get(cursor);
  if (!nextId) {
    next = pushEvent(
      { ...next, status: "complete", completedAt: nowIso(), cursorNodeId: cursor },
      { type: "completed", message: "Loop complete" },
    );
    return upsertable(doc, next);
  }

  next = { ...next, cursorNodeId: nextId, updatedAt: nowIso() };
  return upsertable(doc, next);
}

function upsertable(doc: LoopGraphDocument, instance: LoopInstance): LoopGraphDocument {
  return replaceInstance(doc, instance);
}

export function startLoopInstance(
  workspaceRoot: string,
  loopId: string,
  specVersion?: string,
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
    item.status === "awaiting_hitl",
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
  nextDoc = stepLoopInstance(nextDoc, instance.id);
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
  if (instance.status !== "running" && instance.status !== "queued") {
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
  nextDoc = stepLoopInstance(nextDoc, instanceId);
  return upsertLoopGraph(workspaceRoot, nextDoc);
}

export function resolveLoopHitl(
  workspaceRoot: string,
  loopId: string,
  instanceId: string,
  answers: LoopHitlAnswer[],
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
  nextDoc = stepLoopInstance(nextDoc, instanceId);
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
  options?: { forceFailVerify?: boolean },
): LoopGraphDocument {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const next = stepLoopInstance(doc, instanceId, options);
  return upsertLoopGraph(workspaceRoot, next);
}
