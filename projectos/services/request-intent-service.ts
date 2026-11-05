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

/** Every component that owns a file, whether it links the file or the file index names it. */
function fileOwners(
  graph: ProjectGraph,
  filePath: string,
): Array<{ id: string; ancestors: string[] }> {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const ownerIds = new Set(graph.nodes
    .filter((node) => node.level === "component" && node.linkedFiles.some((file) => file.path === filePath))
    .map((node) => node.id));
  for (const file of graph.fileIndex.filter((entry) => entry.path === filePath)) {
    for (const nodeId of file.nodeIds) {
      if (nodes.get(nodeId)?.level === "component") ownerIds.add(nodeId);
    }
  }
  return [...ownerIds].map((id) => ({ id, ancestors: ancestorIds(nodes.get(id)!, nodes) }));
}

function allowsEditingOwner(intent: RequestIntent, owner: { ancestors: string[] }): boolean {
  return intent.touches.some((touch) => touch.allow.editExisting && owner.ancestors.includes(touch.nodeId));
}

/**
 * Owners of a file that an intent would have to cover before the file may be modified, and does
 * not. A shared file changes every capability that links it, so the approver has to see all of them.
 */
export function uncoveredFileOwnerIds(
  intent: RequestIntent,
  graph: ProjectGraph,
  filePath: string,
): string[] {
  return fileOwners(graph, filePath)
    .filter((owner) => !allowsEditingOwner(intent, owner))
    .map((owner) => owner.id);
}

/**
 * A file the change edits may be linked by several components. Publishing it changes all of them, and
 * the approval boundary requires every owner to be covered, so the draft states the co-owners itself
 * instead of leaving the approver to learn about them from a failure after the run. The files are the
 * one the person asked for and those the model declared while reading the code. A file none of the
 * touches allows editing is left alone: nothing in the intent grants access to it, so a derived
 * touch would hand out edit rights nobody asked for.
 */
function sharedFileOwnerTouches(graph: ProjectGraph, intent: RequestIntent): RequestIntent["touches"] {
  const indexed = new Set(graph.fileIndex.map((entry) => entry.path));
  for (const node of graph.nodes) for (const file of node.linkedFiles) indexed.add(file.path);
  const declared = [...new Set([
    ...(intent.requestedFile ? [intent.requestedFile.path] : []),
    ...intent.touches.flatMap((touch) => touch.files ?? []),
  ])].filter((path) => indexed.has(path));
  const names = new Map(graph.nodes.map((node) => [node.id, node.name]));
  const derived = new Map<string, { files: string[]; coveredNames: Set<string> }>();
  for (const path of declared) {
    const owners = fileOwners(graph, path);
    const covered = owners.filter((owner) => allowsEditingOwner(intent, owner));
    if (covered.length === 0) continue;
    for (const owner of owners.filter((candidate) => !allowsEditingOwner(intent, candidate))) {
      const entry = derived.get(owner.id) ?? { files: [], coveredNames: new Set<string>() };
      entry.files.push(path);
      for (const coveredOwner of covered) entry.coveredNames.add(names.get(coveredOwner.id) ?? coveredOwner.id);
      derived.set(owner.id, entry);
    }
  }
  return [...derived].map(([nodeId, entry]) => ({
    nodeId,
    reason: `Shares ${entry.files.join(", ")} with ${[...entry.coveredNames].join(", ")}; changing the file also changes this capability.`,
    allow: { editExisting: true, addParts: false, deletePartIds: [] },
    derived: true as const,
  }));
}

/**
 * Of the files a planner could pick, the ones the approved intent lets it modify, and why it
 * withholds the rest. A file several capabilities share is withheld unless every owner is approved;
 * picking one anyway used to fail at the very end, after the models had done all their work.
 */
export function splitFilesByApprovedIntent(
  intent: RequestIntent,
  graph: ProjectGraph,
  filePaths: readonly string[],
): { allowed: string[]; withheld: Array<{ path: string; uncoveredOwnerIds: string[] }> } {
  const allowed: string[] = [];
  const withheld: Array<{ path: string; uncoveredOwnerIds: string[] }> = [];
  for (const path of filePaths) {
    if (intentAllowsFile(intent, graph, path, "modify")) allowed.push(path);
    else withheld.push({ path, uncoveredOwnerIds: uncoveredFileOwnerIds(intent, graph, path) });
  }
  return { allowed, withheld };
}

/**
 * Of the graph children a planner could delegate to, the ones the request's own work reaches: a
 * child that is, contains, or sits under a node the intent really touches. Capabilities added only
 * because they share a file with the work (derived touches) are approval coverage, not work; offered
 * as targets, a planner fanned out to eight components for a three-component change.
 */
export function plannerChildrenForIntent(
  intent: RequestIntent,
  graph: ProjectGraph,
  childIds: readonly string[],
): string[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const worked = intent.touches.filter((touch) => !touch.derived);
  const reached = childIds.filter((childId) => {
    const child = nodes.get(childId);
    if (!child) return false;
    const childChain = ancestorIds(child, nodes);
    return worked.some((touch) => {
      const touched = nodes.get(touch.nodeId);
      if (!touched) return false;
      return childId === touch.nodeId ||
        ancestorIds(touched, nodes).includes(childId) ||
        childChain.includes(touch.nodeId);
    });
  });
  // An intent that reaches none of them (an add-node request under a container, say) leaves the list alone.
  return reached.length > 0 ? reached : [...childIds];
}

export function intentAllowsFile(
  intent: RequestIntent,
  graph: ProjectGraph,
  filePath: string,
  operation: "modify" | "create" | "delete",
  candidateNodeId?: string,
): boolean {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const owners = fileOwners(graph, filePath);
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

export function intentAllowsNodeAddition(
  intent: RequestIntent,
  parentNodeId: string,
  name: string,
  level: "context" | "container" | "component",
  wiring: readonly {
    existingNodeId: string;
    direction: "from_new" | "to_new";
    relation: string;
    label: string;
    purpose?: string | undefined;
  }[],
): boolean {
  return intent.structuralEffects.some((effect) =>
    effect.kind === "add_node" &&
    effect.parentNodeId === parentNodeId &&
    effect.name === name &&
    effect.level === level &&
    structuralWiringKey(effect.wiring ?? []) === structuralWiringKey(wiring));
}

function structuralWiringKey(wiring: readonly {
  existingNodeId: string;
  direction: "from_new" | "to_new";
  relation: string;
  label: string;
  purpose?: string | undefined;
}[]): string {
  return JSON.stringify(wiring.map((edge) => ({
    existingNodeId: edge.existingNodeId,
    direction: edge.direction,
    relation: edge.relation,
    label: edge.label,
    ...(edge.purpose ? { purpose: edge.purpose } : {}),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))));
}

export function intentAllowsNodeDeletion(
  intent: RequestIntent,
  nodeId: string,
  descendantCount: number,
  ownedFileCount: number,
): boolean {
  return intent.structuralEffects.some((effect) =>
    effect.kind === "delete_node" && effect.nodeId === nodeId &&
    effect.descendantCount === descendantCount && effect.ownedFileCount === ownedFileCount);
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
        ? [effect.parentNodeId, ...(effect.wiring ?? []).map((wire) => wire.existingNodeId)]
        : effect.kind === "delete_node"
          ? [effect.nodeId]
          : [effect.sourceNodeId, effect.targetNodeId];
      for (const nodeId of referenced) {
        if (!nodeIds.has(nodeId)) throw new Error(`Intent effect references unknown node '${nodeId}'`);
      }
    }
    const touches = [...parsed.touches, ...sharedFileOwnerTouches(graph, parsed)];
    return RequestIntentSchema.parse({
      ...parsed,
      touches,
      // Routing follows the work the model planned. A co-owner added only for approval must not
      // lift a one-file change into a multi-node plan.
      entryNodeId: smallestPlannerNode(
        graph,
        touches.filter((touch) => !touch.derived).map((touch) => touch.nodeId),
      ),
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
