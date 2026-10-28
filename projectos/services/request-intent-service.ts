import { createHash } from "node:crypto";

import type { FunctionalNode, ProjectGraph } from "../contracts/graph.js";
import {
  RequestIntentSchema,
  type RequestIntent,
} from "../contracts/request-intent.js";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function intentHash(intent: RequestIntent): string {
  const { approvalHash: _approvalHash, approvedAt: _approvedAt, status: _status, ...content } = intent;
  return `sha256:${createHash("sha256").update(JSON.stringify(stableValue(content))).digest("hex")}`;
}

function ancestorIds(node: FunctionalNode, nodes: Map<string, FunctionalNode>): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  let current: FunctionalNode | undefined = node;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.level && current.level !== "code") ids.push(current.id);
    current = current.parentId ? nodes.get(current.parentId) : undefined;
  }
  return ids;
}

export function smallestPlannerNode(
  graph: ProjectGraph,
  touchedNodeIds: readonly string[],
): string | null {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const chains = touchedNodeIds.map((id) => {
    const node = nodes.get(id);
    if (!node) throw new Error(`Intent references unknown node '${id}'`);
    return ancestorIds(node, nodes);
  });
  if (chains.length === 0 || chains.some((chain) => chain.length === 0)) return null;
  return chains[0]!.find((id) => chains.every((chain) => chain.includes(id))) ?? null;
}

/** A touched node grants work in its subtree and permits planners on its ancestor route. */
export function intentAllowsNode(
  intent: RequestIntent,
  graph: ProjectGraph,
  candidateNodeId: string,
): boolean {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const candidate = nodes.get(candidateNodeId);
  if (!candidate) return false;
  return intent.touches.some((touch) => {
    const touched = nodes.get(touch.nodeId);
    if (!touched) return false;
    const candidateAncestors = ancestorIds(candidate, nodes);
    const touchedAncestors = ancestorIds(touched, nodes);
    return candidateNodeId === touch.nodeId ||
      candidateAncestors.includes(touch.nodeId) ||
      touchedAncestors.includes(candidateNodeId);
  });
}

export function intentAllowsFile(
  intent: RequestIntent,
  graph: ProjectGraph,
  filePath: string,
  operation: "modify" | "create" | "delete",
  candidateNodeId?: string,
): boolean {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const ownerIds = new Set(graph.nodes
    .filter((node) => node.level === "component" && node.linkedFiles.some((file) => file.path === filePath))
    .map((node) => node.id));
  for (const file of graph.fileIndex.filter((entry) => entry.path === filePath)) {
    for (const nodeId of file.nodeIds) {
      if (nodes.get(nodeId)?.level === "component") ownerIds.add(nodeId);
    }
  }
  const owners = [...ownerIds].map((id) => ({ id, ancestors: ancestorIds(nodes.get(id)!, nodes) }));
  const touchesOwner = (ownerId: string, capability: "editExisting" | "addParts") => {
    const ancestors = owners.find((owner) => owner.id === ownerId)?.ancestors ?? [];
    return intent.touches.some((touch) => touch.allow[capability] && ancestors.includes(touch.nodeId));
  };

  if (operation === "create") {
    const parentNode = nodes.get(candidateNodeId ?? "");
    if (!parentNode) return false;
    const ancestors = ancestorIds(parentNode, nodes);
    return intent.touches.some((touch) => touch.allow.addParts && ancestors.includes(touch.nodeId));
  }
  if (operation === "delete") {
    return owners.length > 0 && owners.every((owner) => intent.touches.some((touch) =>
      touch.allow.deletePartIds.includes(owner.id) && owner.ancestors.includes(touch.nodeId)));
  }
  return owners.length > 0 && owners.every((owner) => touchesOwner(owner.id, "editExisting"));
}

export class RequestIntentService {
  normalizeDraft(graph: ProjectGraph, input: RequestIntent): RequestIntent {
    const parsed = RequestIntentSchema.parse(input);
    if (parsed.projectId !== graph.projectId) {
      throw new Error("Intent project does not match the graph");
    }
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    for (const touch of parsed.touches) {
      if (!nodeIds.has(touch.nodeId)) throw new Error(`Intent references unknown node '${touch.nodeId}'`);
      for (const deleteId of touch.allow.deletePartIds) {
        if (!nodeIds.has(deleteId)) throw new Error(`Intent deletes unknown node '${deleteId}'`);
      }
    }
    for (const effect of parsed.structuralEffects) {
      const referenced = effect.kind === "add_node"
        ? [effect.parentNodeId]
        : effect.kind === "delete_node"
          ? [effect.nodeId]
          : [effect.sourceNodeId, effect.targetNodeId];
      for (const nodeId of referenced) {
        if (!nodeIds.has(nodeId)) throw new Error(`Intent effect references unknown node '${nodeId}'`);
      }
    }
    return RequestIntentSchema.parse({
      ...parsed,
      entryNodeId: smallestPlannerNode(graph, parsed.touches.map((touch) => touch.nodeId)),
      status: "draft",
      approvalHash: undefined,
      approvedAt: undefined,
    });
  }

  approve(graph: ProjectGraph, input: RequestIntent, expectedRevision: number): RequestIntent {
    const draft = this.normalizeDraft(graph, input);
    if (draft.revision !== expectedRevision) throw new Error("Intent revision is stale");
    if (draft.questions.some((question) => !question.answer?.trim())) {
      throw new Error("Intent still has unanswered material questions");
    }
    const approvedAt = new Date().toISOString();
    const approvalHash = intentHash(draft);
    return RequestIntentSchema.parse({
      ...draft,
      status: "approved",
      approvedAt,
      approvalHash,
    });
  }

  isApprovalValid(intent: RequestIntent): boolean {
    return intent.status === "approved" && intent.approvalHash === intentHash(intent);
  }
}
