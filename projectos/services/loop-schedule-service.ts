/**
 * Arm / fire wall-clock Loop schedules → automatic createRun.
 */

import {
  computeScheduleFireAt,
  createArmedScheduleId,
  isScheduleDue,
  type LoopArmedSchedule,
  type LoopGraphDocument,
  type LoopSpec,
  type LoopSpecNode,
} from "../contracts/loop-graph.js";
import { resolveNodeArchitecture } from "../contracts/loop-node-architecture.js";
import { getLoopGraph, upsertLoopGraph } from "./loop-graph-service.js";
import {
  startLoopInstanceFromEvent,
  type StartLoopInstanceOptions,
} from "./loop-runtime-service.js";

function entryNodeId(spec: LoopSpec): string {
  const incoming = new Set(spec.edges.map((edge) => edge.to));
  const entry = spec.nodes.find((node) => !incoming.has(node.id));
  return entry?.id ?? spec.nodes[0]!.id;
}

export function isScheduleSpecNode(node: LoopSpecNode): boolean {
  const arch = resolveNodeArchitecture(node);
  return arch.type === "logic" && arch.logicKind === "schedule";
}

export function findEntryScheduleNode(spec: LoopSpec): LoopSpecNode | null {
  const entry = spec.nodes.find((node) => node.id === entryNodeId(spec));
  if (!entry || !isScheduleSpecNode(entry)) return null;
  return entry;
}

export function resolveScheduleFireAtForNode(
  node: LoopSpecNode,
  nowMs = Date.now(),
): { ok: true; fireAt: string; mode: "delay" | "at" } | { ok: false; reason: string } {
  const mode = node.scheduleMode ?? "delay";
  const computed = computeScheduleFireAt({
    mode,
    ...(typeof node.waitMs === "number" ? { waitMs: node.waitMs } : {}),
    ...(node.scheduleAt ? { scheduleAt: node.scheduleAt } : {}),
    nowMs,
  });
  if (!computed.ok) return computed;
  return { ok: true, fireAt: computed.fireAt, mode };
}

/**
 * Arm entry Schedule instead of immediate createRun when fireAt is in the future.
 * If already due, returns null so caller can start immediately.
 */
export function armLoopScheduleIfNeeded(
  workspaceRoot: string,
  loopId: string,
  nowMs = Date.now(),
):
  | { kind: "armed"; document: LoopGraphDocument; schedule: LoopArmedSchedule }
  | { kind: "due_now"; document: LoopGraphDocument }
  | { kind: "no_schedule"; document: LoopGraphDocument }
  | { kind: "error"; reason: string } {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) return { kind: "error", reason: `Loop graph not found: ${loopId}` };
  const spec = doc.approvedSpecs[doc.approvedSpecs.length - 1];
  if (!spec) return { kind: "error", reason: "No approved Loop Spec to schedule" };
  const scheduleNode = findEntryScheduleNode(spec);
  if (!scheduleNode) return { kind: "no_schedule", document: doc };

  const fire = resolveScheduleFireAtForNode(scheduleNode, nowMs);
  if (!fire.ok) return { kind: "error", reason: fire.reason };
  if (isScheduleDue(fire.fireAt, nowMs)) {
    return { kind: "due_now", document: doc };
  }

  const schedule: LoopArmedSchedule = {
    id: createArmedScheduleId(),
    nodeId: scheduleNode.id,
    fireAt: fire.fireAt,
    mode: fire.mode,
    createdAt: new Date(nowMs).toISOString(),
  };
  const next: LoopGraphDocument = {
    ...doc,
    armedSchedules: [
      ...(doc.armedSchedules ?? []).filter((item) => item.nodeId !== scheduleNode.id),
      schedule,
    ],
  };
  upsertLoopGraph(workspaceRoot, next);
  return { kind: "armed", document: next, schedule };
}

export function disarmLoopSchedules(
  workspaceRoot: string,
  loopId: string,
): LoopGraphDocument {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  if (!(doc.armedSchedules?.length)) return doc;
  const next = { ...doc, armedSchedules: [] };
  upsertLoopGraph(workspaceRoot, next);
  return next;
}

/**
 * Fire every due armed schedule across a workspace loop (createRun via event).
 */
export function fireDueLoopSchedules(
  workspaceRoot: string,
  loopId: string,
  options?: Omit<StartLoopInstanceOptions, "launch">,
  nowMs = Date.now(),
): { document: LoopGraphDocument; fired: string[] } {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const due = (doc.armedSchedules ?? []).filter((item) =>
    isScheduleDue(item.fireAt, nowMs),
  );
  if (due.length === 0) {
    return { document: doc, fired: [] };
  }

  let current: LoopGraphDocument = {
    ...doc,
    armedSchedules: (doc.armedSchedules ?? []).filter(
      (item) => !due.some((d) => d.id === item.id),
    ),
  };
  upsertLoopGraph(workspaceRoot, current);

  const fired: string[] = [];
  for (const schedule of due) {
    try {
      current = startLoopInstanceFromEvent(
        workspaceRoot,
        loopId,
        {
          eventId: schedule.id,
          eventType: "loop.schedule.fire",
          payload: {
            scheduleNodeId: schedule.nodeId,
            fireAt: schedule.fireAt,
            mode: schedule.mode,
          },
        },
        options,
      );
      fired.push(schedule.id);
    } catch (error) {
      // Re-queue failed fire so a later tick can retry (e.g. active instance).
      const live = getLoopGraph(workspaceRoot, loopId) ?? current;
      current = {
        ...live,
        armedSchedules: [...(live.armedSchedules ?? []), schedule],
      };
      upsertLoopGraph(workspaceRoot, current);
      void error;
    }
  }
  return { document: current, fired };
}
