import type { AgentRunEvent } from "../../contracts/events.js";
import type {
  ExecutionOverlay,
  LiveDelegationLink,
  LiveNodeActivity,
  LiveNodeActivityKind,
  LiveNodeActivityStatus,
  LiveNodeSummary,
  LiveVerificationNarrative,
} from "../../contracts/live-graph.js";
import {
  fileLabel,
  resolvePathToNodeIds,
  type LiveGraphFileIndexEntry,
} from "./path-map.js";

const RUNNING_PRIORITY: Record<LiveNodeActivityKind, number> = {
  failed: 100,
  needs_approval: 90,
  editing: 80,
  creating: 75,
  running_tests: 70,
  reading: 60,
  waiting: 50,
  completed: 10,
};

export function emptyExecutionOverlay(
  runId: string,
  updatedAt = new Date().toISOString(),
): ExecutionOverlay {
  return {
    runId,
    runIds: [runId],
    childRunParentById: {},
    agentLabelByRunId: { [runId]: "A1" },
    delegationLinks: [],
    updatedAt,
    activitiesById: {},
    activityIdsByNodeId: {},
    unmappedActivityIds: [],
    seenEventIds: [],
  };
}

export function rebuildExecutionOverlay(
  events: readonly AgentRunEvent[],
  fileIndex: readonly LiveGraphFileIndexEntry[],
  runId?: string,
): ExecutionOverlay | null {
  let overlay: ExecutionOverlay | null = null;
  for (const event of events) {
    if (runId) {
      const known =
        event.runId === runId ||
        (overlay?.runIds.includes(event.runId) ?? false);
      if (!known) continue;
    }
    overlay = applyAgentRunEventToOverlay(
      overlay ?? emptyExecutionOverlay(runId ?? event.runId, event.timestamp),
      event,
      fileIndex,
    );
  }
  return overlay;
}

/**
 * Re-resolve activity paths against an updated fileIndex (architecture promotion).
 * Does not change layout — only remaps nodeIds / unmapped lists.
 */
export function remapExecutionOverlay(
  overlay: ExecutionOverlay,
  fileIndex: readonly LiveGraphFileIndexEntry[],
): ExecutionOverlay {
  const activitiesById: Record<string, LiveNodeActivity> = {};
  const activityIdsByNodeId: Record<string, string[]> = {};
  const unmappedActivityIds: string[] = [];

  for (const [id, activity] of Object.entries(overlay.activitiesById)) {
    // Paths re-resolve against the new index (architecture promotion).
    // Explicit node pins without a path (e.g. planner targets) stay as-is.
    const nodeIds = activity.path
      ? resolvePathToNodeIds(activity.path, fileIndex)
      : activity.nodeIds;
    const nextActivity: LiveNodeActivity = { ...activity, nodeIds };
    activitiesById[id] = nextActivity;
    if (nodeIds.length === 0) {
      unmappedActivityIds.push(id);
    } else {
      for (const nodeId of nodeIds) {
        activityIdsByNodeId[nodeId] = uniqueStrings([
          ...(activityIdsByNodeId[nodeId] ?? []),
          id,
        ]);
      }
    }
  }

  const delegationLinks = overlay.delegationLinks.map((link) => {
    let targetNodeId =
      link.targetNodeId && nodeExistsInIndex(link.targetNodeId, fileIndex)
        ? link.targetNodeId
        : undefined;
    const sourceNodeId =
      link.sourceNodeId && nodeExistsInIndex(link.sourceNodeId, fileIndex)
        ? link.sourceNodeId
        : undefined;
    // Promote: child activity path now maps after fileIndex refresh.
    if (!targetNodeId) {
      const childActivity = Object.values(activitiesById).find(
        (item) =>
          item.runId === link.childRunId &&
          item.nodeIds.length > 0 &&
          (link.taskId ? item.taskId === link.taskId : true),
      );
      targetNodeId = childActivity?.nodeIds[0];
    }
    return stripUndefinedNodes({
      ...link,
      ...(sourceNodeId ? { sourceNodeId } : {}),
      ...(targetNodeId ? { targetNodeId } : {}),
    });
  });

  return {
    ...overlay,
    activitiesById,
    activityIdsByNodeId,
    unmappedActivityIds: uniqueStrings(unmappedActivityIds),
    delegationLinks,
  };
}

/**
 * Incremental Graph State Adapter: map one AgentRunEvent into the overlay.
 * Dedupes by eventId. Child/sibling runIds merge into the same session overlay
 * (store clears overlay when the user starts a brand-new root run).
 */
export function applyAgentRunEventToOverlay(
  overlay: ExecutionOverlay,
  event: AgentRunEvent,
  fileIndex: readonly LiveGraphFileIndexEntry[],
): ExecutionOverlay {
  if (overlay.seenEventIds.includes(event.eventId)) {
    return overlay;
  }

  let next = registerRunOnOverlay(overlay, event.runId, event.timestamp);
  next = {
    ...next,
    seenEventIds: [...next.seenEventIds, event.eventId],
    updatedAt: event.timestamp,
  };

  if (event.type === "run_started") {
    // Root restart: wipe. Child/sibling start: keep siblings.
    if (event.runId === overlay.runId) {
      return {
        ...emptyExecutionOverlay(event.runId, event.timestamp),
        seenEventIds: [event.eventId],
      };
    }
    return next;
  }

  if (
    event.type === "run_completed" ||
    event.type === "run_cancelled" ||
    event.type === "run_interrupted"
  ) {
    const terminal: LiveNodeActivityStatus =
      event.type === "run_completed" ? "complete" : "error";
    // Root session cancel/interrupt settles all agents; otherwise only that run.
    const onlyRunId =
      event.runId === next.runId &&
      (event.type === "run_cancelled" || event.type === "run_interrupted")
        ? undefined
        : event.runId;
    return settleRunningActivities(next, event.timestamp, terminal, onlyRunId);
  }

  if (event.type === "task_delegated") {
    return applyTaskDelegated(next, event, fileIndex);
  }

  if (event.type === "child_run_completed") {
    const terminal: LiveNodeActivityStatus =
      event.payload.status === "error" ? "error" : "complete";
    return settleRunningActivities(
      next,
      event.timestamp,
      terminal,
      event.payload.childRunId,
    );
  }

  if (event.type === "child_run_outcome") {
    const terminal: LiveNodeActivityStatus =
      event.payload.status === "applied" ? "complete" : "error";
    return settleRunningActivities(
      next,
      event.timestamp,
      terminal,
      event.payload.childRunId,
    );
  }

  if (event.type === "file_read") {
    const status: LiveNodeActivityStatus =
      event.payload.status === "ok" ? "complete" : "error";
    const kind: LiveNodeActivityKind =
      status === "error" ? "failed" : "reading";
    return upsertPathActivity(next, {
      runId: event.runId,
      path: event.payload.path,
      kind,
      status,
      eventId: event.eventId,
      timestamp: event.timestamp,
      fileIndex,
      phaseId: event.phaseId,
    });
  }

  if (event.type === "context_assembled") {
    let current = next;
    for (const file of event.payload.files) {
      if (file.disposition === "omitted") continue;
      current = upsertPathActivity(current, {
        runId: event.runId,
        path: file.path,
        kind: "reading",
        status: "complete",
        eventId: event.eventId,
        timestamp: event.timestamp,
        fileIndex,
        phaseId: event.phaseId,
      });
    }
    return current;
  }

  if (event.type === "context_attached") {
    let current = next;
    for (const file of event.payload.autoFiles) {
      if (file.disposition === "omitted") continue;
      current = upsertPathActivity(current, {
        runId: event.runId,
        path: file.path,
        kind: "reading",
        status: "complete",
        eventId: event.eventId,
        timestamp: event.timestamp,
        fileIndex,
        phaseId: event.phaseId,
      });
    }
    return current;
  }

  if (event.type === "diff_proposed") {
    let current = next;
    for (const file of event.payload.files) {
      const kind: LiveNodeActivityKind =
        file.operation === "create" ? "creating" : "editing";
      // Proposal is not apply — keep running until apply_result or run terminal.
      current = upsertPathActivity(current, {
        runId: event.runId,
        path: file.path,
        kind,
        status: "running",
        eventId: event.eventId,
        timestamp: event.timestamp,
        fileIndex,
        phaseId: event.phaseId,
      });
    }
    return current;
  }

  if (event.type === "apply_result") {
    const status: LiveNodeActivityStatus =
      event.payload.outcome === "applied" ? "complete" : "error";
    const kind: LiveNodeActivityKind =
      status === "error" ? "failed" : "editing";
    let current = next;
    for (const path of event.payload.filesWritten) {
      current = upsertPathActivity(current, {
        runId: event.runId,
        path,
        kind,
        status,
        eventId: event.eventId,
        timestamp: event.timestamp,
        fileIndex,
        phaseId: event.phaseId,
        preferKinds: ["editing", "creating", "failed"],
      });
    }
    return current;
  }

  if (event.type === "verification_result") {
    const status: LiveNodeActivityStatus =
      event.payload.status === "passed"
        ? "complete"
        : event.payload.status === "failed"
          ? "error"
          : "complete";
    const kind: LiveNodeActivityKind =
      status === "error" ? "failed" : "running_tests";
    const label =
      event.payload.command?.trim() ||
      event.payload.summary?.trim() ||
      "verification";
    const narrative: LiveVerificationNarrative = {
      runId: event.runId,
      status: event.payload.status,
      ...(event.payload.reason ? { reason: event.payload.reason } : {}),
      ...(event.payload.evidenceId ? { evidenceId: event.payload.evidenceId } : {}),
      ...(event.payload.summary ? { summary: event.payload.summary } : {}),
      ...(event.payload.command ? { command: event.payload.command } : {}),
    };
    const withNarrative: ExecutionOverlay = {
      ...next,
      verificationNarrative: narrative,
    };
    return upsertPathActivity(withNarrative, {
      runId: event.runId,
      path: undefined,
      kind,
      status,
      eventId: event.eventId,
      timestamp: event.timestamp,
      fileIndex,
      phaseId: event.phaseId,
      labelOverride: label.slice(0, 80),
    });
  }

  if (event.type === "edit_plan_created") {
    return upsertPathActivity(next, {
      runId: event.runId,
      path: event.payload.path,
      kind: "waiting",
      status: "running",
      eventId: event.eventId,
      timestamp: event.timestamp,
      fileIndex,
      phaseId: event.phaseId,
      labelOverride: fileLabel(event.payload.path),
    });
  }

  if (event.type === "tool_policy_decision" && event.payload.decision === "ask") {
    return upsertPathActivity(next, {
      runId: event.runId,
      path: undefined,
      kind: "needs_approval",
      status: "running",
      eventId: event.eventId,
      timestamp: event.timestamp,
      fileIndex,
      phaseId: event.phaseId,
      labelOverride: event.payload.tool.slice(0, 80),
    });
  }

  return next;
}

export function summarizeNodeLiveActivity(
  overlay: ExecutionOverlay | null | undefined,
  nodeId: string,
): LiveNodeSummary | null {
  if (!overlay) return null;
  const ids = overlay.activityIdsByNodeId[nodeId];
  if (!ids || ids.length === 0) return null;

  const activities = ids
    .map((id) => overlay.activitiesById[id])
    .filter((item): item is LiveNodeActivity => Boolean(item));
  if (activities.length === 0) return null;

  const running = activities.filter((item) => item.status === "running");
  const pool = running.length > 0 ? running : activities;
  const primary = [...pool].sort((a, b) => {
    const byKind = RUNNING_PRIORITY[b.kind] - RUNNING_PRIORITY[a.kind];
    if (byKind !== 0) return byKind;
    return b.startedAt.localeCompare(a.startedAt);
  })[0]!;

  const agentLabels = uniqueStrings(
    activities
      .map(
        (item) =>
          item.agentId ??
          overlay.agentLabelByRunId[item.runId] ??
          undefined,
      )
      .filter((label): label is string => Boolean(label)),
  );

  return {
    nodeId,
    primaryKind: primary.kind,
    primaryStatus: primary.status,
    activeCount: running.length,
    totalCount: activities.length,
    label: primary.label,
    agentLabels,
  };
}

export function listUnmappedActivities(
  overlay: ExecutionOverlay | null | undefined,
): LiveNodeActivity[] {
  if (!overlay) return [];
  return overlay.unmappedActivityIds
    .map((id) => overlay.activitiesById[id])
    .filter((item): item is LiveNodeActivity => Boolean(item));
}

function applyTaskDelegated(
  overlay: ExecutionOverlay,
  event: Extract<AgentRunEvent, { type: "task_delegated" }>,
  fileIndex: readonly LiveGraphFileIndexEntry[],
): ExecutionOverlay {
  const payload = event.payload;
  const childRunId = payload.childRunId;
  const taskId = payload.taskId;
  const targetNodeId = payload.nodeId;
  const filePath = "filePath" in payload ? payload.filePath : undefined;

  let next = registerRunOnOverlay(overlay, childRunId, event.timestamp);
  next = {
    ...next,
    childRunParentById: {
      ...next.childRunParentById,
      [childRunId]: event.runId,
    },
  };

  const parentSourceNodeId = resolveParentSourceNodeId(next, event.runId, taskId);

  next = upsertPathActivity(next, {
    runId: childRunId,
    path: filePath,
    kind: "waiting",
    status: "running",
    eventId: event.eventId,
    timestamp: event.timestamp,
    fileIndex,
    phaseId: taskId,
    labelOverride: filePath
      ? fileLabel(filePath)
      : `delegate:${targetNodeId}`.slice(0, 80),
    forceNodeIds:
      !filePath || resolvePathToNodeIds(filePath, fileIndex).length === 0
        ? [targetNodeId]
        : undefined,
  });

  const waitingId = Object.keys(next.activitiesById).find((id) => {
    const activity = next.activitiesById[id];
    return (
      activity?.runId === childRunId &&
      activity.sourceEventIds.includes(event.eventId)
    );
  });

  const linkId = `deleg:${event.runId}->${childRunId}:${taskId}`;
  const link: LiveDelegationLink = {
    id: linkId,
    parentRunId: event.runId,
    childRunId,
    taskId,
    ...(parentSourceNodeId ? { sourceNodeId: parentSourceNodeId } : {}),
    targetNodeId:
      waitingId && next.activitiesById[waitingId]?.nodeIds[0]
        ? next.activitiesById[waitingId]!.nodeIds[0]
        : targetNodeId,
    sourceActivityIds: waitingId ? [waitingId] : [],
  };

  const delegationLinks = next.delegationLinks.some((item) => item.id === linkId)
    ? next.delegationLinks
    : [...next.delegationLinks, link];

  return { ...next, delegationLinks };
}

function resolveParentSourceNodeId(
  overlay: ExecutionOverlay,
  parentRunId: string,
  taskId: string,
): string | undefined {
  const parentActivities = Object.values(overlay.activitiesById)
    .filter(
      (item) =>
        item.runId === parentRunId &&
        item.nodeIds.length > 0 &&
        (item.taskId === taskId || item.status === "running"),
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return parentActivities[0]?.nodeIds[0];
}

function registerRunOnOverlay(
  overlay: ExecutionOverlay,
  runId: string,
  updatedAt: string,
): ExecutionOverlay {
  if (overlay.runIds.includes(runId) && overlay.agentLabelByRunId[runId]) {
    return overlay;
  }
  const label =
    overlay.agentLabelByRunId[runId] ??
    `A${Object.keys(overlay.agentLabelByRunId).length + 1}`;
  return {
    ...overlay,
    runIds: uniqueStrings([...overlay.runIds, runId]),
    agentLabelByRunId: {
      ...overlay.agentLabelByRunId,
      [runId]: label,
    },
    updatedAt,
  };
}

function settleRunningActivities(
  overlay: ExecutionOverlay,
  timestamp: string,
  terminal: LiveNodeActivityStatus,
  onlyRunId?: string,
): ExecutionOverlay {
  const activitiesById = { ...overlay.activitiesById };
  for (const [id, activity] of Object.entries(activitiesById)) {
    if (activity.status !== "running") continue;
    if (onlyRunId && activity.runId !== onlyRunId) continue;
    activitiesById[id] = {
      ...activity,
      status: terminal,
      kind: terminal === "error" ? "failed" : activity.kind === "waiting" ? "completed" : activity.kind,
      completedAt: timestamp,
    };
  }
  return {
    ...overlay,
    activitiesById,
    updatedAt: timestamp,
  };
}

function activityId(input: {
  runId: string;
  kind: LiveNodeActivityKind;
  path?: string;
  phaseId?: string;
  label?: string;
}): string {
  const scope = input.path
    ? normalizeKey(input.path)
    : normalizeKey(input.label ?? "resource");
  const phase = input.phaseId ? `:${normalizeKey(input.phaseId)}` : "";
  return `live:${input.runId}:${input.kind}${phase}:${scope}`;
}

function normalizeKey(value: string): string {
  return value.replace(/\\/g, "/").replace(/[^a-zA-Z0-9._/-]+/g, "_");
}

function upsertPathActivity(
  overlay: ExecutionOverlay,
  input: {
    runId: string;
    path?: string;
    kind: LiveNodeActivityKind;
    status: LiveNodeActivityStatus;
    eventId: string;
    timestamp: string;
    fileIndex: readonly LiveGraphFileIndexEntry[];
    phaseId?: string;
    labelOverride?: string;
    preferKinds?: LiveNodeActivityKind[];
    /** When path is missing or unmapped, pin to these node ids (e.g. delegated nodeId). */
    forceNodeIds?: string[];
  },
): ExecutionOverlay {
  const resolvedFromPath = input.path
    ? resolvePathToNodeIds(input.path, input.fileIndex)
    : [];
  const nodeIds =
    resolvedFromPath.length > 0
      ? resolvedFromPath
      : (input.forceNodeIds ?? []);
  const label =
    input.labelOverride ??
    (input.path ? fileLabel(input.path) : input.kind);
  const agentId = overlay.agentLabelByRunId[input.runId] ?? undefined;

  const preferredKinds = input.preferKinds ?? [input.kind];
  let id: string | undefined;
  if (input.path) {
    for (const kind of preferredKinds) {
      const candidate = activityId({
        runId: input.runId,
        kind,
        path: input.path,
        phaseId: input.phaseId,
      });
      if (overlay.activitiesById[candidate]) {
        id = candidate;
        break;
      }
    }
  }
  id ??= activityId({
    runId: input.runId,
    kind: input.kind,
    path: input.path,
    phaseId: input.phaseId,
    label,
  });

  const existing = overlay.activitiesById[id];
  if (
    existing &&
    existing.status !== "running" &&
    input.status === "running" &&
    existing.completedAt &&
    existing.completedAt >= input.timestamp
  ) {
    // Late started must not reopen a newer completed activity.
    return {
      ...overlay,
      activitiesById: {
        ...overlay.activitiesById,
        [id]: {
          ...existing,
          sourceEventIds: uniqueStrings([
            ...existing.sourceEventIds,
            input.eventId,
          ]),
        },
      },
    };
  }

  const nextActivity: LiveNodeActivity = {
    id,
    runId: input.runId,
    ...(input.phaseId ? { taskId: input.phaseId } : {}),
    ...(agentId ? { agentId } : {}),
    kind: input.kind,
    status: input.status,
    ...(input.path ? { path: input.path } : {}),
    nodeIds,
    label,
    startedAt: existing?.startedAt ?? input.timestamp,
    ...(input.status === "running"
      ? existing?.completedAt
        ? { completedAt: existing.completedAt }
        : {}
      : { completedAt: input.timestamp }),
    sourceEventIds: uniqueStrings([
      ...(existing?.sourceEventIds ?? []),
      input.eventId,
    ]),
  };

  // Clear completedAt when (re)entering running from an older complete.
  if (input.status === "running") {
    delete (nextActivity as { completedAt?: string }).completedAt;
  }

  const activitiesById = {
    ...overlay.activitiesById,
    [id]: nextActivity,
  };

  const activityIdsByNodeId = { ...overlay.activityIdsByNodeId };
  for (const nodeId of nodeIds) {
    const prev = activityIdsByNodeId[nodeId] ?? [];
    activityIdsByNodeId[nodeId] = uniqueStrings([...prev, id]);
  }

  let unmappedActivityIds = overlay.unmappedActivityIds.filter(
    (item) => item !== id,
  );
  if (nodeIds.length === 0) {
    unmappedActivityIds = uniqueStrings([...unmappedActivityIds, id]);
  }

  return {
    ...overlay,
    activitiesById,
    activityIdsByNodeId,
    unmappedActivityIds,
  };
}

function nodeExistsInIndex(
  nodeId: string,
  fileIndex: readonly LiveGraphFileIndexEntry[],
): boolean {
  return fileIndex.some((entry) => entry.nodeIds.includes(nodeId));
}

function stripUndefinedNodes(link: LiveDelegationLink): LiveDelegationLink {
  const next: LiveDelegationLink = {
    id: link.id,
    parentRunId: link.parentRunId,
    childRunId: link.childRunId,
    sourceActivityIds: link.sourceActivityIds,
  };
  if (link.taskId) next.taskId = link.taskId;
  if (link.sourceNodeId) next.sourceNodeId = link.sourceNodeId;
  if (link.targetNodeId) next.targetNodeId = link.targetNodeId;
  return next;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
