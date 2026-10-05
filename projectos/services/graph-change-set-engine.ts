import {
  GraphChangeSetSchema,
  ProjectGraphSchema,
  type GraphChangeOperation,
  type GraphChangeSet,
  type GraphNodeReference,
  type MapContentDocument,
  type ProjectGraph,
  type SemanticTree,
  type SemanticTreeNode,
} from "../contracts/index.js";

export type GraphChangeSetErrorCode =
  | "invalid_change_set"
  | "project_mismatch"
  | "stale_graph"
  | "unknown_reference"
  | "server_id_collision"
  | "illegal_hierarchy"
  | "hierarchy_cycle"
  | "dangling_edge"
  | "duplicate_edge"
  | "ownership_mismatch"
  | "dangling_external_reference"
  | "incomplete_delete";

export class GraphChangeSetError extends Error {
  constructor(
    readonly code: GraphChangeSetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GraphChangeSetError";
  }
}

export interface GraphChangeSetIdFactory {
  nodeId(tempRef: string): string;
  edgeId(tempRef: string): string;
}

export interface GraphReferenceSnapshot {
  semanticTree?: SemanticTree;
  mapContent?: MapContentDocument;
}

export interface ApplyGraphChangeSetInput {
  graph: ProjectGraph;
  changeSet: GraphChangeSet;
  idFactory: GraphChangeSetIdFactory;
  references?: GraphReferenceSnapshot;
}

export interface ApplyGraphChangeSetResult {
  graph: ProjectGraph;
  graphHash: string;
  resolvedNodeIds: Record<string, string>;
  resolvedEdgeIds: Record<string, string>;
}

const LEGAL_CHILD_LEVEL = {
  context: "container",
  container: "component",
  component: "code",
  code: null,
} as const;

export async function computeProjectGraphHash(graph: ProjectGraph): Promise<string> {
  const canonical = JSON.stringify(sortCanonicalValue({
    ...graph,
    fileIndex: [...graph.fileIndex].sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
  }));
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return `sha256:${[...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

export async function applyGraphChangeSet(
  input: ApplyGraphChangeSetInput,
): Promise<ApplyGraphChangeSetResult> {
  const parsedGraph = ProjectGraphSchema.safeParse(input.graph);
  const parsedChangeSet = GraphChangeSetSchema.safeParse(input.changeSet);
  if (!parsedGraph.success || !parsedChangeSet.success) {
    throw new GraphChangeSetError("invalid_change_set", "Graph or change set is invalid");
  }
  const graph = structuredClone(parsedGraph.data);
  const changeSet = parsedChangeSet.data;
  if (changeSet.projectId !== graph.projectId) {
    throw new GraphChangeSetError("project_mismatch", "Change set belongs to another project");
  }
  if ((await computeProjectGraphHash(graph)) !== changeSet.baseGraphHash) {
    throw new GraphChangeSetError("stale_graph", "Graph changed after the change set was prepared");
  }

  const temporaryNodeIds = allocateIds(
    changeSet.operations.filter(isAddNode),
    graph.nodes.map((node) => node.id),
    (operation) => operation.tempRef,
    (operation) => input.idFactory.nodeId(operation.tempRef),
  );
  const temporaryEdgeIds = allocateIds(
    changeSet.operations.filter(isAddEdge),
    graph.edges.map((edge) => edge.id),
    (operation) => operation.tempRef,
    (operation) => input.idFactory.edgeId(operation.tempRef),
  );
  const resolveNode = (reference: GraphNodeReference): string => {
    const id = reference.kind === "existing"
      ? reference.nodeId
      : temporaryNodeIds.get(reference.tempRef);
    if (!id) {
      throw new GraphChangeSetError("unknown_reference", "Change set contains an unknown node reference");
    }
    return id;
  };

  validateDeleteDeclarations(
    graph,
    changeSet.operations,
    resolveNode,
    temporaryEdgeIds,
    input.references,
  );

  const remainingAddNodes = changeSet.operations.filter(isAddNode);
  while (remainingAddNodes.length > 0) {
    const readyIndex = remainingAddNodes.findIndex((operation) => {
      const parent = operation.parent;
      return !parent || parent.kind === "existing" ||
        graph.nodes.some((node) => node.id === temporaryNodeIds.get(parent.tempRef));
    });
    if (readyIndex < 0) {
      throw new GraphChangeSetError("hierarchy_cycle", "Temporary node parents contain a cycle");
    }
    const [operation] = remainingAddNodes.splice(readyIndex, 1);
    applyNonDeleteOperation(graph, operation!, resolveNode, temporaryNodeIds, temporaryEdgeIds);
  }
  for (const operation of changeSet.operations) {
    if (operation.kind === "deleteNode" || operation.kind === "addNode") continue;
    applyNonDeleteOperation(graph, operation, resolveNode, temporaryNodeIds, temporaryEdgeIds);
  }
  const deleteOperations = changeSet.operations
    .filter((operation): operation is Extract<GraphChangeOperation, { kind: "deleteNode" }> =>
      operation.kind === "deleteNode")
    .sort((left, right) => nodeDepth(graph, resolveNode(right.node)) - nodeDepth(graph, resolveNode(left.node)));
  for (const operation of deleteOperations) {
    applyDeleteOperation(graph, operation, resolveNode);
  }

  validateGraphInvariants(graph);
  recomputeDerivedTopology(graph);
  const result = ProjectGraphSchema.safeParse(graph);
  if (!result.success) {
    throw new GraphChangeSetError("invalid_change_set", "Change set produced an invalid project graph");
  }
  return {
    graph: result.data,
    graphHash: await computeProjectGraphHash(result.data),
    resolvedNodeIds: Object.fromEntries(temporaryNodeIds),
    resolvedEdgeIds: Object.fromEntries(temporaryEdgeIds),
  };
}

function applyNonDeleteOperation(
  graph: ProjectGraph,
  operation: Exclude<GraphChangeOperation, { kind: "deleteNode" }>,
  resolveNode: (reference: GraphNodeReference) => string,
  nodeIds: Map<string, string>,
  edgeIds: Map<string, string>,
): void {
  if (operation.kind === "addNode") {
    const id = nodeIds.get(operation.tempRef)!;
    const parentId = operation.parent ? resolveNode(operation.parent) : null;
    graph.nodes.push({
      id,
      ...operation.node,
      parentId,
      children: [],
      upstream: [],
      downstream: [],
      refs: [],
      confidence: 1,
    });
    if (parentId) requireNode(graph, parentId).children?.push(id);
    for (const linkedFile of operation.node.linkedFiles) {
      const file = graph.fileIndex.find((candidate) => candidate.path === linkedFile.path);
      if (!file) throw new GraphChangeSetError("ownership_mismatch", "Added node links an unknown file");
      if (!file.nodeIds.includes(id)) file.nodeIds.push(id);
    }
    return;
  }
  if (operation.kind === "updateNodeFields") {
    const node = requireNode(graph, resolveNode(operation.node));
    for (const [key, value] of Object.entries(operation.fields)) {
      if (key === "technology" && value === null) delete node.technology;
      else Object.assign(node, { [key]: value });
    }
    return;
  }
  if (operation.kind === "moveNode") {
    const node = requireNode(graph, resolveNode(operation.node));
    const nextParentId = operation.newParent ? resolveNode(operation.newParent) : null;
    if (node.parentId) {
      const oldParent = requireNode(graph, node.parentId);
      oldParent.children = (oldParent.children ?? []).filter((id) => id !== node.id);
    }
    node.parentId = nextParentId;
    if (nextParentId) {
      const nextParent = requireNode(graph, nextParentId);
      nextParent.children = [...(nextParent.children ?? []), node.id];
    }
    return;
  }
  if (operation.kind === "addEdge") {
    graph.edges.push({
      id: edgeIds.get(operation.tempRef)!,
      source: resolveNode(operation.source),
      target: resolveNode(operation.target),
      relation: operation.relation,
      label: operation.label,
      purpose: operation.purpose,
      technology: operation.technology,
      evidence: operation.evidence,
      confidence: 1,
    });
    return;
  }
  if (operation.kind === "addOwnedFile") {
    const owner = requireNode(graph, resolveNode(operation.owner));
    if (owner.level !== "component" || owner.elementType !== "component") {
      throw new GraphChangeSetError(
        "ownership_mismatch",
        "New product files must be owned by a component node",
      );
    }
    assertSafeProductFilePath(operation.path);
    if (
      graph.fileIndex.some((file) => file.path === operation.path) ||
      graph.nodes.some((node) =>
        node.linkedFiles.some((linked) => linked.path === operation.path))
    ) {
      throw new GraphChangeSetError(
        "ownership_mismatch",
        "New product file path is already represented in the graph",
      );
    }
    graph.fileIndex.push({
      path: operation.path,
      type: operation.fileType,
      nodeIds: [owner.id],
      imports: [],
      exports: [],
      status: "changed",
    });
    owner.linkedFiles.push({
      path: operation.path,
      role: operation.linkedRole,
      summary: operation.responsibility,
    });
    return;
  }
  if (operation.kind === "removeOwnedFile") {
    assertSafeProductFilePath(operation.path);
    if (new Set(operation.expectedOwnerNodeIds).size !== operation.expectedOwnerNodeIds.length) {
      throw new GraphChangeSetError(
        "ownership_mismatch",
        "Expected file owners must be unique",
      );
    }
    const file = graph.fileIndex.find((candidate) => candidate.path === operation.path);
    if (!file) {
      throw new GraphChangeSetError("ownership_mismatch", "Product file is absent from the graph");
    }
    if (!sameSet(file.nodeIds, operation.expectedOwnerNodeIds)) {
      throw new GraphChangeSetError(
        "ownership_mismatch",
        "File removal does not declare its complete ownership",
      );
    }
    for (const ownerId of operation.expectedOwnerNodeIds) {
      const owner = requireNode(graph, ownerId);
      if (!owner.linkedFiles.some((linked) => linked.path === operation.path)) {
        throw new GraphChangeSetError(
          "ownership_mismatch",
          "Declared file owner does not link the removed file",
        );
      }
    }
    if (graph.nodes.some((node) =>
      !operation.expectedOwnerNodeIds.includes(node.id) &&
      node.linkedFiles.some((linked) => linked.path === operation.path))) {
      throw new GraphChangeSetError(
        "ownership_mismatch",
        "File removal omits a linked owner",
      );
    }
    graph.fileIndex = graph.fileIndex.filter((candidate) => candidate.path !== operation.path);
    for (const candidate of graph.fileIndex) {
      candidate.imports = candidate.imports.filter((path) => path !== operation.path);
    }
    graph.fileRelations = graph.fileRelations?.filter(
      (relation) =>
        relation.sourcePath !== operation.path && relation.targetPath !== operation.path,
    );
    for (const ownerId of operation.expectedOwnerNodeIds) {
      const owner = requireNode(graph, ownerId);
      owner.linkedFiles = owner.linkedFiles.filter((linked) => linked.path !== operation.path);
    }
    return;
  }
  const index = graph.edges.findIndex((edge) => edge.id === operation.edgeId);
  if (index < 0) throw new GraphChangeSetError("unknown_reference", "Edge to remove does not exist");
  graph.edges.splice(index, 1);
}

function assertSafeProductFilePath(path: string): void {
  const components = path.replace(/\\/gu, "/").split("/");
  if (
    path.includes("\0") ||
    /[\r\n]/u.test(path) ||
    path.startsWith("/") ||
    /^[A-Za-z]:[\\/]/u.test(path) ||
    path.includes("\\") ||
    components.some(
      (component) => component === "" || component === "." || component === "..",
    ) ||
    components[0] === ".git" ||
    components[0] === ".projectos"
  ) {
    throw new GraphChangeSetError("ownership_mismatch", "Product file path is unsafe");
  }
}

function applyDeleteOperation(
  graph: ProjectGraph,
  operation: Extract<GraphChangeOperation, { kind: "deleteNode" }>,
  resolveNode: (reference: GraphNodeReference) => string,
): void {
  const nodeId = resolveNode(operation.node);
  const node = requireNode(graph, nodeId);
  if ((node.children ?? []).length > 0) {
    throw new GraphChangeSetError("incomplete_delete", "Deleted node still has children");
  }
  if (node.parentId) {
    const parent = requireNode(graph, node.parentId);
    parent.children = (parent.children ?? []).filter((id) => id !== nodeId);
  }
  graph.edges = graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
  for (const impact of operation.ownershipImpact) {
    if (impact.disposition === "remove") {
      const file = graph.fileIndex.find((candidate) => candidate.path === impact.path);
      if (!file) continue;
      graph.fileIndex = graph.fileIndex.filter((candidate) => candidate.path !== impact.path);
      graph.fileRelations = graph.fileRelations?.filter(
        (relation) => relation.sourcePath !== impact.path && relation.targetPath !== impact.path,
      );
      for (const candidate of graph.nodes) {
        candidate.linkedFiles = candidate.linkedFiles.filter((linked) => linked.path !== impact.path);
      }
    } else {
      const file = graph.fileIndex.find((candidate) => candidate.path === impact.path);
      if (!file) throw new GraphChangeSetError("ownership_mismatch", "Declared ownership file is missing");
      file.nodeIds = [...impact.expectedRemainingNodeIds];
    }
  }
  graph.nodes = graph.nodes.filter((candidate) => candidate.id !== nodeId);
}

function validateDeleteDeclarations(
  graph: ProjectGraph,
  operations: GraphChangeOperation[],
  resolveNode: (reference: GraphNodeReference) => string,
  temporaryEdgeIds: Map<string, string>,
  references?: GraphReferenceSnapshot,
): void {
  const deleting = new Set(
    operations.filter((operation) => operation.kind === "deleteNode").map((operation) =>
      resolveNode(operation.node)),
  );
  const moving = new Set(
    operations.filter((operation) => operation.kind === "moveNode").map((operation) =>
      resolveNode(operation.node)),
  );
  for (const operation of operations) {
    if (operation.kind !== "deleteNode") continue;
    const nodeId = resolveNode(operation.node);
    const node = requireNode(graph, nodeId);
    const expectedChildren = operation.expectedChildren.map(resolveNode);
    if (!sameSet(expectedChildren, node.children ?? [])) {
      throw new GraphChangeSetError("incomplete_delete", "Delete operation does not declare every child");
    }
    if ((node.children ?? []).some((id) => !deleting.has(id) && !moving.has(id))) {
      throw new GraphChangeSetError("incomplete_delete", "Every child must be deleted or moved before its parent");
    }
    const incident = [
      ...graph.edges
      .filter((edge) => edge.source === nodeId || edge.target === nodeId)
      .map((edge) => edge.id),
      ...operations.filter(isAddEdge).flatMap((edge) => {
        if (resolveNode(edge.source) !== nodeId && resolveNode(edge.target) !== nodeId) {
          return [];
        }
        const edgeId = temporaryEdgeIds.get(edge.tempRef);
        if (!edgeId) {
          throw new GraphChangeSetError(
            "unknown_reference",
            "Change set contains an unresolved added edge",
          );
        }
        return [edgeId];
      }),
    ];
    if (!sameSet(operation.expectedIncidentEdgeIds, incident)) {
      throw new GraphChangeSetError("incomplete_delete", "Delete operation does not declare every incident edge");
    }
    const ownedPaths = new Set([
      ...node.linkedFiles.map((file) => file.path),
      ...graph.fileIndex.filter((file) => file.nodeIds.includes(nodeId)).map((file) => file.path),
    ]);
    if (!sameSet(operation.ownershipImpact.map((impact) => impact.path), [...ownedPaths])) {
      throw new GraphChangeSetError("incomplete_delete", "Delete operation does not declare every file ownership impact");
    }
    for (const impact of operation.ownershipImpact) {
      const file = graph.fileIndex.find((candidate) => candidate.path === impact.path);
      if (!file) throw new GraphChangeSetError("ownership_mismatch", "Declared ownership file is missing");
      const remaining = file.nodeIds.filter((id) => id !== nodeId && !deleting.has(id));
      if (impact.disposition === "remove") {
        if (remaining.length > 0 || impact.expectedRemainingNodeIds.length > 0) {
          throw new GraphChangeSetError("ownership_mismatch", "A shared file cannot be removed");
        }
      } else if (remaining.length === 0 || !sameSet(impact.expectedRemainingNodeIds, remaining)) {
        throw new GraphChangeSetError("ownership_mismatch", "Retained file ownership declaration is incomplete");
      }
    }
    if (semanticTreeReferences(references?.semanticTree, nodeId).length > 0 ||
        mapContentReferences(references?.mapContent, nodeId).length > 0) {
      throw new GraphChangeSetError(
        "dangling_external_reference",
        "Node is still referenced by semantic-tree or map content",
      );
    }
  }
}

function validateGraphInvariants(graph: ProjectGraph): void {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const node of graph.nodes) {
    if (new Set(node.children ?? []).size !== (node.children ?? []).length) {
      throw new GraphChangeSetError("illegal_hierarchy", "Node children must be unique");
    }
    const seen = new Set([node.id]);
    let cursor = node;
    while (cursor.parentId) {
      if (seen.has(cursor.parentId)) {
        throw new GraphChangeSetError("hierarchy_cycle", "Graph hierarchy contains a cycle");
      }
      seen.add(cursor.parentId);
      cursor = requireNode(graph, cursor.parentId);
    }
  }
  for (const node of graph.nodes) {
    if (!node.level) continue;
    if (!node.parentId) {
      if (node.level !== "context") {
        throw new GraphChangeSetError("illegal_hierarchy", "Only context nodes may be graph roots");
      }
    } else {
      const parent = nodes.get(node.parentId);
      if (!parent) throw new GraphChangeSetError("illegal_hierarchy", "Node parent does not exist");
      if (!parent.level || LEGAL_CHILD_LEVEL[parent.level] !== node.level) {
        throw new GraphChangeSetError("illegal_hierarchy", "Parent and child levels are incompatible");
      }
    }
  }
  const edgeIds = new Set<string>();
  const edgeKeys = new Set<string>();
  for (const edge of graph.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) {
      throw new GraphChangeSetError("dangling_edge", "Edge endpoint does not exist");
    }
    const key = `${edge.source}\0${edge.target}\0${edge.relation}`;
    if (edgeIds.has(edge.id) || edgeKeys.has(key)) {
      throw new GraphChangeSetError("duplicate_edge", "Graph contains a duplicate edge");
    }
    edgeIds.add(edge.id);
    edgeKeys.add(key);
  }
  const files = new Set(graph.fileIndex.map((file) => file.path));
  for (const file of graph.fileIndex) {
    if (new Set(file.nodeIds).size !== file.nodeIds.length || file.nodeIds.some((id) => !nodes.has(id))) {
      throw new GraphChangeSetError("ownership_mismatch", "File index refers to an unknown or duplicate node");
    }
  }
  for (const node of graph.nodes) {
    if (node.linkedFiles.some((file) => !files.has(file.path))) {
      throw new GraphChangeSetError("ownership_mismatch", "Node links a file absent from the file index");
    }
  }
}

function recomputeDerivedTopology(graph: ProjectGraph): void {
  const roots = graph.nodes.filter((node) => !node.parentId);
  const depthById = new Map<string, number>();
  const visit = (id: string, depth: number) => {
    depthById.set(id, depth);
    for (const childId of requireNode(graph, id).children ?? []) visit(childId, depth + 1);
  };
  for (const root of roots) visit(root.id, 0);
  for (const node of graph.nodes) node.depth = depthById.get(node.id) ?? 0;
  graph.topology = {
    rootIds: roots.map((node) => node.id),
    maxDepth: Math.max(0, ...depthById.values()),
    totalNodes: graph.nodes.length,
  };
}

function allocateIds<T>(
  operations: T[],
  existingIds: string[],
  tempRef: (operation: T) => string,
  createId: (operation: T) => string,
): Map<string, string> {
  const result = new Map<string, string>();
  const occupied = new Set(existingIds);
  for (const operation of operations) {
    const ref = tempRef(operation);
    if (result.has(ref)) throw new GraphChangeSetError("server_id_collision", "Temporary references must be unique");
    const id = createId(operation);
    if (!id || occupied.has(id)) throw new GraphChangeSetError("server_id_collision", "Server-generated ID collides with graph state");
    result.set(ref, id);
    occupied.add(id);
  }
  return result;
}

function requireNode(graph: ProjectGraph, id: string) {
  const node = graph.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new GraphChangeSetError("unknown_reference", "Referenced node does not exist");
  return node;
}

function nodeDepth(graph: ProjectGraph, id: string): number {
  let depth = 0;
  let node = requireNode(graph, id);
  const seen = new Set([id]);
  while (node.parentId) {
    if (seen.has(node.parentId)) throw new GraphChangeSetError("hierarchy_cycle", "Graph hierarchy contains a cycle");
    seen.add(node.parentId);
    node = requireNode(graph, node.parentId);
    depth += 1;
  }
  return depth;
}

function semanticTreeReferences(tree: SemanticTree | undefined, nodeId: string): string[] {
  const result: string[] = [];
  const visit = (node: SemanticTreeNode) => {
    if (node.sourceNodeId === nodeId) result.push(node.id);
    node.children.forEach(visit);
  };
  tree?.roots.forEach(visit);
  return result;
}

function mapContentReferences(content: MapContentDocument | undefined, nodeId: string): string[] {
  return content?.artifacts
    .filter((artifact) => artifact.scope === "node" && artifact.nodeId === nodeId)
    .map((artifact) => artifact.id) ?? [];
}

function sameSet(left: string[], right: string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length && left.every((value) => right.includes(value));
}

function isAddNode(operation: GraphChangeOperation): operation is Extract<GraphChangeOperation, { kind: "addNode" }> {
  return operation.kind === "addNode";
}

function isAddEdge(operation: GraphChangeOperation): operation is Extract<GraphChangeOperation, { kind: "addEdge" }> {
  return operation.kind === "addEdge";
}

function sortCanonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, sortCanonicalValue(entry)]),
    );
  }
  return value;
}
