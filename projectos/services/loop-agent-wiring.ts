import {
  LOOP_CAPABILITY_INDEGREE_MAX,
  configPortForSatelliteKind,
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
  const capabilityIndegree = new Map<string, number>();

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

    const expectedPort = source.satelliteKind
      ? configPortForSatelliteKind(source.satelliteKind)
      : undefined;
    const port = edge.configPort ?? expectedPort;
    if (!port) {
      issues.push({
        path: `edges.${edge.id}.configPort`,
        message: "provides edge needs configPort",
      });
      continue;
    }
    if (expectedPort && port !== expectedPort) {
      issues.push({
        path: `edges.${edge.id}.configPort`,
        message: `satellite ${source.satelliteKind} must connect to ${expectedPort}, got ${port}`,
      });
    }

    if (port === "model") {
      modelIndegree.set(target.id, (modelIndegree.get(target.id) ?? 0) + 1);
    } else if (port === "memory") {
      memoryIndegree.set(target.id, (memoryIndegree.get(target.id) ?? 0) + 1);
    } else {
      capabilityIndegree.set(
        target.id,
        (capabilityIndegree.get(target.id) ?? 0) + 1,
      );
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
      edge.configPort ??
      (source.satelliteKind
        ? configPortForSatelliteKind(source.satelliteKind)
        : "capability");
    const ref = source.configRef ?? {};
    if (port === "model") {
      modelProfileId = ref.modelProfileId ?? modelProfileId;
    } else if (port === "memory") {
      memoryMode = ref.memoryMode ?? memoryMode;
    } else if (source.satelliteKind === "skill" && ref.skillId) {
      skillIds.push(ref.skillId);
    } else if (source.satelliteKind === "mcp" && ref.mcpServerId) {
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
  /** Existing draft nodes/edges — used to avoid duplicate satellites for same ref. */
  existing: IntentGraph;
  newId: () => string;
}

export interface ExpandWiringResult {
  nodes: IntentGraphNode[];
  edges: IntentGraphEdge[];
}

function findExistingSatellite(
  draft: IntentGraph,
  kind: LoopSatelliteKind,
  match: (ref: NonNullable<IntentGraphNode["configRef"]>) => boolean,
): IntentGraphNode | undefined {
  return draft.nodes.find(
    (node) =>
      isConfigNode(node) &&
      node.satelliteKind === kind &&
      node.configRef &&
      match(node.configRef),
  );
}

/** Build config satellites + provides edges from a Workforce / base definition. */
export function expandWiringFromDefinition(
  input: ExpandWiringInput,
): ExpandWiringResult {
  const nodes: IntentGraphNode[] = [];
  const edges: IntentGraphEdge[] = [];
  const { agentNodeId, agentPosition, base, existing, newId } = input;
  let slot = 0;

  const place = (
    kind: LoopSatelliteKind,
    title: string,
    configRef: NonNullable<IntentGraphNode["configRef"]>,
    port: LoopAgentConfigPort,
    reuse?: IntentGraphNode,
  ) => {
    const satellite =
      reuse ??
      ({
        id: newId(),
        title,
        prompt: "",
        type: "config" as const,
        satelliteKind: kind,
        configRef,
        position: {
          x: agentPosition.x - 40 + slot * 100,
          y: agentPosition.y + 90,
        },
      } satisfies IntentGraphNode);
    if (!reuse) {
      nodes.push(satellite);
      slot += 1;
    }
    const already = existing.edges.some(
      (edge) =>
        edge.kind === "provides" &&
        edge.source === satellite.id &&
        edge.target === agentNodeId,
    );
    const pending = edges.some(
      (edge) => edge.source === satellite.id && edge.target === agentNodeId,
    );
    if (!already && !pending) {
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
    }
  };

  if (base.modelProfileId) {
    const reuse = findExistingSatellite(
      existing,
      "model",
      (ref) => ref.modelProfileId === base.modelProfileId,
    );
    place(
      "model",
      `Model · ${base.modelProfileId.slice(0, 16)}`,
      { modelProfileId: base.modelProfileId },
      "model",
      reuse,
    );
  }

  if (base.memoryMode && base.memoryMode !== "none") {
    const reuse = findExistingSatellite(
      existing,
      "memory",
      (ref) => ref.memoryMode === base.memoryMode,
    );
    place(
      "memory",
      `Memory · ${base.memoryMode}`,
      { memoryMode: base.memoryMode },
      "memory",
      reuse,
    );
  }

  for (const skillId of base.skillIds ?? []) {
    const reuse = findExistingSatellite(
      existing,
      "skill",
      (ref) => ref.skillId === skillId,
    );
    place(
      "skill",
      `Skill · ${skillId.slice(0, 24)}`,
      { skillId },
      "capability",
      reuse,
    );
  }

  for (const mcpServerId of base.mcpServerIds ?? []) {
    const reuse = findExistingSatellite(
      existing,
      "mcp",
      (ref) => ref.mcpServerId === mcpServerId,
    );
    place(
      "mcp",
      `MCP · ${mcpServerId.slice(0, 24)}`,
      { mcpServerId },
      "capability",
      reuse,
    );
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
