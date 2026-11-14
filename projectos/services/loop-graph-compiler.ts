import { randomUUID } from "node:crypto";

import {
  LoopCompileResultSchema,
  isConfigNode,
  suggestIntentEdgeKind,
  suggestIntentNodeRole,
  withArchitectureDefaults,
  type IntentGraph,
  type IntentGraphNode,
  type LoopAssumption,
  type LoopCompileResult,
  type LoopCycleGate,
  type LoopSpec,
  type LoopSpecEdge,
  type LoopSpecNode,
  validateLoopSpecTopology,
} from "../contracts/loop-graph.js";
import {
  expandWorkGroupInternalEdges,
  inferWorkGroupPort,
  isWorkGroupEndpoint,
  listWorkGroupSurfaceAgentIds,
  resolveWorkGroupEntryNodeId,
  resolveWorkGroupExitNodeIds,
  validateLoopWorkGroups,
  type LoopWorkGroup,
} from "../contracts/loop-work-group.js";
import {
  resolveAgentWiring,
  toWiringOverride,
  validateAgentWiringGraph,
} from "./loop-agent-wiring.js";

function inferRole(node: IntentGraphNode): LoopSpecNode["role"] {
  return suggestIntentNodeRole(node);
}

function compileSpecNode(
  node: IntentGraphNode,
  draft: IntentGraph,
): LoopSpecNode {
  const arch = withArchitectureDefaults(node);
  const role = inferRole(node);
  const isTestAction =
    arch.type === "action" && arch.actionIntegration === "test";
  const isVerify = role === "verify" || isTestAction;
  const isAgent = (arch.type ?? "agent") === "agent";
  const resolvedWiring = isAgent
    ? toWiringOverride(resolveAgentWiring(node, draft))
    : undefined;
  const hasWiring =
    resolvedWiring &&
    (resolvedWiring.modelProfileId ||
      (resolvedWiring.skillIds && resolvedWiring.skillIds.length > 0) ||
      (resolvedWiring.mcpServerIds && resolvedWiring.mcpServerIds.length > 0) ||
      resolvedWiring.memoryMode);
  return {
    id: node.id,
    role,
    type: arch.type,
    ...(arch.agentRole ? { agentRole: arch.agentRole } : {}),
    ...(node.agentDefinitionId
      ? { agentDefinitionId: node.agentDefinitionId }
      : node.agentDefinitionId === null
        ? { agentDefinitionId: null }
        : {}),
    ...(arch.humanMode ? { humanMode: arch.humanMode } : {}),
    ...(arch.actionIntegration
      ? { actionIntegration: arch.actionIntegration }
      : {}),
    ...(arch.actionOperation ? { actionOperation: arch.actionOperation } : {}),
    ...(arch.logicKind ? { logicKind: arch.logicKind } : {}),
    ...(typeof arch.maxIterations === "number"
      ? { maxIterations: arch.maxIterations }
      : {}),
    ...(arch.repairMode ? { repairMode: true } : {}),
    ...(hasWiring ? { resolvedWiring } : {}),
    ...(node.workGroupId ? { workGroupId: node.workGroupId } : {}),
    goal: node.prompt.trim() || node.title,
    constraints: [],
    inputs: [],
    outputs: [],
    acceptance: [
      {
        id: `acc_${node.id}`,
        description: isVerify ? `Verify: ${node.title}` : `Complete: ${node.title}`,
        kind: isVerify ? "machine" : "human",
      },
    ],
  };
}

function rewriteWorkGroupBoundaryEdges(
  draft: IntentGraph,
  workGroups: LoopWorkGroup[],
): LoopSpecEdge[] {
  const groupsById = new Map(workGroups.map((group) => [group.id, group]));
  const rewritten: LoopSpecEdge[] = [];

  for (const edge of draft.edges) {
    const kind = suggestIntentEdgeKind(edge, draft.nodes);
    if (kind === "provides") continue;

    const sourceIsGroup = isWorkGroupEndpoint(edge.source, workGroups);
    const targetIsGroup = isWorkGroupEndpoint(edge.target, workGroups);
    if (!sourceIsGroup && !targetIsGroup) {
      rewritten.push({
        id: edge.id,
        from: edge.source,
        to: edge.target,
        kind,
        when: edge.prompt?.trim() || undefined,
        ...(edge.branchKey ? { branchKey: edge.branchKey } : {}),
        ...(kind === "conditional" && !edge.branchKey
          ? { branchKey: "default" }
          : {}),
        carry: kind === "feedback" ? ["latest_failure_summary"] : undefined,
      });
      continue;
    }

    let fromIds = [edge.source];
    let toIds = [edge.target];

    if (sourceIsGroup) {
      const group = groupsById.get(edge.source);
      if (!group) continue;
      const port = inferWorkGroupPort("source", edge.workGroupPort);
      if (port !== "out") continue;
      fromIds = resolveWorkGroupExitNodeIds(group, draft.nodes);
    }
    if (targetIsGroup) {
      const group = groupsById.get(edge.target);
      if (!group) continue;
      const port = inferWorkGroupPort("target", edge.workGroupPort);
      if (port !== "in") continue;
      if (group.collaborationMode === "parallel_join") {
        toIds = listWorkGroupSurfaceAgentIds(group, draft.nodes);
      } else {
        const entry = resolveWorkGroupEntryNodeId(group, draft.nodes);
        toIds = entry ? [entry] : [];
      }
    }

    let index = 0;
    for (const from of fromIds) {
      for (const to of toIds) {
        rewritten.push({
          id: `${edge.id}_wg_${index++}`,
          from,
          to,
          kind,
          when: edge.prompt?.trim() || undefined,
          ...(edge.branchKey ? { branchKey: edge.branchKey } : {}),
          ...(kind === "conditional" && !edge.branchKey
            ? { branchKey: "default" }
            : {}),
          carry: kind === "feedback" ? ["latest_failure_summary"] : undefined,
        });
      }
    }
  }

  return rewritten;
}

function mergeSpecEdges(base: LoopSpecEdge[], extra: LoopSpecEdge[]): LoopSpecEdge[] {
  const seen = new Set(base.map((edge) => `${edge.from}->${edge.to}:${edge.kind}`));
  const merged = [...base];
  for (const edge of extra) {
    const key = `${edge.from}->${edge.to}:${edge.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(edge);
  }
  return merged;
}

/** Deterministic heuristic compiler used by MVP and mock path (no live LLM required). */
export function compileIntentGraphHeuristic(
  draft: IntentGraph,
  options?: { now?: string },
): LoopCompileResult {
  const now = options?.now ?? new Date().toISOString();
  const dutyNodes = draft.nodes.filter((node) => !isConfigNode(node));
  const assumptions: LoopAssumption[] = [];
  const cycleGates: LoopCycleGate[] = [];

  for (const issue of validateAgentWiringGraph(draft)) {
    assumptions.push({
      id: `assume_${randomUUID()}`,
      text: `Agent wiring: ${issue.message}`,
    });
  }

  if (!draft.graphPrompt.trim() && dutyNodes.length > 0) {
    assumptions.push({
      id: `assume_${randomUUID()}`,
      text: "Graph-level goal was empty; inferred from the first node prompt.",
    });
  }

  const workGroups = draft.workGroups ?? [];
  for (const issue of validateLoopWorkGroups(draft, { forCompile: true })) {
    assumptions.push({
      id: `assume_${randomUUID()}`,
      text: `Work group [${issue.code}]: ${issue.message}`,
    });
  }

  const nodes: LoopSpecNode[] = dutyNodes.map((node) => {
    const compiled = compileSpecNode(node, draft);
    if (!node.role || node.role === "unknown" || !node.type) {
      assumptions.push({
        id: `assume_${randomUUID()}`,
        text: `Inferred architecture type="${compiled.type}" role="${compiled.role}" for node "${node.title}".`,
      });
    }
    return compiled;
  });

  const edges: LoopSpecEdge[] = rewriteWorkGroupBoundaryEdges(draft, workGroups);

  for (const edge of edges) {
    if (edge.kind === "feedback") {
      cycleGates.push({
        edgeId: edge.id,
        isFeedback: true,
        triggerWhen: edge.when || "Verification failed",
        retain: ["latest_failure_summary"],
        maxRounds: 5,
        onContinuousFailure: "pause_hitl",
      });
    }
  }

  const internalEdges: LoopSpecEdge[] = [];
  for (const group of workGroups) {
    for (const edge of expandWorkGroupInternalEdges(group, draft.nodes)) {
      internalEdges.push({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        kind: "depends",
        when: edge.when,
      });
    }
  }
  const mergedEdges = mergeSpecEdges(edges, internalEdges);

  const goal =
    draft.graphPrompt.trim() ||
    dutyNodes[0]?.prompt.trim() ||
    dutyNodes[0]?.title ||
    "Complete the loop";

  const openQuestions = cycleGates.map((gate) => ({
    id: `q_${gate.edgeId}`,
    question: `Confirm feedback edge ${gate.edgeId}: ${gate.triggerWhen}. Stop after ${gate.maxRounds} rounds and pause for HITL on continuous failure?`,
    options: ["Confirm as written", "Pause for human on first failure", "Disable feedback"],
  }));

  const hasGithubPr = nodes.some(
    (node) =>
      node.type === "action" &&
      node.actionIntegration === "github" &&
      node.actionOperation === "create_pr",
  );

  const specDraft: LoopSpec = {
    version: `spec_${randomUUID()}`,
    graphRevision: draft.revision,
    goal,
    nodes:
      nodes.length > 0
        ? nodes
        : [
            {
              id: "placeholder",
              role: "implement",
              type: "agent",
              agentRole: "coder",
              goal: goal,
              constraints: [],
              inputs: [],
              outputs: [],
              acceptance: [
                {
                  id: "acc_placeholder",
                  description: "Define at least one intent node",
                  kind: "human",
                },
              ],
            },
          ],
    edges: mergedEdges,
    acceptance: [
      {
        id: "acc_global",
        description: goal,
        kind: "human",
      },
    ],
    retryPolicy: { onFailure: "retry", maxAutoRetries: 3 },
    stopPolicy: {
      maxRounds: cycleGates[0]?.maxRounds ?? 5,
    },
    permissions: [
      {
        id: "perm_write",
        action: "write_files",
        scope: "workspace",
        requiresApproval: true,
      },
      ...(hasGithubPr
        ? [
            {
              id: "perm_create_pr",
              action: "github.create_pr",
              scope: "repository",
              requiresApproval: true,
            },
          ]
        : []),
    ],
    openQuestions,
    assumptions,
    cycleGates,
    ...(workGroups.length > 0 ? { workGroups } : {}),
    createdAt: now,
  };

  // Soft-validate; still return for Review even if topology is incomplete.
  void validateLoopSpecTopology(specDraft);

  return LoopCompileResultSchema.parse({
    specDraft,
    assumptions,
    cycleGates,
  });
}

export type LoopGraphCompiler = (
  draft: IntentGraph,
) => Promise<LoopCompileResult> | LoopCompileResult;

export async function compileLoopGraphDraft(
  draft: IntentGraph,
  compiler: LoopGraphCompiler = compileIntentGraphHeuristic,
): Promise<LoopCompileResult> {
  return LoopCompileResultSchema.parse(await compiler(draft));
}
