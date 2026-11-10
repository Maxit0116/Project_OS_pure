/**
 * Production-facing approval gate insert: rewire depends edges so the new
 * Human approval sits on the execution path (not an orphan decoration).
 */
import type { IntentGraph, IntentGraphEdge, IntentGraphNode } from "../contracts/loop-graph.js";
import { withArchitectureDefaults } from "../contracts/loop-node-architecture.js";

export type ApprovalGateTarget =
  /** Insert immediately before the coder/implement agent (gates writes). */
  | "before_write"
  /** Insert immediately before github/terminal/saas Actions (gates external). */
  | "before_external"
  /** Insert after coder, before test/verify (gates tests only — not writes). */
  | "before_test";

export type InsertApprovalGateOptions = {
  /** Prefer splitting depends edges that leave this node. */
  afterNodeId?: string;
  /**
   * Semantic insert target. When set (and afterNodeId omitted), picks the
   * predecessor of the named side-effect class — never claims broader gating.
   */
  gate?: ApprovalGateTarget;
  approvalNodeId?: string;
  title?: string;
  prompt?: string;
};

export type ApprovalGateWiringIssue = {
  code: "approval_orphaned" | "side_effect_ungated";
  message: string;
  nodeId?: string;
};

function isSideEffectAction(node: IntentGraphNode): boolean {
  const arch = withArchitectureDefaults(node);
  return (
    arch.type === "action" &&
    (arch.actionIntegration === "github" ||
      arch.actionIntegration === "terminal" ||
      arch.actionIntegration === "slack" ||
      arch.actionIntegration === "feishu" ||
      arch.actionIntegration === "lark")
  );
}

function dependsOutgoing(
  edges: IntentGraphEdge[],
  fromId: string,
): IntentGraphEdge[] {
  return edges.filter(
    (edge) =>
      edge.source === fromId &&
      (edge.kind === "depends" || edge.kind === undefined),
  );
}

function predecessorOf(
  draft: IntentGraph,
  nodeId: string,
): string | null {
  const inbound = draft.edges.find(
    (edge) =>
      edge.target === nodeId &&
      (edge.kind === "depends" || edge.kind === undefined),
  );
  return inbound?.source ?? null;
}

function pickInsertAfter(
  draft: IntentGraph,
  preferred?: string,
  gate?: ApprovalGateTarget,
): string | null {
  if (preferred && draft.nodes.some((node) => node.id === preferred)) {
    return preferred;
  }

  if (gate === "before_write") {
    // Gate coding writes: insert after planner (or entry) → before coder.
    const coder = draft.nodes.find((node) => {
      const arch = withArchitectureDefaults(node);
      return (
        (arch.type === "agent" && arch.agentRole === "coder") ||
        node.role === "implement"
      );
    });
    if (coder) {
      return predecessorOf(draft, coder.id) ?? draft.nodes[0]?.id ?? null;
    }
  }

  if (gate === "before_external") {
    const external = draft.nodes.find(isSideEffectAction);
    if (external) {
      return predecessorOf(draft, external.id) ?? draft.nodes[0]?.id ?? null;
    }
  }

  // before_test (default): after coder / before test — does NOT gate writes.
  const coder = draft.nodes.find((node) => {
    const arch = withArchitectureDefaults(node);
    return arch.type === "agent" && arch.agentRole === "coder";
  });
  if (coder && (!gate || gate === "before_test")) return coder.id;
  const implement = draft.nodes.find((node) => node.role === "implement");
  if (implement && (!gate || gate === "before_test")) return implement.id;
  const test = draft.nodes.find((node) => {
    const arch = withArchitectureDefaults(node);
    return (
      (arch.type === "action" && arch.actionIntegration === "test") ||
      node.role === "verify"
    );
  });
  if (test) return predecessorOf(draft, test.id);
  return draft.nodes[0]?.id ?? null;
}

/**
 * Insert a Human approval node and split outbound depends edges from the
 * insertion point: A→B becomes A→approval (keeps original edge id) and
 * approval→B (new edge id). Other edges keep their ids/config.
 */
export function insertApprovalGate(
  draft: IntentGraph,
  options: InsertApprovalGateOptions = {},
): IntentGraph {
  const afterId = pickInsertAfter(draft, options.afterNodeId, options.gate);
  if (!afterId) {
    throw new Error("Cannot insert approval gate into an empty draft");
  }
  const approvalId = options.approvalNodeId ?? "n_loopback_approval";
  if (draft.nodes.some((node) => node.id === approvalId)) {
    return draft;
  }
  const afterNode = draft.nodes.find((node) => node.id === afterId)!;
  const outgoing = dependsOutgoing(draft.edges, afterId);
  if (outgoing.length === 0) {
    throw new Error(
      `No depends edge leaving “${afterId}” to rewire — refuse orphan approval insert`,
    );
  }

  const approval: IntentGraphNode = {
    id: approvalId,
    title: options.title ?? "Approval gate",
    prompt: options.prompt ?? "Approve before continue",
    type: "human",
    humanMode: "approval",
    humanAssignee: "operator",
    position: {
      x: (afterNode.position?.x ?? 0) + 240,
      y: (afterNode.position?.y ?? 0) + 40,
    },
  };

  const remove = new Set(outgoing.map((edge) => edge.id));
  const rewired: IntentGraphEdge[] = [];
  for (const edge of outgoing) {
    // Preserve original edge id on the inbound half (A → approval).
    rewired.push({
      ...edge,
      target: approvalId,
      prompt: edge.prompt?.trim()
        ? `${edge.prompt} (via approval)`
        : "Hand off to approval gate",
    });
    rewired.push({
      id: `e_appr_${edge.id}`,
      source: approvalId,
      target: edge.target,
      kind: edge.kind ?? "depends",
      prompt: "Continue after approval",
    });
  }

  return {
    ...draft,
    nodes: [...draft.nodes, approval],
    edges: [
      ...draft.edges.filter((edge) => !remove.has(edge.id)),
      ...rewired,
    ],
  };
}

/**
 * Structural checks: approval must sit on a depends path; side-effect Actions
 * should not be reachable from entry while bypassing every approval gate.
 */
export function validateApprovalGateWiring(
  draft: IntentGraph,
): ApprovalGateWiringIssue[] {
  const issues: ApprovalGateWiringIssue[] = [];
  const approvals = draft.nodes.filter((node) => {
    const arch = withArchitectureDefaults(node);
    return arch.type === "human" && arch.humanMode === "approval";
  });

  for (const approval of approvals) {
    const inbound = draft.edges.some(
      (edge) =>
        edge.target === approval.id &&
        (edge.kind === "depends" || edge.kind === undefined),
    );
    const outbound = draft.edges.some(
      (edge) =>
        edge.source === approval.id &&
        (edge.kind === "depends" || edge.kind === undefined),
    );
    if (!inbound || !outbound) {
      issues.push({
        code: "approval_orphaned",
        nodeId: approval.id,
        message: `Approval “${approval.title}” is not wired on a depends path (inbound=${inbound}, outbound=${outbound}) — refuse run until reconnected`,
      });
    }
  }

  const sideEffects = draft.nodes.filter(isSideEffectAction);
  if (sideEffects.length === 0 || approvals.length === 0) {
    return issues;
  }

  // BFS from nodes with no inbound depends (entry candidates).
  const inboundCount = new Map<string, number>();
  for (const node of draft.nodes) inboundCount.set(node.id, 0);
  for (const edge of draft.edges) {
    if (edge.kind && edge.kind !== "depends") continue;
    inboundCount.set(edge.target, (inboundCount.get(edge.target) ?? 0) + 1);
  }
  const entries = draft.nodes
    .filter((node) => (inboundCount.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const approvalIds = new Set(approvals.map((node) => node.id));

  for (const side of sideEffects) {
    // Reachable from some entry without visiting an approval?
    const queue = [...entries];
    const seen = new Set<string>();
    let ungated = false;
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(id) || approvalIds.has(id)) continue;
      seen.add(id);
      if (id === side.id) {
        ungated = true;
        break;
      }
      for (const edge of dependsOutgoing(draft.edges, id)) {
        queue.push(edge.target);
      }
    }
    if (ungated) {
      issues.push({
        code: "side_effect_ungated",
        nodeId: side.id,
        message: `Side-effect Action “${side.title}” is reachable without passing an approval gate`,
      });
    }
  }

  return issues;
}
