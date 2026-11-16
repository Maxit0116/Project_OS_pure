import {
  LOOP_WIRING_LIST_THRESHOLD,
  effectiveConfigPort,
  isConfigNode,
  type IntentGraph,
  type IntentGraphEdge,
  type IntentGraphNode,
  type LoopSatelliteKind,
  type LoopWiringListMember,
} from "../contracts/loop-graph.js";

export type WiringListMemberKind = "mcp" | "skill";
export type WiringListKind = "mcp_list" | "skill_list";

const LIST_SAT_W = 36;
const LIST_SAT_H = 36;
const LIST_BELOW_GAP = 20;
/** Approximate Agent AABB (duty body + wiring strip). */
const AGENT_APPROX_H = 110;
const AGENT_APPROX_W = 280;

/** Canvas list-card metrics (mcp_list / skill_list) — keep in sync with Overlay CSS. */
export const LOOP_WIRING_LIST_CARD_MIN_W = 152;
export const LOOP_WIRING_LIST_CARD_MAX_W = 200;
export const LOOP_WIRING_LIST_CARD_MAX_VISIBLE_ROWS = 6;
export const LOOP_WIRING_LIST_CARD_HEADER_H = 22;
export const LOOP_WIRING_LIST_CARD_ROW_H = 18;
export const LOOP_WIRING_LIST_CARD_PAD_Y = 8;
export const LOOP_WIRING_LIST_CARD_PAD_X = 8;

/** Size the collapsed MCP/Skills list satellite from member count. */
export function estimateWiringListCardSize(memberCount: number): {
  width: number;
  height: number;
} {
  const count = Math.max(0, memberCount);
  const visible = Math.min(
    LOOP_WIRING_LIST_CARD_MAX_VISIBLE_ROWS,
    Math.max(1, count),
  );
  const hidden = Math.max(0, count - LOOP_WIRING_LIST_CARD_MAX_VISIBLE_ROWS);
  const rowsH =
    visible * LOOP_WIRING_LIST_CARD_ROW_H +
    (hidden > 0 ? LOOP_WIRING_LIST_CARD_ROW_H : 0);
  return {
    width: LOOP_WIRING_LIST_CARD_MIN_W,
    height:
      LOOP_WIRING_LIST_CARD_PAD_Y +
      LOOP_WIRING_LIST_CARD_HEADER_H +
      rowsH +
      LOOP_WIRING_LIST_CARD_PAD_Y,
  };
}

/** Asset ids already wired to an agent for MCP or Skills (list + individuals). */
export function connectedWiringAssetIds(
  agentId: string,
  port: WiringListMemberKind,
  draft: IntentGraph,
): string[] {
  const { members } = collectWiringPortMembers(agentId, port, draft);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const member of members) {
    const id =
      port === "mcp"
        ? member.configRef?.mcpServerId
        : member.configRef?.skillId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function isWiringListKind(
  kind: LoopSatelliteKind | undefined,
): kind is WiringListKind {
  return kind === "mcp_list" || kind === "skill_list";
}

export function isWiringMemberKind(
  kind: LoopSatelliteKind | undefined,
): kind is WiringListMemberKind {
  return kind === "mcp" || kind === "skill";
}

export function memberKindForListKind(kind: WiringListKind): WiringListMemberKind {
  return kind === "mcp_list" ? "mcp" : "skill";
}

export function listKindForMemberKind(
  kind: WiringListMemberKind,
): WiringListKind {
  return kind === "mcp" ? "mcp_list" : "skill_list";
}

export function wiringListTitle(
  kind: WiringListKind,
  count: number,
): string {
  const label = kind === "mcp_list" ? "MCP" : "Skills";
  return `${label} ×${count}`.slice(0, 120);
}

export function wiringListMembersOf(
  node: IntentGraphNode,
): LoopWiringListMember[] {
  if (!isWiringListKind(node.satelliteKind)) return [];
  return [...(node.configRef?.wiringListMembers ?? [])];
}

function memberRefKey(member: LoopWiringListMember): string {
  if (member.kind === "mcp") {
    return `mcp:${member.configRef?.mcpServerId ?? member.id}`;
  }
  return `skill:${member.configRef?.skillId ?? member.id}`;
}

export function memberFromSatellite(
  node: IntentGraphNode,
): LoopWiringListMember | null {
  if (!isWiringMemberKind(node.satelliteKind)) return null;
  const kind = node.satelliteKind;
  const ref = node.configRef ?? {};
  if (kind === "mcp" && !ref.mcpServerId) return null;
  if (kind === "skill" && !ref.skillId) return null;
  return {
    id: node.id,
    title: (node.title || kind).slice(0, 120),
    kind,
    configRef: {
      ...(ref.mcpServerId ? { mcpServerId: ref.mcpServerId } : {}),
      ...(ref.skillId ? { skillId: ref.skillId } : {}),
    },
  };
}

function isAgentDuty(node: IntentGraphNode): boolean {
  return (node.type ?? "agent") === "agent" && !isConfigNode(node);
}

function providesPort(
  edge: IntentGraphEdge,
  source: IntentGraphNode,
): "mcp" | "skill" | "model" | "memory" | "capability" | undefined {
  return effectiveConfigPort(edge.configPort, source.satelliteKind);
}

function parkLocalX(
  port: WiringListMemberKind,
  agentWidth: number,
  stackIndex: number,
  satWidth = LIST_SAT_W,
): number {
  const half = satWidth / 2;
  const center = agentWidth / 2;
  const corridor = 36;
  if (port === "mcp") {
    const centerX =
      center - corridor - half - 10 - stackIndex * (LIST_SAT_W + 8);
    return Math.max(4, Math.min(agentWidth - satWidth - 4, centerX - half));
  }
  // Skills: right of south corridor, stacked vertically (same X).
  const centerX = center + corridor + half + 8;
  return Math.max(4, Math.min(agentWidth - satWidth - 4, centerX - half));
}

function placeBelowAgent(
  agent: IntentGraphNode,
  port: WiringListMemberKind,
  stackIndex: number,
  options?: { asListCard?: boolean; memberCount?: number },
): { x: number; y: number } {
  const agentW = AGENT_APPROX_W;
  const satW = options?.asListCard
    ? estimateWiringListCardSize(options.memberCount ?? 4).width
    : LIST_SAT_W;
  const satH = options?.asListCard
    ? estimateWiringListCardSize(options.memberCount ?? 4).height
    : LIST_SAT_H;
  return {
    x: agent.position.x + parkLocalX(port, agentW, stackIndex, satW),
    y:
      agent.position.y +
      AGENT_APPROX_H +
      LIST_BELOW_GAP +
      stackIndex * (satH + 10),
  };
}

function averagePosition(
  nodes: IntentGraphNode[],
  fallback: { x: number; y: number },
): { x: number; y: number } {
  if (nodes.length === 0) return fallback;
  const sum = nodes.reduce(
    (acc, node) => ({
      x: acc.x + node.position.x,
      y: acc.y + node.position.y,
    }),
    { x: 0, y: 0 },
  );
  return {
    x: sum.x / nodes.length,
    y: sum.y / nodes.length,
  };
}

/** Collect ordered MCP/Skills members for one agent port (lists + individuals). */
export function collectWiringPortMembers(
  agentId: string,
  port: WiringListMemberKind,
  draft: IntentGraph,
): {
  members: LoopWiringListMember[];
  individualIds: string[];
  listIds: string[];
  nodes: IntentGraphNode[];
} {
  const byId = new Map(draft.nodes.map((node) => [node.id, node]));
  const listKind = listKindForMemberKind(port);
  const individuals: IntentGraphNode[] = [];
  const lists: IntentGraphNode[] = [];

  for (const edge of draft.edges) {
    if (edge.kind !== "provides" || edge.target !== agentId) continue;
    const source = byId.get(edge.source);
    if (!source || !isConfigNode(source)) continue;
    const edgePort = providesPort(edge, source);
    if (edgePort !== port && edgePort !== "capability") continue;
    if (source.satelliteKind === port) individuals.push(source);
    else if (source.satelliteKind === listKind) lists.push(source);
  }

  const members: LoopWiringListMember[] = [];
  const seen = new Set<string>();
  const push = (member: LoopWiringListMember | null) => {
    if (!member || member.kind !== port) return;
    const key = memberRefKey(member);
    if (seen.has(key)) return;
    seen.add(key);
    members.push(member);
  };

  for (const list of lists) {
    for (const member of wiringListMembersOf(list)) push(member);
  }
  for (const sat of individuals) push(memberFromSatellite(sat));

  return {
    members,
    individualIds: individuals.map((node) => node.id),
    listIds: lists.map((node) => node.id),
    nodes: [...lists, ...individuals],
  };
}

export function findWiringListForAgent(
  agentId: string,
  port: WiringListMemberKind,
  draft: IntentGraph,
): IntentGraphNode | null {
  const listKind = listKindForMemberKind(port);
  const byId = new Map(draft.nodes.map((node) => [node.id, node]));
  for (const edge of draft.edges) {
    if (edge.kind !== "provides" || edge.target !== agentId) continue;
    const source = byId.get(edge.source);
    if (source?.satelliteKind === listKind) return source;
  }
  return null;
}

/**
 * Collapse MCP/Skills when count > threshold; expand back when ≤ threshold;
 * delete empty lists. Runs for every agent on the draft.
 */
export function normalizeWiringLists(
  draft: IntentGraph,
  nextId: (prefix: string) => string,
): { draft: IntentGraph; changed: boolean } {
  let nodes = [...draft.nodes];
  let edges = [...draft.edges];
  let changed = false;

  const agents = nodes.filter(isAgentDuty);

  for (const agent of agents) {
    for (const port of ["mcp", "skill"] as const) {
      const snapshot = collectWiringPortMembers(agent.id, port, {
        ...draft,
        nodes,
        edges,
      });
      const { members, individualIds, listIds, nodes: portNodes } = snapshot;
      const listKind = listKindForMemberKind(port);
      const wantList = members.length > LOOP_WIRING_LIST_THRESHOLD;
      const wantIndividuals =
        members.length > 0 && members.length <= LOOP_WIRING_LIST_THRESHOLD;

      const currentIsCleanList =
        wantList &&
        listIds.length === 1 &&
        individualIds.length === 0 &&
        (() => {
          const list = nodes.find((node) => node.id === listIds[0]);
          if (!list) return false;
          const current = wiringListMembersOf(list);
          if (current.length !== members.length) return false;
          return current.every(
            (item, index) => memberRefKey(item) === memberRefKey(members[index]!),
          );
        })();

      const currentIsCleanIndividuals =
        wantIndividuals &&
        listIds.length === 0 &&
        individualIds.length === members.length &&
        members.every((member) =>
          nodes.some(
            (node) =>
              node.id === member.id &&
              node.satelliteKind === port &&
              memberRefKey(memberFromSatellite(node) ?? member) ===
                memberRefKey(member),
          ),
        );

      const currentIsEmptyClean =
        members.length === 0 && listIds.length === 0 && individualIds.length === 0;

      if (currentIsCleanList || currentIsCleanIndividuals || currentIsEmptyClean) {
        continue;
      }

      changed = true;
      const removeIds = new Set([...individualIds, ...listIds]);
      nodes = nodes.filter((node) => !removeIds.has(node.id));
      edges = edges.filter(
        (edge) => !removeIds.has(edge.source) && !removeIds.has(edge.target),
      );

      if (members.length === 0) {
        continue;
      }

      if (wantList) {
        const reuseId = listIds[0] ?? nextId("node");
        const position = averagePosition(
          portNodes,
          placeBelowAgent(agent, port, 0, {
            asListCard: true,
            memberCount: members.length,
          }),
        );
        const listNode: IntentGraphNode = {
          id: reuseId,
          title: wiringListTitle(listKind, members.length),
          prompt: "",
          type: "config",
          satelliteKind: listKind,
          configRef: { wiringListMembers: members },
          position,
        };
        nodes.push(listNode);
        edges.push({
          id: nextId("edge"),
          source: listNode.id,
          target: agent.id,
          kind: "provides",
          configPort: port,
          sourcePort: "n",
          targetPort: "s",
          prompt: "",
        });
        continue;
      }

      // Expand to individuals (≤ threshold). Prefer stable member ids.
      members.forEach((member, index) => {
        const id =
          member.id && !nodes.some((node) => node.id === member.id)
            ? member.id
            : nextId("node");
        const position =
          portNodes.find((node) => node.id === member.id)?.position ??
          placeBelowAgent(agent, port, index);
        nodes.push({
          id,
          title: member.title.slice(0, 120),
          prompt: "",
          type: "config",
          satelliteKind: port,
          configRef: {
            ...(member.configRef?.mcpServerId
              ? { mcpServerId: member.configRef.mcpServerId }
              : {}),
            ...(member.configRef?.skillId
              ? { skillId: member.configRef.skillId }
              : {}),
          },
          position,
        });
        edges.push({
          id: nextId("edge"),
          source: id,
          target: agent.id,
          kind: "provides",
          configPort: port,
          sourcePort: "n",
          targetPort: "s",
          prompt: "",
        });
      });
    }
  }

  if (!changed) return { draft, changed: false };
  return {
    draft: {
      ...draft,
      revision: draft.revision + 1,
      nodes,
      edges,
    },
    changed: true,
  };
}

/** Append one member into an existing list (caller should normalize afterward). */
export function appendWiringListMember(
  draft: IntentGraph,
  listNodeId: string,
  member: LoopWiringListMember,
): IntentGraph | null {
  const list = draft.nodes.find((node) => node.id === listNodeId);
  if (!list || !isWiringListKind(list.satelliteKind)) return null;
  const expected = memberKindForListKind(list.satelliteKind);
  if (member.kind !== expected) return null;
  const existing = wiringListMembersOf(list);
  const key = memberRefKey(member);
  if (existing.some((item) => memberRefKey(item) === key)) {
    return draft;
  }
  const nextMembers = [...existing, member];
  return {
    ...draft,
    revision: draft.revision + 1,
    nodes: draft.nodes.map((node) => {
      if (node.id !== listNodeId) return node;
      return {
        ...node,
        title: wiringListTitle(list.satelliteKind as WiringListKind, nextMembers.length),
        configRef: {
          ...(node.configRef ?? {}),
          wiringListMembers: nextMembers,
        },
      };
    }),
  };
}

/** Remove one member from a list; empty lists are left for normalize to delete. */
export function removeWiringListMember(
  draft: IntentGraph,
  listNodeId: string,
  memberId: string,
): IntentGraph | null {
  const list = draft.nodes.find((node) => node.id === listNodeId);
  if (!list || !isWiringListKind(list.satelliteKind)) return null;
  const existing = wiringListMembersOf(list);
  const nextMembers = existing.filter((item) => item.id !== memberId);
  if (nextMembers.length === existing.length) return draft;
  return {
    ...draft,
    revision: draft.revision + 1,
    nodes: draft.nodes.map((node) => {
      if (node.id !== listNodeId) return node;
      return {
        ...node,
        title: wiringListTitle(
          list.satelliteKind as WiringListKind,
          nextMembers.length,
        ),
        configRef: {
          ...(node.configRef ?? {}),
          wiringListMembers: nextMembers,
        },
      };
    }),
  };
}
