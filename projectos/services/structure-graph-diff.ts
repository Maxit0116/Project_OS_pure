/**
 * Diff two ProjectGraph snapshots (c4studio `c4 diff` style).
 */

import type {
  ArchitectureView,
  FunctionalEdge,
  FunctionalNode,
  ProjectGraph,
} from "../contracts/graph.js";

export interface StructureGraphDiff {
  nodes: {
    added: string[];
    removed: string[];
    changed: string[];
  };
  edges: {
    added: string[];
    removed: string[];
    changed: string[];
  };
  views: {
    added: string[];
    removed: string[];
    changed: string[];
    /** Views a reviewer should reopen after this diff. */
    affected: string[];
  };
}

function nodeSignature(node: FunctionalNode): string {
  return [
    node.name,
    node.description,
    node.summary,
    node.responsibility ?? "",
    node.technology ?? "",
    node.parentId ?? "",
    node.level ?? "",
    node.elementType ?? "",
  ].join("\u0000");
}

function edgeSignature(edge: FunctionalEdge): string {
  return [
    edge.source,
    edge.target,
    edge.relation,
    edge.label ?? "",
    edge.technology ?? "",
  ].join("\u0000");
}

function viewSignature(view: ArchitectureView): string {
  return [
    view.title,
    view.level,
    view.parentId ?? "",
    view.focusNodeId ?? "",
    (view.includeNodeIds ?? []).join(","),
    (view.excludeNodeIds ?? []).join(","),
  ].join("\u0000");
}

function viewsTouchingNode(
  views: ArchitectureView[] | undefined,
  nodeId: string,
  nodes: FunctionalNode[],
): string[] {
  const node = nodes.find((item) => item.id === nodeId);
  if (!views?.length) return [];
  return views
    .filter((view) => {
      if (view.parentId === nodeId || view.focusNodeId === nodeId) return true;
      if (view.includeNodeIds?.includes(nodeId)) return true;
      if (node && view.level === node.level) {
        if (!view.parentId) return true;
        return node.parentId === view.parentId;
      }
      return false;
    })
    .map((view) => view.key);
}

export function diffStructureGraphs(
  from: ProjectGraph,
  to: ProjectGraph,
): StructureGraphDiff {
  const fromNodes = new Map(from.nodes.map((node) => [node.id, node]));
  const toNodes = new Map(to.nodes.map((node) => [node.id, node]));
  const fromEdges = new Map(from.edges.map((edge) => [edge.id, edge]));
  const toEdges = new Map(to.edges.map((edge) => [edge.id, edge]));
  const fromViews = new Map((from.views ?? []).map((view) => [view.key, view]));
  const toViews = new Map((to.views ?? []).map((view) => [view.key, view]));

  const nodesAdded: string[] = [];
  const nodesRemoved: string[] = [];
  const nodesChanged: string[] = [];
  for (const id of toNodes.keys()) {
    if (!fromNodes.has(id)) nodesAdded.push(id);
    else if (nodeSignature(fromNodes.get(id)!) !== nodeSignature(toNodes.get(id)!)) {
      nodesChanged.push(id);
    }
  }
  for (const id of fromNodes.keys()) {
    if (!toNodes.has(id)) nodesRemoved.push(id);
  }

  const edgesAdded: string[] = [];
  const edgesRemoved: string[] = [];
  const edgesChanged: string[] = [];
  for (const id of toEdges.keys()) {
    if (!fromEdges.has(id)) edgesAdded.push(id);
    else if (edgeSignature(fromEdges.get(id)!) !== edgeSignature(toEdges.get(id)!)) {
      edgesChanged.push(id);
    }
  }
  for (const id of fromEdges.keys()) {
    if (!toEdges.has(id)) edgesRemoved.push(id);
  }

  const viewsAdded: string[] = [];
  const viewsRemoved: string[] = [];
  const viewsChanged: string[] = [];
  for (const key of toViews.keys()) {
    if (!fromViews.has(key)) viewsAdded.push(key);
    else if (viewSignature(fromViews.get(key)!) !== viewSignature(toViews.get(key)!)) {
      viewsChanged.push(key);
    }
  }
  for (const key of fromViews.keys()) {
    if (!toViews.has(key)) viewsRemoved.push(key);
  }

  const affected = new Set<string>([...viewsAdded, ...viewsChanged, ...viewsRemoved]);
  for (const nodeId of [...nodesAdded, ...nodesRemoved, ...nodesChanged]) {
    for (const key of viewsTouchingNode(to.views ?? from.views, nodeId, to.nodes)) {
      affected.add(key);
    }
  }

  return {
    nodes: { added: nodesAdded, removed: nodesRemoved, changed: nodesChanged },
    edges: { added: edgesAdded, removed: edgesRemoved, changed: edgesChanged },
    views: {
      added: viewsAdded,
      removed: viewsRemoved,
      changed: viewsChanged,
      affected: [...affected],
    },
  };
}
