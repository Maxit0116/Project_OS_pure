import { z } from "zod";

import {
  isConfigNode,
  withArchitectureDefaults,
} from "./loop-node-architecture.js";

/** Inset between the dashed frame and the member union AABB. */
export const LOOP_WORK_GROUP_PADDING = 16;
export const LOOP_WORK_GROUP_TITLE_BAR_HEIGHT = 28;

/** Gap between surface-agent chips in the L1 matrix (not a free canvas). */
export const LOOP_WORK_GROUP_MATRIX_GAP_X = 10;
export const LOOP_WORK_GROUP_MATRIX_GAP_Y = 8;
/** Cap columns so squads stay a compact rectangle. */
export const LOOP_WORK_GROUP_MATRIX_MAX_COLS = 3;

/** L1 surface-agent chip size (icon + title). Keep in sync with Overlay CSS. */
export const LOOP_WORK_GROUP_MEMBER_CHIP_H = 28;
export const LOOP_WORK_GROUP_MEMBER_CHIP_MIN_W = 104;
export const LOOP_WORK_GROUP_MEMBER_CHIP_MAX_W = 168;

export function estimateWorkGroupMemberChipSize(title: string): {
  width: number;
  height: number;
} {
  const label = title.trim() || "Agent";
  const estimated = 28 + Math.min(label.length, 22) * 7;
  return {
    width: Math.min(
      LOOP_WORK_GROUP_MEMBER_CHIP_MAX_W,
      Math.max(LOOP_WORK_GROUP_MEMBER_CHIP_MIN_W, estimated),
    ),
    height: LOOP_WORK_GROUP_MEMBER_CHIP_H,
  };
}

export const LOOP_WORK_GROUP_LIMITS = {
  workGroupsPerDocument: 64,
  /**
   * All members (surface Agents + interior Action/Logic/Human).
   * Surface Agents still drive the L1 dashed frame.
   */
  membersPerGroup: 32,
  /** Default max AgentRuns attributed to one work group per instance. */
  maxAgentCallsPerWorkGroup: 8,
} as const;

export const LOOP_WORK_GROUP_COLLABORATION_MODES = [
  "coordinator",
  "serial",
  "parallel_join",
] as const;

export const LoopWorkGroupCollaborationModeSchema = z.enum(
  LOOP_WORK_GROUP_COLLABORATION_MODES,
);

export type LoopWorkGroupCollaborationMode = z.infer<
  typeof LoopWorkGroupCollaborationModeSchema
>;

export const LoopWorkGroupPortSchema = z.enum(["in", "out"]);
export type LoopWorkGroupPort = z.infer<typeof LoopWorkGroupPortSchema>;

export const LoopWorkGroupOriginSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

export const LoopWorkGroupSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(120),
    memberNodeIds: z
      .array(z.string().min(1))
      .max(LOOP_WORK_GROUP_LIMITS.membersPerGroup)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Work-group member node IDs must be unique",
      }),
    collaborationMode: LoopWorkGroupCollaborationModeSchema.default(
      "coordinator",
    ),
    /** Required at compile when mode is coordinator and members.length > 0. */
    coordinatorNodeId: z.string().min(1).optional(),
    /**
     * Canvas origin for empty groups (and fallback when members lack positions).
     * When members exist, the dashed frame is the padded AABB of members.
     */
    origin: LoopWorkGroupOriginSchema.optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export type LoopWorkGroup = z.infer<typeof LoopWorkGroupSchema>;

export const LoopWorkGroupRecordStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
]);

export const LoopWorkGroupRecordSchema = z
  .object({
    workGroupId: z.string().min(1),
    status: LoopWorkGroupRecordStatusSchema,
    updatedAt: z.string().min(1),
    memberNodeIds: z.array(z.string().min(1)).max(LOOP_WORK_GROUP_LIMITS.membersPerGroup),
    agentCalls: z.number().int().nonnegative().optional(),
    errorMessage: z.string().trim().max(1000).optional(),
  })
  .strict();

export type LoopWorkGroupRecord = z.infer<typeof LoopWorkGroupRecordSchema>;

export type LoopWorkGroupIssueCode =
  | "work_group_empty"
  | "work_group_member_not_specialist"
  | "work_group_member_invalid_type"
  | "work_group_member_missing"
  | "work_group_nested_or_dup"
  | "work_group_coordinator_invalid"
  | "work_group_limit_exceeded"
  | "work_group_budget_exceeded";

export interface LoopWorkGroupIssue {
  code: LoopWorkGroupIssueCode;
  path: string;
  message: string;
  workGroupId?: string;
  nodeId?: string;
}

export interface LoopWorkGroupBoundsRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LoopWorkGroupFrameBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function nextLoopWorkGroupTitle(seq: number): string {
  return `Workgroup ${seq}`;
}

type WorkGroupNodeLike = {
  id: string;
  type?: string | undefined;
  agentDefinitionId?: string | null | undefined;
  workGroupId?: string | undefined;
};

/** Surface member: Agent shown inside the L1 dashed frame. */
export function isWorkGroupSurfaceAgent(
  node: WorkGroupNodeLike | undefined | null,
): boolean {
  if (!node || isConfigNode(node)) return false;
  return (withArchitectureDefaults(node).type ?? "agent") === "agent";
}

/**
 * Type check: Action / Logic / Human can serve as work-group interior
 * (L2) collaboration scaffolding. Does **not** require `workGroupId` —
 * callers that hide nodes on L1 must also check `node.workGroupId`.
 */
export function isWorkGroupInteriorNode(
  node: WorkGroupNodeLike | undefined | null,
): boolean {
  if (!node || isConfigNode(node)) return false;
  const type = withArchitectureDefaults(node).type ?? "agent";
  return type === "action" || type === "logic" || type === "human";
}

/** True when an Action/Logic/Human is currently nested in a work group. */
export function isNestedWorkGroupInteriorNode(
  node: WorkGroupNodeLike | undefined | null,
): boolean {
  return Boolean(node?.workGroupId) && isWorkGroupInteriorNode(node);
}

export function listWorkGroupSurfaceAgentIds(
  group: Pick<LoopWorkGroup, "memberNodeIds">,
  nodes: WorkGroupNodeLike[],
): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return group.memberNodeIds.filter((id) =>
    isWorkGroupSurfaceAgent(byId.get(id)),
  );
}

export function listWorkGroupInteriorNodeIds(
  group: Pick<LoopWorkGroup, "memberNodeIds">,
  nodes: WorkGroupNodeLike[],
): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return group.memberNodeIds.filter((id) =>
    isWorkGroupInteriorNode(byId.get(id)),
  );
}

export function createLoopWorkGroupId(): string {
  return `wg_${cryptoRandomId()}`;
}

function cryptoRandomId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function computeLoopWorkGroupFrameBounds(
  memberBounds: LoopWorkGroupBoundsRect[],
  options?: { padding?: number; titleBarHeight?: number },
): LoopWorkGroupFrameBounds | null {
  if (memberBounds.length === 0) {
    return null;
  }
  const padding = options?.padding ?? LOOP_WORK_GROUP_PADDING;
  const titleBar = options?.titleBarHeight ?? LOOP_WORK_GROUP_TITLE_BAR_HEIGHT;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of memberBounds) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }
  return {
    x: minX - padding,
    y: minY - padding - titleBar,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2 + titleBar,
  };
}

/** Empty-group default frame when no members yet (canvas drop size). */
export function defaultEmptyLoopWorkGroupFrame(origin: {
  x: number;
  y: number;
}): LoopWorkGroupFrameBounds {
  return {
    x: origin.x,
    y: origin.y,
    width: 280,
    height: 160,
  };
}

/** Column count for an L1 surface-agent matrix. */
export function workGroupMatrixColumnCount(memberCount: number): number {
  if (memberCount <= 0) return 1;
  if (memberCount <= 2) return memberCount;
  return Math.min(
    LOOP_WORK_GROUP_MATRIX_MAX_COLS,
    Math.max(2, Math.ceil(Math.sqrt(memberCount))),
  );
}

export interface WorkGroupMatrixMemberSize {
  id: string;
  width: number;
  height: number;
}

export interface WorkGroupMatrixLayoutResult {
  positions: Array<{ id: string; x: number; y: number }>;
  /** Content AABB size (no frame padding / title bar). */
  contentSize: { width: number; height: number };
  columns: number;
  cellWidth: number;
  cellHeight: number;
}

/**
 * Pack surface Agents into a rectangular matrix under the work-group title bar.
 * `frameOrigin` is the dashed frame's top-left (same as `LoopWorkGroup.origin`).
 */
export function layoutWorkGroupMemberMatrix(input: {
  frameOrigin: { x: number; y: number };
  members: WorkGroupMatrixMemberSize[];
  padding?: number;
  titleBarHeight?: number;
  gapX?: number;
  gapY?: number;
}): WorkGroupMatrixLayoutResult {
  const members = input.members;
  const padding = input.padding ?? LOOP_WORK_GROUP_PADDING;
  const titleBar = input.titleBarHeight ?? LOOP_WORK_GROUP_TITLE_BAR_HEIGHT;
  const gapX = input.gapX ?? LOOP_WORK_GROUP_MATRIX_GAP_X;
  const gapY = input.gapY ?? LOOP_WORK_GROUP_MATRIX_GAP_Y;
  const contentOrigin = {
    x: input.frameOrigin.x + padding,
    y: input.frameOrigin.y + titleBar + padding,
  };

  if (members.length === 0) {
    return {
      positions: [],
      contentSize: { width: 0, height: 0 },
      columns: 1,
      cellWidth: 0,
      cellHeight: 0,
    };
  }

  const columns = workGroupMatrixColumnCount(members.length);
  const cellWidth = Math.max(...members.map((member) => member.width));
  const cellHeight = Math.max(...members.map((member) => member.height));
  const positions = members.map((member, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    return {
      id: member.id,
      x: contentOrigin.x + col * (cellWidth + gapX),
      y: contentOrigin.y + row * (cellHeight + gapY),
    };
  });
  const rows = Math.ceil(members.length / columns);
  return {
    positions,
    contentSize: {
      width: columns * cellWidth + Math.max(0, columns - 1) * gapX,
      height: rows * cellHeight + Math.max(0, rows - 1) * gapY,
    },
    columns,
    cellWidth,
    cellHeight,
  };
}

type DraftNodeLike = {
  id: string;
  type?: string | undefined;
  agentDefinitionId?: string | null | undefined;
  workGroupId?: string | undefined;
  title?: string | undefined;
};

type DraftEdgeLike = {
  id: string;
  source: string;
  target: string;
  kind?: string | undefined;
  workGroupPort?: LoopWorkGroupPort | undefined;
};

type DraftLike = {
  nodes: DraftNodeLike[];
  edges?: DraftEdgeLike[];
  workGroups?: LoopWorkGroup[];
};

/**
 * Soft Draw validation + hard Compile validation.
 * Pass `forCompile: true` to require non-empty groups and specialist bindings.
 */
export function validateLoopWorkGroups(
  draft: DraftLike,
  options?: { forCompile?: boolean },
): LoopWorkGroupIssue[] {
  const forCompile = options?.forCompile === true;
  const issues: LoopWorkGroupIssue[] = [];
  const workGroups = draft.workGroups ?? [];
  const nodesById = new Map(draft.nodes.map((node) => [node.id, node]));
  const workGroupIds = new Set(workGroups.map((group) => group.id));

  if (workGroups.length > LOOP_WORK_GROUP_LIMITS.workGroupsPerDocument) {
    issues.push({
      code: "work_group_limit_exceeded",
      path: "workGroups",
      message: `At most ${LOOP_WORK_GROUP_LIMITS.workGroupsPerDocument} work groups are allowed`,
    });
  }

  const claimed = new Map<string, string>();

  for (const group of workGroups) {
    if (group.memberNodeIds.length > LOOP_WORK_GROUP_LIMITS.membersPerGroup) {
      issues.push({
        code: "work_group_limit_exceeded",
        path: `workGroups.${group.id}.memberNodeIds`,
        message: `Work group "${group.title}" exceeds member limit`,
        workGroupId: group.id,
      });
    }

    const agentMemberIds = listWorkGroupSurfaceAgentIds(group, draft.nodes);

    if (forCompile && agentMemberIds.length === 0) {
      issues.push({
        code: "work_group_empty",
        path: `workGroups.${group.id}`,
        message: `Work group "${group.title}" needs at least one specialist Agent`,
        workGroupId: group.id,
      });
    }

    for (const memberId of group.memberNodeIds) {
      const node = nodesById.get(memberId);
      if (!node) {
        issues.push({
          code: "work_group_member_missing",
          path: `workGroups.${group.id}.memberNodeIds`,
          message: `Member "${memberId}" not found in draft`,
          workGroupId: group.id,
          nodeId: memberId,
        });
        continue;
      }
      if (isConfigNode(node)) {
        issues.push({
          code: "work_group_member_invalid_type",
          path: `nodes.${memberId}`,
          message: `Config satellites cannot join a work group`,
          workGroupId: group.id,
          nodeId: memberId,
        });
        continue;
      }
      const arch = withArchitectureDefaults(node);
      const type = arch.type ?? "agent";
      const isAgent = type === "agent";
      const isInterior =
        type === "action" || type === "logic" || type === "human";
      if (!isAgent && !isInterior) {
        issues.push({
          code: "work_group_member_invalid_type",
          path: `nodes.${memberId}`,
          message: `Unsupported work-group member type "${type}"`,
          workGroupId: group.id,
          nodeId: memberId,
        });
      }
      // Specialist binding required only for surface Agents (not interior duty nodes).
      if (forCompile && isAgent && !node.agentDefinitionId) {
        issues.push({
          code: "work_group_member_not_specialist",
          path: `nodes.${memberId}.agentDefinitionId`,
          message: `Work group Agent "${node.title ?? memberId}" must bind a specialist AgentDefinition`,
          workGroupId: group.id,
          nodeId: memberId,
        });
      }
      if (node.workGroupId && node.workGroupId !== group.id) {
        issues.push({
          code: "work_group_nested_or_dup",
          path: `nodes.${memberId}.workGroupId`,
          message: `Node belongs to work group "${node.workGroupId}" but is listed in "${group.id}"`,
          workGroupId: group.id,
          nodeId: memberId,
        });
      }
      const prior = claimed.get(memberId);
      if (prior && prior !== group.id) {
        issues.push({
          code: "work_group_nested_or_dup",
          path: `workGroups.${group.id}.memberNodeIds`,
          message: `Node "${memberId}" is listed in multiple work groups`,
          workGroupId: group.id,
          nodeId: memberId,
        });
      } else {
        claimed.set(memberId, group.id);
      }
    }

    if (group.collaborationMode === "coordinator" && agentMemberIds.length > 0) {
      const coordOk =
        group.coordinatorNodeId &&
        agentMemberIds.includes(group.coordinatorNodeId);
      if (!coordOk) {
        issues.push({
          code: "work_group_coordinator_invalid",
          path: `workGroups.${group.id}.coordinatorNodeId`,
          message: `Work group "${group.title}" needs a coordinator that is a surface Agent member`,
          workGroupId: group.id,
        });
      }
    }
  }

  for (const node of draft.nodes) {
    if (!node.workGroupId) continue;
    if (!workGroupIds.has(node.workGroupId)) {
      issues.push({
        code: "work_group_member_missing",
        path: `nodes.${node.id}.workGroupId`,
        message: `Node references missing work group "${node.workGroupId}"`,
        workGroupId: node.workGroupId,
        nodeId: node.id,
      });
      continue;
    }
    const group = workGroups.find((entry) => entry.id === node.workGroupId);
    if (group && !group.memberNodeIds.includes(node.id)) {
      issues.push({
        code: "work_group_nested_or_dup",
        path: `nodes.${node.id}.workGroupId`,
        message: `Node has workGroupId but is not listed in memberNodeIds`,
        workGroupId: node.workGroupId,
        nodeId: node.id,
      });
    }
  }

  return issues;
}

/**
 * Agent ids used for auto collaboration / boundary rewrite.
 * Prefer explicit Agent order in memberNodeIds; callers may pass `agentIds`.
 */
export function resolveWorkGroupAgentMemberIds(
  group: LoopWorkGroup,
  nodes?: WorkGroupNodeLike[],
): string[] {
  if (!nodes) {
    // Without node types, treat all members as agents (legacy / compile path
    // that already filtered). Prefer passing nodes when available.
    return [...group.memberNodeIds];
  }
  return listWorkGroupSurfaceAgentIds(group, nodes);
}

/** Entry member for inbound boundary edges after rewrite. */
export function resolveWorkGroupEntryNodeId(
  group: LoopWorkGroup,
  nodes?: WorkGroupNodeLike[],
): string | null {
  const agents = resolveWorkGroupAgentMemberIds(group, nodes);
  if (agents.length === 0) return null;
  if (group.collaborationMode === "coordinator") {
    return group.coordinatorNodeId && agents.includes(group.coordinatorNodeId)
      ? group.coordinatorNodeId
      : agents[0]!;
  }
  return agents[0]!;
}

/** Exit member(s) for outbound boundary edges after rewrite. */
export function resolveWorkGroupExitNodeIds(
  group: LoopWorkGroup,
  nodes?: WorkGroupNodeLike[],
): string[] {
  const agents = resolveWorkGroupAgentMemberIds(group, nodes);
  if (agents.length === 0) return [];
  if (group.collaborationMode === "serial") {
    return [agents[agents.length - 1]!];
  }
  if (group.collaborationMode === "coordinator") {
    const coord = group.coordinatorNodeId;
    const others = agents.filter((id) => id !== coord);
    return others.length > 0 ? others : coord && agents.includes(coord) ? [coord] : [...agents];
  }
  return [...agents];
}

export interface ExpandedWorkGroupEdge {
  id: string;
  from: string;
  to: string;
  kind: "depends";
  when?: string;
}

/**
 * Implicit internal depends edges for a work group collaboration mode.
 * Does not include external boundary rewrite.
 */
export function expandWorkGroupInternalEdges(
  group: LoopWorkGroup,
  nodes?: WorkGroupNodeLike[],
): ExpandedWorkGroupEdge[] {
  const members = resolveWorkGroupAgentMemberIds(group, nodes);
  if (members.length === 0) return [];
  const edges: ExpandedWorkGroupEdge[] = [];
  const mode = group.collaborationMode;

  if (mode === "serial") {
    for (let i = 0; i < members.length - 1; i += 1) {
      edges.push({
        id: `wg_edge_${group.id}_serial_${i}`,
        from: members[i]!,
        to: members[i + 1]!,
        kind: "depends",
        when: `Work group serial step ${i + 1}`,
      });
    }
    return edges;
  }

  if (mode === "parallel_join") {
    return edges;
  }

  // coordinator — only among surface Agents; interior L2 edges are authored explicitly.
  const coord =
    group.coordinatorNodeId && members.includes(group.coordinatorNodeId)
      ? group.coordinatorNodeId
      : members[0]!;
  for (const memberId of members) {
    if (memberId === coord) continue;
    edges.push({
      id: `wg_edge_${group.id}_coord_${memberId}`,
      from: coord,
      to: memberId,
      kind: "depends",
      when: "Work group coordinator handoff",
    });
  }
  return edges;
}

export function isWorkGroupEndpoint(
  endpointId: string,
  workGroups: LoopWorkGroup[],
): boolean {
  return workGroups.some((group) => group.id === endpointId);
}

export function inferWorkGroupPort(
  endpointRole: "source" | "target",
  explicit?: LoopWorkGroupPort,
): LoopWorkGroupPort {
  if (explicit) return explicit;
  return endpointRole === "source" ? "out" : "in";
}
