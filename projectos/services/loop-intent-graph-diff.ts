/**
 * Browser-safe IntentGraph structural diff helpers.
 * Keep free of node:crypto / node:fs so client/mock and workbench can import.
 */

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

/** Diff IntentGraph drafts for AI Edit review UI. */
export function diffIntentGraphs(
  base: { nodes: Array<{ id: string; title?: string }>; edges: Array<{ id: string }> },
  proposed: {
    nodes: Array<{ id: string; title?: string }>;
    edges: Array<{ id: string }>;
  },
): {
  addedNodeIds: string[];
  removedNodeIds: string[];
  changedNodeIds: string[];
  addedEdgeIds: string[];
  removedEdgeIds: string[];
  summaryLines: string[];
} {
  const baseNodes = new Map(base.nodes.map((node) => [node.id, node]));
  const proposedNodes = new Map(proposed.nodes.map((node) => [node.id, node]));
  const baseEdges = new Set(base.edges.map((edge) => edge.id));
  const proposedEdges = new Set(proposed.edges.map((edge) => edge.id));

  const addedNodeIds = [...proposedNodes.keys()].filter((id) => !baseNodes.has(id));
  const removedNodeIds = [...baseNodes.keys()].filter((id) => !proposedNodes.has(id));
  const changedNodeIds = [...proposedNodes.keys()].filter((id) => {
    const before = baseNodes.get(id);
    const after = proposedNodes.get(id);
    if (!before || !after) return false;
    return stableStringify(before) !== stableStringify(after);
  });
  const addedEdgeIds = [...proposedEdges].filter((id) => !baseEdges.has(id));
  const removedEdgeIds = [...baseEdges].filter((id) => !proposedEdges.has(id));

  const summaryLines: string[] = [];
  if (addedNodeIds.length) {
    summaryLines.push(
      `+${addedNodeIds.length} node(s): ${addedNodeIds
        .slice(0, 6)
        .map((id) => proposedNodes.get(id)?.title || id)
        .join(", ")}`,
    );
  }
  if (removedNodeIds.length) {
    summaryLines.push(
      `-${removedNodeIds.length} node(s): ${removedNodeIds
        .slice(0, 6)
        .map((id) => baseNodes.get(id)?.title || id)
        .join(", ")}`,
    );
  }
  if (changedNodeIds.length) {
    summaryLines.push(`~${changedNodeIds.length} node(s) changed`);
  }
  if (addedEdgeIds.length || removedEdgeIds.length) {
    summaryLines.push(
      `edges +${addedEdgeIds.length}/-${removedEdgeIds.length}`,
    );
  }
  if (summaryLines.length === 0) {
    summaryLines.push("No structural node/edge changes");
  }

  return {
    addedNodeIds,
    removedNodeIds,
    changedNodeIds,
    addedEdgeIds,
    removedEdgeIds,
    summaryLines,
  };
}
