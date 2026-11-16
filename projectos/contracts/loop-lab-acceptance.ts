/**
 * Lab node acceptance — merge upstream Agent acceptance until a barrier.
 *
 * Barrier: previous Human (approval/review/…) or Lab action node on the
 * reverse depends path. Collects every Agent node's acceptance along the way.
 */

import type { LoopAcceptanceItem, LoopSpec, LoopSpecNode } from "./loop-graph.js";
import { resolveNodeArchitecture } from "./loop-node-architecture.js";

export type LoopLabAcceptanceItem = LoopAcceptanceItem & {
  sourceNodeId: string;
  sourceNodeTitle?: string;
};

function isLabActionNode(node: LoopSpecNode): boolean {
  const arch = resolveNodeArchitecture(node);
  return arch.type === "action" && arch.actionIntegration === "lab";
}

function isBarrierNode(node: LoopSpecNode): boolean {
  const arch = resolveNodeArchitecture(node);
  return arch.type === "human" || isLabActionNode(node);
}

function isAgentDutyNode(node: LoopSpecNode): boolean {
  return resolveNodeArchitecture(node).type === "agent";
}

/** Reverse BFS along depends/feedback/conditional/fallback edges. */
export function collectUpstreamAgentAcceptance(
  spec: LoopSpec,
  labNodeId: string,
): LoopLabAcceptanceItem[] {
  const byId = new Map(spec.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, string[]>();
  for (const edge of spec.edges) {
    if (
      edge.kind !== "depends" &&
      edge.kind !== "feedback" &&
      edge.kind !== "conditional" &&
      edge.kind !== "fallback"
    ) {
      continue;
    }
    const list = incoming.get(edge.to) ?? [];
    list.push(edge.from);
    incoming.set(edge.to, list);
  }

  const collected: LoopLabAcceptanceItem[] = [];
  const seenAcceptance = new Set<string>();
  const visited = new Set<string>();
  const queue: string[] = [...(incoming.get(labNodeId) ?? [])];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (!node) continue;
    if (node.id === labNodeId) continue;
    if (isBarrierNode(node)) {
      // Stop traversing through this barrier (do not enqueue its parents).
      continue;
    }
    if (isAgentDutyNode(node)) {
      for (const item of node.acceptance ?? []) {
        const key = `${node.id}::${item.id}`;
        if (seenAcceptance.has(key)) continue;
        seenAcceptance.add(key);
        collected.push({
          ...item,
          sourceNodeId: node.id,
          sourceNodeTitle: node.goal?.slice(0, 80),
        });
      }
    }
    for (const parent of incoming.get(id) ?? []) {
      if (!visited.has(parent)) queue.push(parent);
    }
  }

  return collected;
}
