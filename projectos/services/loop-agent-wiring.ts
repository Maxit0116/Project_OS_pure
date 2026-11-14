import {
  LOOP_CAPABILITY_INDEGREE_MAX,
  configPortForSatelliteKind,
  effectiveConfigPort,
  isConfigNode,
  type AgentWiringOverride,
  type IntentGraph,
  type IntentGraphEdge,
  type IntentGraphNode,
  type LoopAgentConfigPort,
  type LoopMemoryMode,
  type LoopSatelliteKind,
} from "../contracts/loop-graph.js";

export interface AgentWiringIssue {
  path: string;
  message: string;
}

export interface AgentWiringBase {
  modelProfileId?: string | null;
  skillIds?: string[];
  mcpServerIds?: string[];
  memoryMode?: LoopMemoryMode;
}

export interface ResolvedAgentWiring {
  modelProfileId?: string | null;
  skillIds: string[];
  mcpServerIds: string[];
  memoryMode?: LoopMemoryMode;
  /** True when Model* has neither edge, override, nor base profile. */
  missingModel: boolean;
  sources: {
    model: "override" | "edge" | "base" | "none";
    memory: "override" | "edge" | "base" | "none";
  };
}

function isAgentDutyNode(node: IntentGraphNode): boolean {
  return (node.type ?? "agent") === "agent" && !isConfigNode(node);
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

/** Validate `provides` edges and config satellites on an Intent graph. */
export function validateAgentWiringGraph(draft: IntentGraph): AgentWiringIssue[] {
  const issues: AgentWiringIssue[] = [];
  const nodesById = new Map(draft.nodes.map((node) => [node.id, node]));

  for (const node of draft.nodes) {
    if (!isConfigNode(node)) continue;
    if (!node.satelliteKind) {
      issues.push({
        path: `nodes.${node.id}.satelliteKind`,
        message: `Config satellite "${node.title}" needs satelliteKind`,
      });
    }
  }

  const modelIndegree = new Map<string, number>();
  const memoryIndegree = new Map<string, number>();
  const skillIndegree = new Map<string, number>();
  const mcpIndegree = new Map<string, number>();
  const capabilityIndegree = new Map<string, number>();
  /** Each satellite feeds at most one agent — no shared model/MCP/skill hubs. */
  const satelliteOutdegree = new Map<string, number>();

  for (const edge of draft.edges) {
    if (edge.kind !== "provides") continue;
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !isConfigNode(source)) {
      issues.push({
        path: `edges.${edge.id}`,
        message: "provides edges must start from a config satellite",
      });
      continue;
    }
    if (!target || !isAgentDutyNode(target)) {
      issues.push({
        path: `edges.${edge.id}`,
        message: "provides edges must target an agent node",
      });
      continue;
    }
    satelliteOutdegree.set(
      source.id,
      (satelliteOutdegree.get(source.id) ?? 0) + 1,
    );

    const expectedPort = source.satelliteKind
      ? configPortForSatelliteKind(source.satelliteKind)
      : undefined;
    const port = effectiveConfigPort(edge.configPort, source.satelliteKind);
    if (!port) {
      issues.push({
        path: `edges.${edge.id}.configPort`,
        message: "provides edge needs configPort",
      });
      continue;
    }
    const legacyCapabilityAlias =
      edge.configPort === "capability" &&
      (expectedPort === "skill" || expectedPort === "mcp");
    if (expectedPort && port !== expectedPort && !legacyCapabilityAlias) {
      issues.push({
        path: `edges.${edge.id}.configPort`,
        message: `satellite ${source.satelliteKind} must connect to ${expectedPort}, got ${port}`,
      });
    }

    if (port === "model") {
      modelIndegree.set(target.id, (modelIndegree.get(target.id) ?? 0) + 1);
    } else if (port === "memory") {
      memoryIndegree.set(target.id, (memoryIndegree.get(target.id) ?? 0) + 1);
    } else if (port === "skill") {
      skillIndegree.set(target.id, (skillIndegree.get(target.id) ?? 0) + 1);
    } else if (port === "mcp") {
      mcpIndegree.set(target.id, (mcpIndegree.get(target.id) ?? 0) + 1);
    } else {
      capabilityIndegree.set(
        target.id,
        (capabilityIndegree.get(target.id) ?? 0) + 1,
      );
    }
  }

  for (const [satelliteId, count] of satelliteOutdegree) {
    if (count > 1) {
      issues.push({
        path: `nodes.${satelliteId}.provides`,
        message: `Config satellite "${satelliteId}" may provide to at most one agent`,
      });
    }
  }

  for (const [nodeId, count] of modelIndegree) {
    if (count > 1) {
      issues.push({
        path: `nodes.${nodeId}.ports.model`,
        message: `Agent "${nodeId}" Model* port accepts at most one provides edge`,
      });
    }
  }
  for (const [nodeId, count] of memoryIndegree) {
    if (count > 1) {
      issues.push({
        path: `nodes.${nodeId}.ports.memory`,
        message: `Agent "${nodeId}" Memory port accepts at most one provides edge`,
      });
    }
  }
  for (const [nodeId, count] of skillIndegree) {
    if (count > LOOP_CAPABILITY_INDEGREE_MAX) {
      issues.push({
        path: `nodes.${nodeId}.ports.skill`,
        message: `Agent "${nodeId}" Skills port accepts at most ${LOOP_CAPABILITY_INDEGREE_MAX} provides edges`,
      });
    }
  }
  for (const [nodeId, count] of mcpIndegree) {
    if (count > LOOP_CAPABILITY_INDEGREE_MAX) {
      issues.push({
        path: `nodes.${nodeId}.ports.mcp`,
        message: `Agent "${nodeId}" MCP port accepts at most ${LOOP_CAPABILITY_INDEGREE_MAX} provides edges`,
      });
    }
  }
  for (const [nodeId, count] of capabilityIndegree) {
    if (count > LOOP_CAPABILITY_INDEGREE_MAX) {
      issues.push({
        path: `nodes.${nodeId}.ports.capability`,
        message: `Agent "${nodeId}" Capability port accepts at most ${LOOP_CAPABILITY_INDEGREE_MAX} provides edges`,
      });
    }
  }

  return issues;
}

function patchFromProvides(
  agentId: string,
  draft: IntentGraph,
): AgentWiringOverride {
  const nodesById = new Map(draft.nodes.map((node) => [node.id, node]));
  let modelProfileId: string | null | undefined;
  let memoryMode: LoopMemoryMode | undefined;
  const skillIds: string[] = [];
  const mcpServerIds: string[] = [];

  for (const edge of draft.edges) {
    if (edge.kind !== "provides" || edge.target !== agentId) continue;
    const source = nodesById.get(edge.source);
    if (!source || !isConfigNode(source)) continue;
    const port: LoopAgentConfigPort =
      effectiveConfigPort(edge.configPort, source.satelliteKind) ??
      "capability";
    const ref = source.configRef ?? {};
    if (port === "model") {
      modelProfileId = ref.modelProfileId ?? modelProfileId;
    } else if (port === "memory") {
      memoryMode = ref.memoryMode ?? memoryMode;
    } else if (
      (port === "skill" || port === "capability") &&
      source.satelliteKind === "skill" &&
      ref.skillId
    ) {
      skillIds.push(ref.skillId);
    } else if (
      (port === "mcp" || port === "capability") &&
      source.satelliteKind === "mcp" &&
      ref.mcpServerId
    ) {
      mcpServerIds.push(ref.mcpServerId);
    }
  }

  return {
    ...(modelProfileId !== undefined ? { modelProfileId } : {}),
    ...(memoryMode ? { memoryMode } : {}),
    ...(skillIds.length ? { skillIds: uniqueIds(skillIds) } : {}),
    ...(mcpServerIds.length ? { mcpServerIds: uniqueIds(mcpServerIds) } : {}),
  };
}

/**
 * Resolve Agent wiring: base Definition → provides edges → node override (highest).
 */
export function resolveAgentWiring(
  agentNode: IntentGraphNode,
  draft: IntentGraph,
  base?: AgentWiringBase | null,
): ResolvedAgentWiring {
  const fromEdges = patchFromProvides(agentNode.id, draft);
  const override = agentNode.agentWiringOverride ?? {};

  const modelSource =
    override.modelProfileId !== undefined
      ? ("override" as const)
      : fromEdges.modelProfileId !== undefined
        ? ("edge" as const)
        : base?.modelProfileId !== undefined && base.modelProfileId !== null
          ? ("base" as const)
          : ("none" as const);

  const memorySource =
    override.memoryMode !== undefined
      ? ("override" as const)
      : fromEdges.memoryMode !== undefined
        ? ("edge" as const)
        : base?.memoryMode !== undefined
          ? ("base" as const)
          : ("none" as const);

  const modelProfileId =
    override.modelProfileId !== undefined
      ? override.modelProfileId
      : fromEdges.modelProfileId !== undefined
        ? fromEdges.modelProfileId
        : (base?.modelProfileId ?? null);

  const memoryMode =
    override.memoryMode ?? fromEdges.memoryMode ?? base?.memoryMode;

  const skillIds = uniqueIds([
    ...(override.skillIds ?? fromEdges.skillIds ?? base?.skillIds ?? []),
  ]);
  // Override replaces skill list when explicitly set; else merge edges over base.
  const resolvedSkills =
    override.skillIds !== undefined
      ? uniqueIds(override.skillIds)
      : uniqueIds([
          ...(base?.skillIds ?? []),
          ...(fromEdges.skillIds ?? []),
        ]);

  const resolvedMcps =
    override.mcpServerIds !== undefined
      ? uniqueIds(override.mcpServerIds)
      : uniqueIds([
          ...(base?.mcpServerIds ?? []),
          ...(fromEdges.mcpServerIds ?? []),
        ]);

  void skillIds;

  return {
    modelProfileId,
    skillIds: resolvedSkills,
    mcpServerIds: resolvedMcps,
    ...(memoryMode ? { memoryMode } : {}),
    missingModel: modelSource === "none" || !modelProfileId,
    sources: { model: modelSource, memory: memorySource },
  };
}

export interface ExpandWiringInput {
  agentNodeId: string;
  agentPosition: { x: number; y: number };
  base: AgentWiringBase;
  /**
   * Existing draft — used to skip edges that already feed this agent.
   * Satellites are never shared across agents: same model/MCP/skill ref
   * still gets a dedicated satellite per agent.
   */
  existing: IntentGraph;
  newId: () => string;
}

export interface ExpandWiringResult {
  nodes: IntentGraphNode[];
  edges: IntentGraphEdge[];
}

/** Agent card width used when laying out satellite columns under wiring ports. */
const EXPAND_AGENT_MIN_W = 280;
const EXPAND_AGENT_CAP_SLOT_W = 36;
const EXPAND_AGENT_BODY_H = 100;
const EXPAND_SATELLITE_W = 36;
const EXPAND_SATELLITE_GAP_Y = 24;

/** Model 1/5 · MCP 2/5 · Skills 2/5 — keep in sync with workbench wiring layout. */
const EXPAND_ZONE_FRAC = {
  model: 1 / 5,
  mcp: 2 / 5,
  skill: 2 / 5,
} as const;

function expandAgentWidth(mcpCount: number, skillCount: number): number {
  const extra =
    Math.max(0, Math.max(1, mcpCount) - 1) +
    Math.max(0, Math.max(1, skillCount) - 1);
  return EXPAND_AGENT_MIN_W + extra * EXPAND_AGENT_CAP_SLOT_W;
}

function stripPortCenterX(
  agentX: number,
  agentW: number,
  port: Extract<LoopAgentConfigPort, "model" | "mcp" | "skill">,
  slotInPort: number,
  portCounts: { model: number; mcp: number; skill: number },
): number {
  let zoneStart = 0;
  if (port === "mcp") zoneStart = agentW * EXPAND_ZONE_FRAC.model;
  else if (port === "skill") {
    zoneStart = agentW * (EXPAND_ZONE_FRAC.model + EXPAND_ZONE_FRAC.mcp);
  }
  const zoneWidth = agentW * EXPAND_ZONE_FRAC[port];
  const count =
    port === "model"
      ? Math.max(1, portCounts.model)
      : port === "mcp"
        ? Math.max(1, portCounts.mcp)
        : Math.max(1, portCounts.skill);
  const inset = Math.min(10, zoneWidth * 0.12);
  const usable = Math.max(1, zoneWidth - inset * 2);
  const index = Math.min(Math.max(0, slotInPort), count - 1);
  return agentX + zoneStart + inset + (usable * (index + 0.5)) / count;
}

/** Build config satellites + provides edges from a Workforce / base definition. */
export function expandWiringFromDefinition(
  input: ExpandWiringInput,
): ExpandWiringResult {
  const nodes: IntentGraphNode[] = [];
  const edges: IntentGraphEdge[] = [];
  const { agentNodeId, agentPosition, base, newId } = input;
  void input.existing;
  const stackByPort: Record<"model" | "mcp" | "skill", number> = {
    model: 0,
    mcp: 0,
    skill: 0,
  };
  const portCounts = {
    model: base.modelProfileId ? 1 : 0,
    mcp: base.mcpServerIds?.length ?? 0,
    skill: base.skillIds?.length ?? 0,
  };
  const agentW = expandAgentWidth(portCounts.mcp, portCounts.skill);

  const place = (
    kind: LoopSatelliteKind,
    title: string,
    configRef: NonNullable<IntentGraphNode["configRef"]>,
    port: Extract<LoopAgentConfigPort, "model" | "mcp" | "skill">,
  ) => {
    const stack = stackByPort[port];
    const centerX = stripPortCenterX(
      agentPosition.x,
      agentW,
      port,
      stack,
      portCounts,
    );
    const satellite = {
      id: newId(),
      title,
      prompt: "",
      type: "config" as const,
      satelliteKind: kind,
      configRef,
      position: {
        x: centerX - EXPAND_SATELLITE_W / 2,
        y:
          agentPosition.y +
          EXPAND_AGENT_BODY_H +
          EXPAND_SATELLITE_GAP_Y +
          stack * (EXPAND_SATELLITE_W + 10),
      },
    } satisfies IntentGraphNode;
    nodes.push(satellite);
    stackByPort[port] = stack + 1;
    edges.push({
      id: newId(),
      source: satellite.id,
      target: agentNodeId,
      kind: "provides",
      configPort: port,
      sourcePort: "n",
      targetPort: "s",
      prompt: "",
    });
  };

  if (base.modelProfileId) {
    place(
      "model",
      `Model · ${base.modelProfileId.slice(0, 16)}`,
      { modelProfileId: base.modelProfileId },
      "model",
    );
  }

  // Memory stays on the Definition / override fold path; the Agent strip is
  // Model / MCP / Skills only, so memory is not expanded as a canvas satellite.

  for (const mcpServerId of base.mcpServerIds ?? []) {
    place("mcp", `MCP · ${mcpServerId.slice(0, 24)}`, { mcpServerId }, "mcp");
  }

  for (const skillId of base.skillIds ?? []) {
    place("skill", `Skill · ${skillId.slice(0, 24)}`, { skillId }, "skill");
  }

  return { nodes, edges };
}

/** Cascade-delete orphan config satellites that only fed the removed agent. */
export function collectOrphanConfigNodeIds(
  draft: IntentGraph,
  removedAgentId: string,
): string[] {
  const remainingEdges = draft.edges.filter(
    (edge) => edge.source !== removedAgentId && edge.target !== removedAgentId,
  );
  const orphans: string[] = [];
  for (const node of draft.nodes) {
    if (!isConfigNode(node) || node.id === removedAgentId) continue;
    const stillUsed = remainingEdges.some(
      (edge) => edge.kind === "provides" && edge.source === node.id,
    );
    if (!stillUsed) orphans.push(node.id);
  }
  return orphans;
}

/** After deleting a provides edge, satellites with zero remaining provides are orphans. */
export function collectOrphansAfterEdgeRemoval(
  draft: IntentGraph,
  removedEdgeId: string,
): string[] {
  const edge = draft.edges.find((item) => item.id === removedEdgeId);
  if (!edge || edge.kind !== "provides") return [];
  const remaining = draft.edges.filter((item) => item.id !== removedEdgeId);
  const source = draft.nodes.find((node) => node.id === edge.source);
  if (!source || !isConfigNode(source)) return [];
  const stillUsed = remaining.some(
    (item) => item.kind === "provides" && item.source === source.id,
  );
  return stillUsed ? [] : [source.id];
}

export function toWiringOverride(
  resolved: ResolvedAgentWiring,
): AgentWiringOverride {
  return {
    ...(resolved.modelProfileId !== undefined
      ? { modelProfileId: resolved.modelProfileId }
      : {}),
    skillIds: resolved.skillIds,
    mcpServerIds: resolved.mcpServerIds,
    ...(resolved.memoryMode ? { memoryMode: resolved.memoryMode } : {}),
  };
}
