import { randomUUID } from "node:crypto";

import {
  LoopCompileResultSchema,
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

function inferRole(node: IntentGraphNode): LoopSpecNode["role"] {
  return suggestIntentNodeRole(node);
}

function inferEdgeKind(
  edge: IntentGraph["edges"][number],
  nodesById: Map<string, IntentGraphNode>,
): LoopSpecEdge["kind"] {
  return suggestIntentEdgeKind(edge, [...nodesById.values()]);
}

function compileSpecNode(node: IntentGraphNode): LoopSpecNode {
  const arch = withArchitectureDefaults(node);
  const role = inferRole(node);
  const isTestAction =
    arch.type === "action" && arch.actionIntegration === "test";
  const isVerify = role === "verify" || isTestAction;
  return {
    id: node.id,
    role,
    type: arch.type,
    ...(arch.agentRole ? { agentRole: arch.agentRole } : {}),
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

/** Deterministic heuristic compiler used by MVP and mock path (no live LLM required). */
export function compileIntentGraphHeuristic(
  draft: IntentGraph,
  options?: { now?: string },
): LoopCompileResult {
  const now = options?.now ?? new Date().toISOString();
  const nodesById = new Map(draft.nodes.map((node) => [node.id, node]));
  const assumptions: LoopAssumption[] = [];
  const cycleGates: LoopCycleGate[] = [];

  if (!draft.graphPrompt.trim() && draft.nodes.length > 0) {
    assumptions.push({
      id: `assume_${randomUUID()}`,
      text: "Graph-level goal was empty; inferred from the first node prompt.",
    });
  }

  const nodes: LoopSpecNode[] = draft.nodes.map((node) => {
    const compiled = compileSpecNode(node);
    if (!node.role || node.role === "unknown" || !node.type) {
      assumptions.push({
        id: `assume_${randomUUID()}`,
        text: `Inferred architecture type="${compiled.type}" role="${compiled.role}" for node "${node.title}".`,
      });
    }
    return compiled;
  });

  const edges: LoopSpecEdge[] = draft.edges.map((edge) => {
    const kind = inferEdgeKind(edge, nodesById);
    if (kind === "feedback") {
      cycleGates.push({
        edgeId: edge.id,
        isFeedback: true,
        triggerWhen: edge.prompt?.trim() || "Verification failed",
        retain: ["latest_failure_summary"],
        maxRounds: 5,
        onContinuousFailure: "pause_hitl",
      });
    }
    return {
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
    };
  });

  const goal =
    draft.graphPrompt.trim() ||
    draft.nodes[0]?.prompt.trim() ||
    draft.nodes[0]?.title ||
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
    edges,
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
