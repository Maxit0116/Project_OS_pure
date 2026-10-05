import { z } from "zod";
import type {
  MapArtifact,
  MapArtifactPosition,
  MapArtifactSize,
  MapContentDocument,
} from "./map-content.js";
import {
  MAP_ARTIFACT_MAX_ABSOLUTE_POSITION,
  MAP_ARTIFACT_MAX_SIZE,
} from "./map-artifact-geometry-limits.js";
import { getActiveStackMember, getStackMembers } from "./map-artifact-stack.js";

/** Inset between the dashed frame and the member union (frame still hugs that padded AABB). */
export const WORK_GROUP_PADDING = 12;
export const WORK_GROUP_TITLE_BAR_HEIGHT = 32;
export const WORK_GROUP_GRID_CELL = 8;
export const WORK_GROUP_SNAP_EPSILON = 0.5;
/**
 * Visual gap between sticky-adjacent members. Layout/snap keep contact across this gap
 * (neighbors stay “stuck”); the gap is also the seam for edge resize handles.
 */
export const WORK_GROUP_MEMBER_GAP = 4;

export const MAP_WORK_GROUP_LIMITS = {
  workGroupsPerDocument: 1_024,
  memberNodeIdsPerGroup: 4_096,
  stackMembers: 4_096,
} as const;

/**
 * True when two facing edges should count as sticky-adjacent: flush (0) through
 * WORK_GROUP_MEMBER_GAP (inclusive, with epsilon).
 */
export function isWorkGroupContactSeparation(
  trailingEdge: number,
  leadingEdge: number,
  epsilon = WORK_GROUP_SNAP_EPSILON,
  gap = WORK_GROUP_MEMBER_GAP,
): boolean {
  const separation = leadingEdge - trailingEdge;
  return separation >= -epsilon && separation <= gap + epsilon;
}

export const MapWorkGroupSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    memberNodeIds: z
      .array(z.string().min(1))
      .min(1)
      .max(MAP_WORK_GROUP_LIMITS.memberNodeIdsPerGroup)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Work-group member node IDs must be unique",
      }),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

export type MapWorkGroup = z.infer<typeof MapWorkGroupSchema>;

export interface BoundsRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function nextWorkGroupTitle(seq: number): string {
  return `Workgroup ${seq}`;
}

export function getWorkGroupMemberNodeId(artifact: MapArtifact): string {
  return artifact.stackId ?? artifact.id;
}

export function getArtifactsForMemberNodeId(
  artifacts: MapArtifact[],
  memberNodeId: string,
): MapArtifact[] {
  const stackMembers = getStackMembers(artifacts, memberNodeId);
  if (stackMembers.length > 0) {
    return stackMembers;
  }
  const solo = artifacts.find((artifact) => artifact.id === memberNodeId);
  return solo ? [solo] : [];
}

export function getMemberNodeBounds(
  artifacts: MapArtifact[],
  memberNodeId: string,
): BoundsRect | null {
  const members = getArtifactsForMemberNodeId(artifacts, memberNodeId);
  if (members.length === 0) {
    return null;
  }
  const active = getActiveStackMember(members);
  return {
    id: memberNodeId,
    x: active.position.x,
    y: active.position.y,
    width: active.size.width,
    height: active.size.height,
  };
}

export function collectCanvasUnitBounds(
  artifacts: MapArtifact[],
  memberNodeIds: Iterable<string>,
): BoundsRect[] {
  const bounds: BoundsRect[] = [];
  for (const memberNodeId of memberNodeIds) {
    const rect = getMemberNodeBounds(artifacts, memberNodeId);
    if (rect) {
      bounds.push(rect);
    }
  }
  return bounds;
}

export function resolveWorkGroupColumnOrigin(
  artifacts: MapArtifact[],
  memberNodeIds: string[],
  origin?: { x: number; y: number },
): { x: number; y: number } {
  if (origin) {
    return origin;
  }
  const bounds = collectCanvasUnitBounds(artifacts, memberNodeIds);
  const union = computeUnionBounds(bounds);
  if (!union) {
    return { x: 0, y: 0 };
  }
  return { x: union.x, y: union.y };
}

export function computeWorkGroupColumnPositions(
  artifacts: MapArtifact[],
  memberNodeIds: string[],
  origin: { x: number; y: number },
): Map<string, MapArtifactPosition> {
  const positions = new Map<string, MapArtifactPosition>();
  let currentY = origin.y;
  for (const memberNodeId of memberNodeIds) {
    const bounds = getMemberNodeBounds(artifacts, memberNodeId);
    if (!bounds) {
      continue;
    }
    positions.set(memberNodeId, { x: origin.x, y: currentY });
    currentY += bounds.height + WORK_GROUP_MEMBER_GAP;
  }
  return positions;
}

export function arrangeWorkGroupMembersInColumn(
  artifacts: MapArtifact[],
  memberNodeIds: string[],
  origin: { x: number; y: number },
): MapArtifact[] {
  const positions = computeWorkGroupColumnPositions(artifacts, memberNodeIds, origin);
  let next = artifacts;
  for (const [memberNodeId, position] of positions) {
    next = updateMemberPosition(next, memberNodeId, position);
  }
  return next;
}

export function computeWorkGroupAppendAnchor(
  artifacts: MapArtifact[],
  anchoredMemberIds: string[],
): MapArtifactPosition | null {
  const bounds = collectCanvasUnitBounds(artifacts, anchoredMemberIds);
  if (bounds.length === 0) {
    return null;
  }
  let maxBottom = -Infinity;
  for (const rect of bounds) {
    maxBottom = Math.max(maxBottom, rect.y + rect.height);
  }
  // Left-align to the bottommost row (not the whole group's minX), so new
  // members sit flush under the lowest card and share its left edge.
  let alignX = Infinity;
  for (const rect of bounds) {
    if (Math.abs(rect.y + rect.height - maxBottom) <= WORK_GROUP_SNAP_EPSILON) {
      alignX = Math.min(alignX, rect.x);
    }
  }
  if (!Number.isFinite(alignX)) {
    alignX = bounds.reduce((min, rect) => Math.min(min, rect.x), Infinity);
  }
  return { x: alignX, y: maxBottom + WORK_GROUP_MEMBER_GAP };
}

export function orderNewWorkGroupMemberIdsBySelection(
  document: MapContentDocument,
  items: WorkGroupSelectionItem[],
  primaryGroupId: string,
  newMemberIds: string[],
): string[] {
  const remaining = new Set(newMemberIds);
  const ordered: string[] = [];

  const pushMember = (memberNodeId: string) => {
    if (!remaining.has(memberNodeId)) {
      return;
    }
    ordered.push(memberNodeId);
    remaining.delete(memberNodeId);
  };

  for (const item of items) {
    if (item.kind === "member") {
      pushMember(item.memberNodeId);
      continue;
    }
    if (item.workGroupId === primaryGroupId) {
      continue;
    }
    const group = document.workGroups.find((candidate) => candidate.id === item.workGroupId);
    if (!group) {
      continue;
    }
    for (const memberNodeId of group.memberNodeIds) {
      pushMember(memberNodeId);
    }
  }

  for (const memberNodeId of newMemberIds) {
    pushMember(memberNodeId);
  }

  return ordered;
}

export function appendWorkGroupMembersBelowAnchor(
  artifacts: MapArtifact[],
  memberNodeIds: string[],
  anchor: MapArtifactPosition,
): MapArtifact[] {
  return arrangeWorkGroupMembersInColumn(artifacts, memberNodeIds, anchor);
}

export function reconcileWorkGroupMemberLayout(
  document: MapContentDocument,
  artifacts: MapArtifact[],
  activeGroupMemberIds: string[],
  items: WorkGroupSelectionItem[],
  involvedGroupIds: Set<string>,
  primaryGroupId: string | null,
  origin?: { x: number; y: number },
): MapArtifact[] {
  if (activeGroupMemberIds.length <= 1) {
    return artifacts;
  }

  const targetGroupId =
    primaryGroupId !== null && involvedGroupIds.has(primaryGroupId)
      ? primaryGroupId
      : involvedGroupIds.size > 0
        ? [...involvedGroupIds][0]!
        : null;
  const anchoredGroup = targetGroupId
    ? document.workGroups.find((group) => group.id === targetGroupId)
    : undefined;

  // Always append new members under the target group's bottommost card and
  // left-align to that card — even when the current layout is already valid
  // (e.g. touching vertically but horizontally offset).
  if (anchoredGroup) {
    const anchoredMemberIds = anchoredGroup.memberNodeIds;
    const newMemberIds = activeGroupMemberIds.filter(
      (memberNodeId) => !anchoredMemberIds.includes(memberNodeId),
    );
    if (newMemberIds.length > 0) {
      const anchor = computeWorkGroupAppendAnchor(artifacts, anchoredMemberIds);
      if (anchor) {
        const orderedNewMemberIds = orderNewWorkGroupMemberIdsBySelection(
          document,
          items,
          anchoredGroup.id,
          newMemberIds,
        );
        return appendWorkGroupMembersBelowAnchor(artifacts, orderedNewMemberIds, anchor);
      }
    }
  }

  const memberBounds = collectCanvasUnitBounds(artifacts, activeGroupMemberIds);
  if (isValidWorkGroupLayout(memberBounds)) {
    return artifacts;
  }

  const columnOrigin = resolveWorkGroupColumnOrigin(artifacts, activeGroupMemberIds, origin);
  return arrangeWorkGroupMembersInColumn(artifacts, activeGroupMemberIds, columnOrigin);
}

export function computeUnionBounds(bounds: BoundsRect[]): BoundsRect | null {
  if (bounds.length === 0) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of bounds) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return {
    id: "union",
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Axis-aligned frame that wraps members: left/right/bottom flush with the member
 * union (plus WORK_GROUP_PADDING), title bar stacked above the union.
 * Growing or shrinking any edge-defining member updates this AABB so the dashed
 * frame never leaves a gap or undershoots members.
 */
export function computeWorkGroupFrameBounds(memberBounds: BoundsRect[]): BoundsRect | null {
  const union = computeUnionBounds(memberBounds);
  if (!union) {
    return null;
  }
  return {
    id: "frame",
    x: union.x - WORK_GROUP_PADDING,
    y: union.y - WORK_GROUP_PADDING - WORK_GROUP_TITLE_BAR_HEIGHT,
    width: union.width + WORK_GROUP_PADDING * 2,
    height: union.height + WORK_GROUP_PADDING * 2 + WORK_GROUP_TITLE_BAR_HEIGHT,
  };
}

function perpendicularOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
}

export function buildAdjacencyGraph(
  bounds: BoundsRect[],
  epsilon = WORK_GROUP_SNAP_EPSILON,
  minOverlap = 24,
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const rect of bounds) {
    graph.set(rect.id, new Set());
  }

  for (let i = 0; i < bounds.length; i++) {
    for (let j = i + 1; j < bounds.length; j++) {
      const a = bounds[i]!;
      const b = bounds[j]!;
      const aRight = a.x + a.width;
      const bRight = b.x + b.width;
      const aBottom = a.y + a.height;
      const bBottom = b.y + b.height;

      const touchHorizontally =
        (isWorkGroupContactSeparation(aRight, b.x, epsilon) ||
          isWorkGroupContactSeparation(bRight, a.x, epsilon)) &&
        perpendicularOverlap(a.y, aBottom, b.y, bBottom) >= minOverlap;
      const touchVertically =
        (isWorkGroupContactSeparation(aBottom, b.y, epsilon) ||
          isWorkGroupContactSeparation(bBottom, a.y, epsilon)) &&
        perpendicularOverlap(a.x, aRight, b.x, bRight) >= minOverlap;

      if (touchHorizontally || touchVertically) {
        graph.get(a.id)!.add(b.id);
        graph.get(b.id)!.add(a.id);
      }
    }
  }

  return graph;
}

export type WorkGroupResizeEdge = "east" | "west" | "north" | "south";

export interface WorkGroupResizeDeltas {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function computeWorkGroupResizeDeltas(
  prev: BoundsRect,
  next: BoundsRect,
): WorkGroupResizeDeltas {
  return {
    left: next.x - prev.x,
    right: next.x + next.width - (prev.x + prev.width),
    top: next.y - prev.y,
    bottom: next.y + next.height - (prev.y + prev.height),
  };
}

function neighborSharesSide(
  origin: BoundsRect,
  neighbor: BoundsRect,
  side: WorkGroupResizeEdge,
  epsilon = WORK_GROUP_SNAP_EPSILON,
  minOverlap = 24,
): boolean {
  const oRight = origin.x + origin.width;
  const oBottom = origin.y + origin.height;
  const nRight = neighbor.x + neighbor.width;
  const nBottom = neighbor.y + neighbor.height;

  if (side === "east") {
    return (
      isWorkGroupContactSeparation(oRight, neighbor.x, epsilon) &&
      perpendicularOverlap(origin.y, oBottom, neighbor.y, nBottom) >= minOverlap
    );
  }
  if (side === "west") {
    return (
      isWorkGroupContactSeparation(nRight, origin.x, epsilon) &&
      perpendicularOverlap(origin.y, oBottom, neighbor.y, nBottom) >= minOverlap
    );
  }
  if (side === "south") {
    return (
      isWorkGroupContactSeparation(oBottom, neighbor.y, epsilon) &&
      perpendicularOverlap(origin.x, oRight, neighbor.x, nRight) >= minOverlap
    );
  }
  return (
    isWorkGroupContactSeparation(nBottom, origin.y, epsilon) &&
    perpendicularOverlap(origin.x, oRight, neighbor.x, nRight) >= minOverlap
  );
}

export function collectResizePushTargets(
  boundsById: Map<string, BoundsRect>,
  adjacency: Map<string, Set<string>>,
  resizedId: string,
  side: WorkGroupResizeEdge,
): Set<string> {
  const resized = boundsById.get(resizedId);
  if (!resized) {
    return new Set();
  }

  const seeds: string[] = [];
  for (const neighborId of adjacency.get(resizedId) ?? []) {
    const neighbor = boundsById.get(neighborId);
    if (!neighbor) {
      continue;
    }
    if (neighborSharesSide(resized, neighbor, side)) {
      seeds.push(neighborId);
    }
  }

  const targets = new Set<string>();
  const queue = [...seeds];
  for (const seed of seeds) {
    targets.add(seed);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighborId of adjacency.get(current) ?? []) {
      if (neighborId === resizedId || targets.has(neighborId)) {
        continue;
      }
      targets.add(neighborId);
      queue.push(neighborId);
    }
  }

  return targets;
}

/**
 * Given previous/next bounds of a resized member, compute new positions for
 * other workgroup members that must move to keep edge-adjacent sticky contact.
 * The resized member is included at `next`'s position for convenience.
 */
export function propagateWorkGroupMemberResize(
  memberBounds: BoundsRect[],
  resizedId: string,
  prev: BoundsRect,
  next: BoundsRect,
): Map<string, MapArtifactPosition> {
  const positions = new Map<string, MapArtifactPosition>();
  for (const rect of memberBounds) {
    positions.set(rect.id, { x: rect.x, y: rect.y });
  }
  positions.set(resizedId, { x: next.x, y: next.y });

  if (memberBounds.length <= 1) {
    return positions;
  }

  const deltas = computeWorkGroupResizeDeltas(prev, next);
  const boundsById = new Map(memberBounds.map((rect) => [rect.id, rect]));
  // Use pre-resize adjacency so neighbors are identified against edges before the drag.
  const adjacency = buildAdjacencyGraph(memberBounds);

  const translations = new Map<string, { dx: number; dy: number }>();
  const addTranslation = (memberId: string, dx: number, dy: number) => {
    if (memberId === resizedId) {
      return;
    }
    const current = translations.get(memberId) ?? { dx: 0, dy: 0 };
    translations.set(memberId, { dx: current.dx + dx, dy: current.dy + dy });
  };

  // Horizontal first, then vertical (corner / aspect-ratio resizes).
  if (Math.abs(deltas.right) > WORK_GROUP_SNAP_EPSILON) {
    for (const id of collectResizePushTargets(boundsById, adjacency, resizedId, "east")) {
      addTranslation(id, deltas.right, 0);
    }
  }
  if (Math.abs(deltas.left) > WORK_GROUP_SNAP_EPSILON) {
    for (const id of collectResizePushTargets(boundsById, adjacency, resizedId, "west")) {
      addTranslation(id, deltas.left, 0);
    }
  }
  if (Math.abs(deltas.bottom) > WORK_GROUP_SNAP_EPSILON) {
    for (const id of collectResizePushTargets(boundsById, adjacency, resizedId, "south")) {
      addTranslation(id, 0, deltas.bottom);
    }
  }
  if (Math.abs(deltas.top) > WORK_GROUP_SNAP_EPSILON) {
    for (const id of collectResizePushTargets(boundsById, adjacency, resizedId, "north")) {
      addTranslation(id, 0, deltas.top);
    }
  }

  for (const [memberId, { dx, dy }] of translations) {
    const base = boundsById.get(memberId);
    if (!base) {
      continue;
    }
    positions.set(memberId, { x: base.x + dx, y: base.y + dy });
  }

  return positions;
}

export function findConnectedComponents(
  memberIds: string[],
  adjacency: Map<string, Set<string>>,
): string[][] {
  const remaining = new Set(memberIds);
  const components: string[][] = [];

  while (remaining.size > 0) {
    const start = remaining.values().next().value!;
    remaining.delete(start);
    const component: string[] = [start];
    const queue = [start];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!remaining.has(neighbor)) {
          continue;
        }
        remaining.delete(neighbor);
        component.push(neighbor);
        queue.push(neighbor);
      }
    }

    components.push(component);
  }

  return components;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function rasterizeBounds(bounds: BoundsRect[], cellSize: number): Set<string> {
  const occupied = new Set<string>();
  for (const rect of bounds) {
    const startX = Math.floor(rect.x / cellSize);
    const startY = Math.floor(rect.y / cellSize);
    const endX = Math.ceil((rect.x + rect.width) / cellSize);
    const endY = Math.ceil((rect.y + rect.height) / cellSize);
    for (let x = startX; x < endX; x++) {
      for (let y = startY; y < endY; y++) {
        occupied.add(cellKey(x, y));
      }
    }
  }
  return occupied;
}

function hasInteriorHoles(occupied: Set<string>): boolean {
  if (occupied.size === 0) {
    return false;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const key of occupied) {
    const [xs, ys] = key.split(",");
    const x = Number(xs);
    const y = Number(ys);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const outside = new Set<string>();
  const queue: Array<{ x: number; y: number }> = [];

  const tryEnqueue = (x: number, y: number) => {
    const key = cellKey(x, y);
    if (x < minX - 1 || y < minY - 1 || x > maxX + 1 || y > maxY + 1) {
      return;
    }
    if (occupied.has(key) || outside.has(key)) {
      return;
    }
    outside.add(key);
    queue.push({ x, y });
  };

  for (let x = minX - 1; x <= maxX + 1; x++) {
    tryEnqueue(x, minY - 1);
    tryEnqueue(x, maxY + 1);
  }
  for (let y = minY; y <= maxY; y++) {
    tryEnqueue(minX - 1, y);
    tryEnqueue(maxX + 1, y);
  }

  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    tryEnqueue(x + 1, y);
    tryEnqueue(x - 1, y);
    tryEnqueue(x, y + 1);
    tryEnqueue(x, y - 1);
  }

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const key = cellKey(x, y);
      if (!occupied.has(key) && !outside.has(key)) {
        return true;
      }
    }
  }

  return false;
}

export function isValidWorkGroupLayout(
  memberBounds: BoundsRect[],
  cellSize = WORK_GROUP_GRID_CELL,
): boolean {
  if (memberBounds.length <= 1) {
    return true;
  }

  const adjacency = buildAdjacencyGraph(memberBounds);
  const components = findConnectedComponents(
    memberBounds.map((rect) => rect.id),
    adjacency,
  );
  if (components.length !== 1) {
    return false;
  }

  const occupied = rasterizeBounds(
    expandBoundsForContactOccupancy(memberBounds, WORK_GROUP_MEMBER_GAP),
    cellSize,
  );
  if (hasInteriorHoles(occupied)) {
    return false;
  }

  return true;
}

/** Dilate members so a WORK_GROUP_MEMBER_GAP seam does not count as an interior hole. */
function expandBoundsForContactOccupancy(
  bounds: BoundsRect[],
  gap: number,
): BoundsRect[] {
  if (gap <= 0) {
    return bounds;
  }
  const half = gap / 2;
  return bounds.map((rect) => ({
    ...rect,
    x: rect.x - half,
    y: rect.y - half,
    width: rect.width + gap,
    height: rect.height + gap,
  }));
}

export function setWorkGroupIdOnMember(
  artifacts: MapArtifact[],
  memberNodeId: string,
  workGroupId: string | null,
): MapArtifact[] {
  const now = new Date().toISOString();
  return artifacts.map((artifact) => {
    const nodeId = getWorkGroupMemberNodeId(artifact);
    if (nodeId !== memberNodeId) {
      return artifact;
    }
    if ((artifact.workGroupId ?? null) === workGroupId) {
      return artifact;
    }
    return {
      ...artifact,
      workGroupId: workGroupId ?? undefined,
      updatedAt: now,
    };
  });
}

export function setWorkGroupIdOnMembers(
  artifacts: MapArtifact[],
  memberNodeIds: string[],
  workGroupId: string | null,
): MapArtifact[] {
  let next = artifacts;
  for (const memberNodeId of memberNodeIds) {
    next = setWorkGroupIdOnMember(next, memberNodeId, workGroupId);
  }
  return next;
}

export function updateMemberPosition(
  artifacts: MapArtifact[],
  memberNodeId: string,
  position: MapArtifactPosition,
): MapArtifact[] {
  const members = getArtifactsForMemberNodeId(artifacts, memberNodeId);
  if (members.length === 0) {
    return artifacts;
  }
  const anchor = getActiveStackMember(members);
  const now = new Date().toISOString();
  return artifacts.map((artifact) => {
    const nodeId = getWorkGroupMemberNodeId(artifact);
    if (nodeId !== memberNodeId) {
      return artifact;
    }
    if (artifact.stackId) {
      if (artifact.id !== anchor.id && artifact.position.x === position.x && artifact.position.y === position.y) {
        return artifact;
      }
    }
    if (artifact.position.x === position.x && artifact.position.y === position.y) {
      return artifact;
    }
    return {
      ...artifact,
      position,
      updatedAt: now,
    };
  });
}

export function updateMemberSize(
  artifacts: MapArtifact[],
  memberNodeId: string,
  size: MapArtifactSize,
): MapArtifact[] {
  const members = getArtifactsForMemberNodeId(artifacts, memberNodeId);
  if (members.length === 0) {
    return artifacts;
  }
  const now = new Date().toISOString();
  return artifacts.map((artifact) => {
    const nodeId = getWorkGroupMemberNodeId(artifact);
    if (nodeId !== memberNodeId) {
      return artifact;
    }
    if (artifact.size.width === size.width && artifact.size.height === size.height) {
      return artifact;
    }
    return {
      ...artifact,
      size,
      updatedAt: now,
    };
  });
}

export function moveWorkGroupMembers(
  artifacts: MapArtifact[],
  memberNodeIds: string[],
  delta: MapArtifactPosition,
): MapArtifact[] {
  let next = artifacts;
  for (const memberNodeId of memberNodeIds) {
    const bounds = getMemberNodeBounds(next, memberNodeId);
    if (!bounds) {
      continue;
    }
    next = updateMemberPosition(next, memberNodeId, {
      x: bounds.x + delta.x,
      y: bounds.y + delta.y,
    });
  }
  return next;
}

function createWorkGroupRecord(
  id: string,
  memberNodeIds: string[],
  seq: number,
  now: string,
): MapWorkGroup {
  return {
    id,
    title: nextWorkGroupTitle(seq),
    memberNodeIds: [...new Set(memberNodeIds)],
    createdAt: now,
    updatedAt: now,
  };
}

export function dissolveWorkGroup(
  document: MapContentDocument,
  workGroupId: string,
): MapContentDocument {
  const group = document.workGroups.find((item) => item.id === workGroupId);
  if (!group) {
    return document;
  }
  return {
    ...document,
    workGroups: document.workGroups.filter((item) => item.id !== workGroupId),
    artifacts: setWorkGroupIdOnMembers(document.artifacts, group.memberNodeIds, null),
  };
}

function replaceMemberNodeId(
  workGroups: MapWorkGroup[],
  oldMemberNodeId: string,
  newMemberNodeId: string,
): MapWorkGroup[] {
  const now = new Date().toISOString();
  return workGroups.map((group) => {
    if (!group.memberNodeIds.includes(oldMemberNodeId)) {
      return group;
    }
    const memberNodeIds = group.memberNodeIds.map((id) =>
      id === oldMemberNodeId ? newMemberNodeId : id,
    );
    return {
      ...group,
      memberNodeIds: [...new Set(memberNodeIds)],
      updatedAt: now,
    };
  });
}

export function maintainWorkGroupAfterStackDissolve(
  document: MapContentDocument,
  stackId: string,
  survivorArtifactId: string,
): MapContentDocument {
  return {
    ...document,
    workGroups: replaceMemberNodeId(document.workGroups, stackId, survivorArtifactId),
  };
}

export function maintainWorkGroupAfterStackFormed(
  document: MapContentDocument,
  artifactIds: string[],
  stackId: string,
): MapContentDocument {
  const workGroupIds = new Set<string>();
  for (const artifactId of artifactIds) {
    const artifact = document.artifacts.find((item) => item.id === artifactId);
    if (artifact?.workGroupId) {
      workGroupIds.add(artifact.workGroupId);
    }
  }
  if (workGroupIds.size === 0) {
    return document;
  }

  let workGroups = document.workGroups;
  let artifacts = document.artifacts;
  const primaryWorkGroupId = [...workGroupIds][0]!;

  for (const artifactId of artifactIds) {
    const artifact = artifacts.find((item) => item.id === artifactId);
    if (!artifact) {
      continue;
    }
    const oldMemberNodeId = artifact.stackId ?? artifact.id;
    workGroups = replaceMemberNodeId(workGroups, oldMemberNodeId, stackId);
    artifacts = setWorkGroupIdOnMember(artifacts, stackId, primaryWorkGroupId);
  }

  if (workGroupIds.size > 1) {
    const mergedMemberIds = new Set<string>();
    const groupsToMerge = workGroups.filter((group) => workGroupIds.has(group.id));
    for (const group of groupsToMerge) {
      for (const memberNodeId of group.memberNodeIds) {
        mergedMemberIds.add(memberNodeId);
      }
    }
    const now = new Date().toISOString();
    const primaryGroup = workGroups.find((group) => group.id === primaryWorkGroupId)!;
    const mergedGroup: MapWorkGroup = {
      ...primaryGroup,
      memberNodeIds: [...mergedMemberIds],
      updatedAt: now,
    };
    workGroups = workGroups
      .filter((group) => !workGroupIds.has(group.id) || group.id === primaryWorkGroupId)
      .map((group) => (group.id === primaryWorkGroupId ? mergedGroup : group));
    artifacts = setWorkGroupIdOnMembers(artifacts, [...mergedMemberIds], primaryWorkGroupId);
  }

  return {
    ...document,
    workGroups,
    artifacts,
  };
}

export interface ApplyMapWorkGroupMutationOptions {
  createWorkGroupId?: () => string;
}

function defaultCreateWorkGroupId(): string {
  return `wg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function finalizeWorkGroupsAfterMemberChange(
  document: MapContentDocument,
  affectedMemberNodeIds: string[],
  createWorkGroupId: () => string,
): MapContentDocument {
  let next = document;
  const now = new Date().toISOString();

  for (const memberNodeId of affectedMemberNodeIds) {
    const group = next.workGroups.find((item) => item.memberNodeIds.includes(memberNodeId));
    if (!group) {
      continue;
    }

    const memberBounds = collectCanvasUnitBounds(next.artifacts, group.memberNodeIds);
    if (memberBounds.length <= 1) {
      next = dissolveWorkGroup(next, group.id);
      continue;
    }

    const adjacency = buildAdjacencyGraph(memberBounds);
    const components = findConnectedComponents(
      memberBounds.map((rect) => rect.id),
      adjacency,
    );

    if (components.length === 1) {
      if (!isValidWorkGroupLayout(memberBounds)) {
        continue;
      }
      continue;
    }

    const survivingGroupId = group.id;
    const updatedGroups = next.workGroups.filter((item) => item.id !== group.id);
    let artifacts = setWorkGroupIdOnMembers(next.artifacts, group.memberNodeIds, null);
    let workGroupSeq = next.workGroupSeq;

    const newGroups: MapWorkGroup[] = [];
    for (const component of components) {
      if (component.length === 1) {
        continue;
      }
      const componentBounds = collectCanvasUnitBounds(artifacts, component);
      if (!isValidWorkGroupLayout(componentBounds)) {
        continue;
      }
      workGroupSeq += 1;
      const id =
        newGroups.length === 0 && component === components[0]
          ? survivingGroupId
          : createWorkGroupId();
      const record = createWorkGroupRecord(id, component, workGroupSeq, now);
      if (newGroups.length === 0) {
        record.title = group.title;
      }
      newGroups.push(record);
      artifacts = setWorkGroupIdOnMembers(artifacts, component, record.id);
    }

    next = {
      ...next,
      workGroupSeq,
      workGroups: [...updatedGroups, ...newGroups],
      artifacts,
    };
  }

  return next;
}

const WorkGroupMutationPositionSchema = z
  .object({
    x: z
      .number()
      .finite()
      .min(-MAP_ARTIFACT_MAX_ABSOLUTE_POSITION)
      .max(MAP_ARTIFACT_MAX_ABSOLUTE_POSITION),
    y: z
      .number()
      .finite()
      .min(-MAP_ARTIFACT_MAX_ABSOLUTE_POSITION)
      .max(MAP_ARTIFACT_MAX_ABSOLUTE_POSITION),
  })
  .strict();

const WorkGroupMutationSizeSchema = z
  .object({
    width: z.number().finite().positive().max(MAP_ARTIFACT_MAX_SIZE.width),
    height: z.number().finite().positive().max(MAP_ARTIFACT_MAX_SIZE.height),
  })
  .strict();

export const SnapJoinWorkGroupMutationSchema = z
  .object({
    type: z.literal("snap_join"),
    draggedMemberNodeId: z.string(),
    targetMemberNodeId: z.string(),
    position: WorkGroupMutationPositionSchema,
  })
  .strict();

export const DetachWorkGroupMutationSchema = z
  .object({
    type: z.literal("detach"),
    memberNodeId: z.string(),
    position: WorkGroupMutationPositionSchema,
  })
  .strict();

export const MoveWorkGroupMutationSchema = z
  .object({
    type: z.literal("move_group"),
    workGroupId: z.string(),
    delta: WorkGroupMutationPositionSchema,
  })
  .strict();

export const WorkGroupSelectionItemSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("member"),
      memberNodeId: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("workgroup"),
      workGroupId: z.string(),
    })
    .strict(),
]);

export type WorkGroupSelectionItem = z.infer<typeof WorkGroupSelectionItemSchema>;

export const MergeOrCreateWorkGroupMutationSchema = z
  .object({
    type: z.literal("merge_or_create_group"),
    items: z.array(WorkGroupSelectionItemSchema),
    origin: WorkGroupMutationPositionSchema.optional(),
  })
  .strict();

export const ResizeMemberWorkGroupMutationSchema = z
  .object({
    type: z.literal("resize_member"),
    memberNodeId: z.string(),
    size: WorkGroupMutationSizeSchema,
    position: WorkGroupMutationPositionSchema,
  })
  .strict();

export const MapWorkGroupMutationInputSchema = z.discriminatedUnion("type", [
  SnapJoinWorkGroupMutationSchema,
  DetachWorkGroupMutationSchema,
  MoveWorkGroupMutationSchema,
  MergeOrCreateWorkGroupMutationSchema,
  ResizeMemberWorkGroupMutationSchema,
]);

export type MapWorkGroupMutationInput = z.infer<typeof MapWorkGroupMutationInputSchema>;

export const UpdateMapWorkGroupPatchSchema = z
  .object({
    title: z.string().optional(),
  })
  .strict();

export type UpdateMapWorkGroupPatch = z.infer<typeof UpdateMapWorkGroupPatchSchema>;

export function expandWorkGroupSelectionToMemberNodeIds(
  document: MapContentDocument,
  items: WorkGroupSelectionItem[],
): string[] {
  const memberNodeIds = new Set<string>();
  for (const item of items) {
    if (item.kind === "member") {
      memberNodeIds.add(item.memberNodeId);
      continue;
    }
    const group = document.workGroups.find((candidate) => candidate.id === item.workGroupId);
    if (!group) {
      continue;
    }
    for (const memberNodeId of group.memberNodeIds) {
      memberNodeIds.add(memberNodeId);
    }
  }
  return [...memberNodeIds];
}

function collectInvolvedWorkGroupIds(
  document: MapContentDocument,
  items: WorkGroupSelectionItem[],
  memberNodeIds: string[],
): Set<string> {
  const involved = new Set<string>();
  for (const item of items) {
    if (item.kind === "workgroup") {
      involved.add(item.workGroupId);
    }
  }
  for (const memberNodeId of memberNodeIds) {
    const group = document.workGroups.find((candidate) =>
      candidate.memberNodeIds.includes(memberNodeId),
    );
    if (group) {
      involved.add(group.id);
    }
  }
  return involved;
}

export function applyMergeOrCreateWorkGroup(
  document: MapContentDocument,
  items: WorkGroupSelectionItem[],
  options: ApplyMapWorkGroupMutationOptions & { origin?: { x: number; y: number } } = {},
): MapContentDocument {
  const memberNodeIds = expandWorkGroupSelectionToMemberNodeIds(document, items);
  if (memberNodeIds.length === 0) {
    return document;
  }

  const now = new Date().toISOString();
  const createWorkGroupId = options.createWorkGroupId ?? defaultCreateWorkGroupId;
  const involvedGroupIds = collectInvolvedWorkGroupIds(document, items, memberNodeIds);
  const primaryGroupId =
    items.find((item): item is Extract<WorkGroupSelectionItem, { kind: "workgroup" }> =>
      item.kind === "workgroup",
    )?.workGroupId ?? null;

  let artifacts = document.artifacts;
  let workGroups = [...document.workGroups];
  let workGroupSeq = document.workGroupSeq;

  if (involvedGroupIds.size === 0) {
    workGroupSeq += 1;
    const id = createWorkGroupId();
    const group = createWorkGroupRecord(id, memberNodeIds, workGroupSeq, now);
    workGroups.push(group);
    artifacts = setWorkGroupIdOnMembers(artifacts, memberNodeIds, group.id);
  } else {
    const targetGroupId =
      primaryGroupId && involvedGroupIds.has(primaryGroupId)
        ? primaryGroupId
        : [...involvedGroupIds][0]!;
    const mergedMemberIds = new Set<string>(memberNodeIds);

    for (const groupId of involvedGroupIds) {
      const group = workGroups.find((item) => item.id === groupId);
      if (!group) {
        continue;
      }
      for (const memberNodeId of group.memberNodeIds) {
        mergedMemberIds.add(memberNodeId);
      }
    }

    const finalMemberIds = [...mergedMemberIds];
    for (const groupId of involvedGroupIds) {
      if (groupId === targetGroupId) {
        continue;
      }
      workGroups = workGroups.filter((item) => item.id !== groupId);
    }
    workGroups = workGroups.map((item) =>
      item.id === targetGroupId
        ? {
            ...item,
            memberNodeIds: finalMemberIds,
            updatedAt: now,
          }
        : item,
    );
    artifacts = setWorkGroupIdOnMembers(artifacts, finalMemberIds, targetGroupId);
  }

  const activeGroupId =
    involvedGroupIds.size === 0
      ? workGroups[workGroups.length - 1]?.id
      : primaryGroupId && involvedGroupIds.has(primaryGroupId)
        ? primaryGroupId
        : [...involvedGroupIds][0];
  const activeGroup = workGroups.find((item) => item.id === activeGroupId);
  if (!activeGroup) {
    return document;
  }

  let memberBounds = collectCanvasUnitBounds(artifacts, activeGroup.memberNodeIds);
  artifacts = reconcileWorkGroupMemberLayout(
    document,
    artifacts,
    activeGroup.memberNodeIds,
    items,
    involvedGroupIds,
    primaryGroupId,
    options.origin,
  );
  memberBounds = collectCanvasUnitBounds(artifacts, activeGroup.memberNodeIds);

  if (!isValidWorkGroupLayout(memberBounds)) {
    throw new Error("invalid_work_group_layout");
  }

  return {
    ...document,
    workGroupSeq,
    artifacts,
    workGroups,
  };
}

export function applyResizeMemberWorkGroup(
  document: MapContentDocument,
  memberNodeId: string,
  size: MapArtifactSize,
  position: MapArtifactPosition,
): MapContentDocument {
  const prevBounds = getMemberNodeBounds(document.artifacts, memberNodeId);
  if (!prevBounds) {
    return document;
  }

  const nextBounds: BoundsRect = {
    id: memberNodeId,
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
  };

  let artifacts = updateMemberPosition(document.artifacts, memberNodeId, position);
  artifacts = updateMemberSize(artifacts, memberNodeId, size);

  const group = document.workGroups.find((item) => item.memberNodeIds.includes(memberNodeId));
  if (!group) {
    return {
      ...document,
      artifacts,
    };
  }

  const memberBounds = collectCanvasUnitBounds(document.artifacts, group.memberNodeIds);
  const propagated = propagateWorkGroupMemberResize(
    memberBounds,
    memberNodeId,
    prevBounds,
    nextBounds,
  );

  for (const [id, nextPosition] of propagated) {
    if (id === memberNodeId) {
      continue;
    }
    artifacts = updateMemberPosition(artifacts, id, nextPosition);
  }

  const workGroups = document.workGroups.map((item) =>
    item.id === group.id
      ? { ...item, updatedAt: new Date().toISOString() }
      : item,
  );

  const validatedBounds = collectCanvasUnitBounds(artifacts, group.memberNodeIds);
  if (!isValidWorkGroupLayout(validatedBounds)) {
    throw new Error("invalid_work_group_layout");
  }

  return {
    ...document,
    artifacts,
    workGroups,
  };
}

export function applyMapWorkGroupMutation(
  document: MapContentDocument,
  input: MapWorkGroupMutationInput,
  options: ApplyMapWorkGroupMutationOptions = {},
): MapContentDocument {
  const parsed = MapWorkGroupMutationInputSchema.parse(input);
  const now = new Date().toISOString();
  const createWorkGroupId = options.createWorkGroupId ?? defaultCreateWorkGroupId;
  const baseDocument = document;

  if (parsed.type === "resize_member") {
    return applyResizeMemberWorkGroup(
      baseDocument,
      parsed.memberNodeId,
      parsed.size,
      parsed.position,
    );
  }

  if (parsed.type === "move_group") {
    const group = baseDocument.workGroups.find((item) => item.id === parsed.workGroupId);
    if (!group) {
      return baseDocument;
    }
    const artifacts = moveWorkGroupMembers(baseDocument.artifacts, group.memberNodeIds, parsed.delta);
    const workGroups = baseDocument.workGroups.map((item) =>
      item.id === parsed.workGroupId ? { ...item, updatedAt: now } : item,
    );
    return {
      ...baseDocument,
      artifacts,
      workGroups,
    };
  }

  if (parsed.type === "detach") {
    let artifacts = updateMemberPosition(
      baseDocument.artifacts,
      parsed.memberNodeId,
      parsed.position,
    );
    const sourceGroup = baseDocument.workGroups.find((item) =>
      item.memberNodeIds.includes(parsed.memberNodeId),
    );
    if (!sourceGroup) {
      return { ...baseDocument, artifacts };
    }

    const remainingMemberIds = sourceGroup.memberNodeIds.filter(
      (id) => id !== parsed.memberNodeId,
    );
    artifacts = setWorkGroupIdOnMember(artifacts, parsed.memberNodeId, null);

    let workGroups = baseDocument.workGroups.map((item) =>
      item.id === sourceGroup.id
        ? {
            ...item,
            memberNodeIds: remainingMemberIds,
            updatedAt: now,
          }
        : item,
    );

    if (remainingMemberIds.length <= 1) {
      const dissolvedId = sourceGroup.id;
      workGroups = workGroups.filter((item) => item.id !== dissolvedId);
      if (remainingMemberIds.length === 1) {
        artifacts = setWorkGroupIdOnMember(artifacts, remainingMemberIds[0]!, null);
      }
    }

    let next: MapContentDocument = {
      ...baseDocument,
      artifacts,
      workGroups,
    };
    next = finalizeWorkGroupsAfterMemberChange(next, [parsed.memberNodeId, ...remainingMemberIds], createWorkGroupId);
    return next;
  }

  if (parsed.type === "merge_or_create_group") {
    return applyMergeOrCreateWorkGroup(baseDocument, parsed.items, {
      ...options,
      ...(parsed.origin === undefined ? {} : { origin: parsed.origin }),
    });
  }

  let artifacts = updateMemberPosition(
    baseDocument.artifacts,
    parsed.draggedMemberNodeId,
    parsed.position,
  );

  const draggedGroup = baseDocument.workGroups.find((item) =>
    item.memberNodeIds.includes(parsed.draggedMemberNodeId),
  );
  const targetGroup = baseDocument.workGroups.find((item) =>
    item.memberNodeIds.includes(parsed.targetMemberNodeId),
  );

  let workGroups = [...baseDocument.workGroups];
  let workGroupSeq = baseDocument.workGroupSeq;

  if (!draggedGroup && !targetGroup) {
    workGroupSeq += 1;
    const id = createWorkGroupId();
    const group = createWorkGroupRecord(
      id,
      [parsed.draggedMemberNodeId, parsed.targetMemberNodeId],
      workGroupSeq,
      now,
    );
    workGroups.push(group);
    artifacts = setWorkGroupIdOnMembers(artifacts, group.memberNodeIds, group.id);
  } else if (draggedGroup && !targetGroup) {
    const group = draggedGroup;
    const memberNodeIds = [...new Set([...group.memberNodeIds, parsed.targetMemberNodeId])];
    workGroups = workGroups.map((item) =>
      item.id === group.id ? { ...item, memberNodeIds, updatedAt: now } : item,
    );
    artifacts = setWorkGroupIdOnMember(artifacts, parsed.targetMemberNodeId, group.id);
  } else if (!draggedGroup && targetGroup) {
    const group = targetGroup;
    const memberNodeIds = [...new Set([...group.memberNodeIds, parsed.draggedMemberNodeId])];
    workGroups = workGroups.map((item) =>
      item.id === group.id ? { ...item, memberNodeIds, updatedAt: now } : item,
    );
    artifacts = setWorkGroupIdOnMember(artifacts, parsed.draggedMemberNodeId, group.id);
  } else if (draggedGroup && targetGroup && draggedGroup.id !== targetGroup.id) {
    const mergedMemberIds = [
      ...new Set([...draggedGroup.memberNodeIds, ...targetGroup.memberNodeIds]),
    ];
    const mergedGroup: MapWorkGroup = {
      ...targetGroup,
      memberNodeIds: mergedMemberIds,
      updatedAt: now,
    };
    workGroups = workGroups
      .filter((item) => item.id !== draggedGroup.id)
      .map((item) => (item.id === targetGroup.id ? mergedGroup : item));
    artifacts = setWorkGroupIdOnMembers(artifacts, mergedMemberIds, targetGroup.id);
  }

  const activeGroup =
    workGroups.find((item) => item.memberNodeIds.includes(parsed.draggedMemberNodeId)) ??
    workGroups.find((item) => item.memberNodeIds.includes(parsed.targetMemberNodeId));

  if (!activeGroup) {
    return baseDocument;
  }

  const memberBounds = collectCanvasUnitBounds(artifacts, activeGroup.memberNodeIds);
  if (!isValidWorkGroupLayout(memberBounds)) {
    throw new Error("invalid_work_group_layout");
  }

  return {
    ...baseDocument,
    workGroupSeq,
    artifacts,
    workGroups,
  };
}

export function removeMemberFromWorkGroups(
  document: MapContentDocument,
  memberNodeId: string,
): MapContentDocument {
  const group = document.workGroups.find((item) => item.memberNodeIds.includes(memberNodeId));
  if (!group) {
    return document;
  }

  const remainingMemberIds = group.memberNodeIds.filter((id) => id !== memberNodeId);
  let artifacts = setWorkGroupIdOnMember(document.artifacts, memberNodeId, null);
  let workGroups = document.workGroups.map((item) =>
    item.id === group.id
      ? {
          ...item,
          memberNodeIds: remainingMemberIds,
          updatedAt: new Date().toISOString(),
        }
      : item,
  );

  if (remainingMemberIds.length <= 1) {
    workGroups = workGroups.filter((item) => item.id !== group.id);
    if (remainingMemberIds.length === 1) {
      artifacts = setWorkGroupIdOnMember(artifacts, remainingMemberIds[0]!, null);
    }
  }

  let next: MapContentDocument = {
    ...document,
    artifacts,
    workGroups,
  };
  next = finalizeWorkGroupsAfterMemberChange(next, [memberNodeId, ...remainingMemberIds], defaultCreateWorkGroupId);
  return next;
}

export function updateMapWorkGroupTitle(
  document: MapContentDocument,
  workGroupId: string,
  patch: UpdateMapWorkGroupPatch,
): MapContentDocument {
  const parsed = UpdateMapWorkGroupPatchSchema.parse(patch);
  const now = new Date().toISOString();
  return {
    ...document,
    workGroups: document.workGroups.map((group) =>
      group.id === workGroupId
        ? {
            ...group,
            ...(parsed.title !== undefined ? { title: parsed.title } : {}),
            updatedAt: now,
          }
        : group,
    ),
  };
}
