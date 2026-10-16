/**
 * Impact analysis for a node (c4studio `c4 impact` style).
 */

import type { ProjectGraph } from "../contracts/graph.js";

export interface StructureGraphImpact {
  nodeId: string;
  dependents: Array<{ id: string; distance: number }>;
  dependencies: Array<{ id: string; distance: number }>;
  views: string[];
}

function walk(
  startId: string,
  adjacency: Map<string, string[]>,
  maxDepth: number,
): Array<{ id: string; distance: number }> {
  const result: Array<{ id: string; distance: number }> = [];
  const seen = new Set<string>([startId]);
  let frontier = [startId];
  for (let distance = 1; distance <= maxDepth && frontier.length > 0; distance += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        result.push({ id: neighbor, distance });
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return result;
}

export function impactStructureGraph(
  graph: ProjectGraph,
  nodeId: string,
  options?: { depth?: number },
): StructureGraphImpact {
  const depth = options?.depth ?? 2;
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  if (!nodesById.has(nodeId)) {
    return { nodeId, dependents: [], dependencies: [], views: [] };
  }

  const outbound = new Map<string, string[]>();
  const inbound = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, from: string, to: string) => {
    const list = map.get(from) ?? [];
    list.push(to);
    map.set(from, list);
  };

  for (const edge of graph.edges) {
    add(outbound, edge.source, edge.target);
    add(inbound, edge.target, edge.source);
  }
  // Containment counts in both directions (Structurizr / c4studio rule).
  for (const node of graph.nodes) {
    if (!node.parentId) continue;
    add(outbound, node.parentId, node.id);
    add(inbound, node.id, node.parentId);
    add(outbound, node.id, node.parentId);
    add(inbound, node.parentId, node.id);
  }

  const views = (graph.views ?? [])
    .filter((view) => {
      if (view.parentId === nodeId || view.focusNodeId === nodeId) return true;
      if (view.includeNodeIds?.includes(nodeId)) return true;
      const node = nodesById.get(nodeId);
      if (!node || view.level !== node.level) return false;
      if (!view.parentId) return true;
      return node.parentId === view.parentId;
    })
    .map((view) => view.key);

  return {
    nodeId,
    dependents: walk(nodeId, inbound, depth),
    dependencies: walk(nodeId, outbound, depth),
    views,
  };
}
