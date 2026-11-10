import type {
  ExecutionOverlay,
  LiveExecutionEdge,
  LiveNodeActivity,
  LiveNodeActivityKind,
  LiveNodeActivityStatus,
} from "../../contracts/live-graph.js";

/** One Changes-row for a node: path aggregated from edit/create/failed activities. */
export interface LiveNodeChangeEntry {
  path: string;
  status: LiveNodeActivityStatus;
  kind: Extract<LiveNodeActivityKind, "editing" | "creating" | "failed">;
  startedAt: string;
  completedAt?: string;
  activityId: string;
  label: string;
}

function isEditChangeActivity(
  activity: LiveNodeActivity,
): activity is LiveNodeActivity & {
  path: string;
  kind: Extract<LiveNodeActivityKind, "editing" | "creating" | "failed">;
} {
  return Boolean(
    activity.path &&
      (activity.kind === "editing" ||
        activity.kind === "creating" ||
        activity.kind === "failed"),
  );
}

function changeRecencyKey(activity: LiveNodeActivity): string {
  return activity.completedAt ?? activity.startedAt;
}

const MAX_READ_EDIT_EDGES = 48;
const MAX_IMPACT_EDGES = 16;

export type DeriveExecutionEdgesOptions = {
  /** When set, only edges for this task (phaseId) are returned. */
  focusTaskId?: string | null;
  /**
   * Default view without focus: prefer the "current" task
   * (running activities' task, else latest task by startedAt).
   * Pass false to include the whole run.
   */
  currentTaskOnly?: boolean;
  /**
   * Optional impact resolver: edited/created nodeId → dependent node ids.
   * Results are marked `inferred: true`.
   */
  resolveImpactDependents?: (nodeId: string) => readonly string[];
};

/**
 * Derive execution edges from overlay activities.
 * Architecture dependencies are never created here.
 */
export function deriveExecutionEdges(
  overlay: ExecutionOverlay | null | undefined,
  options: DeriveExecutionEdgesOptions = {},
): LiveExecutionEdge[] {
  if (!overlay) return [];

  const currentTaskOnly = options.currentTaskOnly !== false;
  const focusTaskId =
    options.focusTaskId ??
    (currentTaskOnly ? resolveCurrentTaskId(overlay) : null);

  const activities = Object.values(overlay.activitiesById).filter((activity) => {
    if (!focusTaskId) return true;
    return activity.taskId === focusTaskId;
  });

  const reads = activities.filter(
    (activity) =>
      (activity.kind === "reading" || activity.kind === "waiting") &&
      activity.nodeIds.length > 0,
  );
  const edits = activities.filter(
    (activity) =>
      (activity.kind === "editing" ||
        activity.kind === "creating" ||
        activity.kind === "failed") &&
      activity.nodeIds.length > 0 &&
      Boolean(activity.path),
  );

  const edges: LiveExecutionEdge[] = [];
  const seen = new Set<string>();

  for (const edit of edits) {
    for (const targetId of edit.nodeIds) {
      for (const read of reads) {
        for (const sourceId of read.nodeIds) {
          if (sourceId === targetId) continue;
          if (edges.length >= MAX_READ_EDIT_EDGES) break;
          const id = `exec:${overlay.runId}:read_context:${sourceId}->${targetId}:${edit.id}`;
          if (seen.has(id)) continue;
          seen.add(id);
          edges.push({
            id,
            runId: overlay.runId,
            ...(edit.taskId || read.taskId
              ? { taskId: edit.taskId ?? read.taskId }
              : {}),
            kind: "read_context",
            sourceNodeId: sourceId,
            targetNodeId: targetId,
            sourceActivityIds: [read.id, edit.id],
            label: "read → edit",
            inferred: false,
          });
        }
      }

      // Self-edit marker when nothing was read into a different node.
      if (reads.every((read) => !read.nodeIds.some((id) => id !== targetId))) {
        const id = `exec:${overlay.runId}:edit_create:${targetId}:${edit.id}`;
        if (!seen.has(id)) {
          seen.add(id);
          edges.push({
            id,
            runId: overlay.runId,
            ...(edit.taskId ? { taskId: edit.taskId } : {}),
            kind: "edit_create",
            sourceNodeId: targetId,
            targetNodeId: targetId,
            sourceActivityIds: [edit.id],
            label: edit.kind === "creating" ? "create" : "edit",
            inferred: false,
          });
        }
      }
    }
  }

  // Collapse self-loop edit_create edges from the canvas set (inspector can still use activities).
  const canvasEdges = edges.filter(
    (edge) =>
      !(edge.kind === "edit_create" && edge.sourceNodeId === edge.targetNodeId),
  );

  for (const link of overlay.delegationLinks) {
    if (!link.sourceNodeId || !link.targetNodeId) continue;
    if (link.sourceNodeId === link.targetNodeId) continue;
    if (focusTaskId && link.taskId && link.taskId !== focusTaskId) continue;
    const id = `exec:${overlay.runId}:delegation:${link.sourceNodeId}->${link.targetNodeId}:${link.childRunId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    canvasEdges.push({
      id,
      runId: link.parentRunId,
      ...(link.taskId ? { taskId: link.taskId } : {}),
      kind: "delegation",
      sourceNodeId: link.sourceNodeId,
      targetNodeId: link.targetNodeId,
      sourceActivityIds: link.sourceActivityIds,
      label: "delegates",
      inferred: false,
    });
  }

  if (options.resolveImpactDependents) {
    let impactCount = 0;
    const editedNodeIds = new Set(
      edits.flatMap((activity) => activity.nodeIds),
    );
    for (const sourceId of editedNodeIds) {
      if (impactCount >= MAX_IMPACT_EDGES) break;
      const dependents = options.resolveImpactDependents(sourceId);
      for (const targetId of dependents) {
        if (impactCount >= MAX_IMPACT_EDGES) break;
        if (targetId === sourceId) continue;
        const id = `exec:${overlay.runId}:impact:${sourceId}->${targetId}`;
        if (seen.has(id)) continue;
        seen.add(id);
        canvasEdges.push({
          id,
          runId: overlay.runId,
          ...(focusTaskId ? { taskId: focusTaskId } : {}),
          kind: "impact",
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          sourceActivityIds: [],
          label: "impact (inferred)",
          inferred: true,
        });
        impactCount += 1;
      }
    }
  }

  return canvasEdges;
}

/** Task id to emphasize: any running activity's task, else the latest started task. */
export function resolveCurrentTaskId(
  overlay: ExecutionOverlay | null | undefined,
): string | null {
  if (!overlay) return null;
  const activities = Object.values(overlay.activitiesById);
  const runningWithTask = activities
    .filter((item) => item.status === "running" && item.taskId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  if (runningWithTask[0]?.taskId) return runningWithTask[0].taskId;

  const withTask = activities
    .filter((item) => item.taskId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return withTask[0]?.taskId ?? null;
}

export function listNodeActivities(
  overlay: ExecutionOverlay | null | undefined,
  nodeId: string,
): LiveNodeActivity[] {
  if (!overlay) return [];
  const ids = overlay.activityIdsByNodeId[nodeId] ?? [];
  return ids
    .map((id) => overlay.activitiesById[id])
    .filter((item): item is LiveNodeActivity => Boolean(item))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function listTaskActivities(
  overlay: ExecutionOverlay | null | undefined,
  taskId: string,
): LiveNodeActivity[] {
  if (!overlay) return [];
  return Object.values(overlay.activitiesById)
    .filter((item) => item.taskId === taskId)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** Node ids touched by a task (or whole run when taskId is null). */
export function focusNodeIdSet(
  overlay: ExecutionOverlay | null | undefined,
  taskId: string | null,
): Set<string> {
  const ids = new Set<string>();
  if (!overlay) return ids;
  for (const activity of Object.values(overlay.activitiesById)) {
    if (taskId && activity.taskId !== taskId) continue;
    for (const nodeId of activity.nodeIds) ids.add(nodeId);
  }
  return ids;
}

/**
 * Map a live activity to Agent Flow activity ids (shared event truth).
 * file_read → eventId; diff_proposed → `${eventId}:${path}`.
 */
export function agentFlowActivityIdsForLive(
  activity: LiveNodeActivity,
): string[] {
  const ids: string[] = [];
  for (const eventId of activity.sourceEventIds) {
    ids.push(eventId);
    if (
      activity.path &&
      (activity.kind === "editing" ||
        activity.kind === "creating" ||
        activity.kind === "failed")
    ) {
      ids.push(`${eventId}:${activity.path}`);
    }
  }
  return [...new Set(ids)];
}

export function listTouchedPathsForNode(
  overlay: ExecutionOverlay | null | undefined,
  nodeId: string,
): string[] {
  const paths = new Set<string>();
  for (const activity of listNodeActivities(overlay, nodeId)) {
    if (activity.path) paths.add(activity.path);
  }
  return [...paths];
}

/**
 * Path-level change rows for the Live Changes section.
 * Running edits stay active; otherwise the newest terminal edit wins per path.
 */
export function listNodeChangeEntries(
  overlay: ExecutionOverlay | null | undefined,
  nodeId: string,
): LiveNodeChangeEntry[] {
  const byPath = new Map<string, LiveNodeActivity[]>();
  for (const activity of listNodeActivities(overlay, nodeId)) {
    if (!isEditChangeActivity(activity)) continue;
    const group = byPath.get(activity.path) ?? [];
    group.push(activity);
    byPath.set(activity.path, group);
  }

  const entries: LiveNodeChangeEntry[] = [];
  for (const [path, group] of byPath) {
    const running = group
      .filter((item) => item.status === "running")
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const representative =
      running[0] ??
      [...group].sort((a, b) =>
        changeRecencyKey(b).localeCompare(changeRecencyKey(a)),
      )[0];
    if (!representative || !isEditChangeActivity(representative)) continue;
    entries.push({
      path,
      status: representative.status,
      kind: representative.kind,
      startedAt: representative.startedAt,
      ...(representative.completedAt
        ? { completedAt: representative.completedAt }
        : {}),
      activityId: representative.id,
      label: representative.label,
    });
  }

  return entries.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function listEditedPathsForNode(
  overlay: ExecutionOverlay | null | undefined,
  nodeId: string,
): string[] {
  return listNodeChangeEntries(overlay, nodeId).map((entry) => entry.path);
}
