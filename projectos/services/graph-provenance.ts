import {
  GraphProductOverlaySchema,
  ProjectGraphSchema,
  type FunctionalNode,
  type GraphNodeProductFieldsPatch,
  type GraphProductOverlay,
  type GraphFreshness,
  type ProjectGraph,
} from "../contracts/index.js";
import { cloneJson } from "../utils/json.js";
import { computeProjectGraphHash } from "./graph-change-set-engine.js";

export class GraphProvenanceError extends Error {
  constructor(
    readonly code: "project_mismatch" | "invalid_overlay" | "dangling_overlay_reference",
    message: string,
  ) {
    super(message);
    this.name = "GraphProvenanceError";
  }
}

export function composeProjectGraph(
  analyzerBase: ProjectGraph,
  productOverlay: GraphProductOverlay | undefined,
): ProjectGraph {
  const base = ProjectGraphSchema.parse(cloneJson(analyzerBase));
  if (!productOverlay) return base;
  const overlay = GraphProductOverlaySchema.parse(cloneJson(productOverlay));
  if (overlay.projectId !== base.projectId) {
    throw new GraphProvenanceError("project_mismatch", "Graph overlay belongs to another project");
  }

  const tombstones = new Set(overlay.tombstoneNodeIds);
  const createdNodeIds = new Set(overlay.createdNodes.map((node) => node.id));
  const nodes = base.nodes.filter((node) => !tombstones.has(node.id) && !createdNodeIds.has(node.id));
  nodes.push(...cloneJson(overlay.createdNodes));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  for (const override of overlay.nodeProductOverrides) {
    const node = nodesById.get(override.nodeId);
    if (!node) throw dangling("product-field", override.nodeId);
    applyProductFields(node, override.fields);
  }
  for (const override of overlay.nodeTopologyOverrides) {
    const node = nodesById.get(override.nodeId);
    if (!node) throw dangling("topology", override.nodeId);
    node.parentId = override.parentId;
    node.children = [...override.children];
  }
  for (const override of overlay.nodeLinkedFilesOverrides) {
    const node = nodesById.get(override.nodeId);
    if (!node) throw dangling("linked-file", override.nodeId);
    node.linkedFiles = cloneJson(override.linkedFiles);
  }

  const removedEdges = new Set(overlay.removedEdgeIds);
  const createdEdgeIds = new Set(overlay.createdEdges.map((edge) => edge.id));
  const edges = base.edges.filter((edge) =>
    !removedEdges.has(edge.id) &&
    !createdEdgeIds.has(edge.id) &&
    !tombstones.has(edge.source) &&
    !tombstones.has(edge.target));
  edges.push(...cloneJson(overlay.createdEdges));

  const removedFiles = new Set(overlay.removedFilePaths);
  const overriddenFiles = new Set(overlay.fileEntryOverrides.map((file) => file.path));
  const fileIndex = base.fileIndex.filter((file) =>
    !removedFiles.has(file.path) && !overriddenFiles.has(file.path));
  fileIndex.push(...cloneJson(overlay.fileEntryOverrides));
  const filePaths = new Set(fileIndex.map((file) => file.path));
  const fileRelations = base.fileRelations?.filter((relation) =>
    filePaths.has(relation.sourcePath) && filePaths.has(relation.targetPath));

  const effective: ProjectGraph = {
    ...base,
    nodes,
    edges,
    fileIndex,
    ...(fileRelations ? { fileRelations } : {}),
  };
  recomputeTopology(effective);
  const parsed = ProjectGraphSchema.safeParse(effective);
  if (!parsed.success) {
    throw new GraphProvenanceError(
      "invalid_overlay",
      `Product overlay does not compose into a valid graph: ${parsed.error.issues[0]?.message ?? "unknown validation error"}`,
    );
  }
  return parsed.data;
}

export async function deriveGraphProductOverlay(input: {
  analyzerBase: ProjectGraph;
  effectiveGraph: ProjectGraph;
  previousOverlay?: GraphProductOverlay;
  revision: number;
  updatedAt: string;
  analyzerEvidenceStale: boolean;
}): Promise<GraphProductOverlay> {
  const base = ProjectGraphSchema.parse(input.analyzerBase);
  const effective = ProjectGraphSchema.parse(input.effectiveGraph);
  if (base.projectId !== effective.projectId) {
    throw new GraphProvenanceError("project_mismatch", "Base and effective graphs belong to different projects");
  }
  if (input.previousOverlay && input.previousOverlay.projectId !== base.projectId) {
    throw new GraphProvenanceError("project_mismatch", "Previous overlay belongs to another project");
  }
  const baseNodes = new Map(base.nodes.map((node) => [node.id, node]));
  const effectiveNodes = new Map(effective.nodes.map((node) => [node.id, node]));
  const previouslyCreatedNodes = new Set(input.previousOverlay?.createdNodes.map((node) => node.id));
  const createdNodes = effective.nodes.filter((node) =>
    previouslyCreatedNodes.has(node.id) || !baseNodes.has(node.id));
  const createdNodeIds = new Set(createdNodes.map((node) => node.id));
  const tombstoneNodeIds = [...new Set([
    ...(input.previousOverlay?.tombstoneNodeIds ?? []),
    ...base.nodes.filter((node) => !effectiveNodes.has(node.id)).map((node) => node.id),
    ...(input.previousOverlay?.createdNodes ?? [])
      .filter((node) => !effectiveNodes.has(node.id))
      .map((node) => node.id),
  ])].filter((nodeId) => !effectiveNodes.has(nodeId));
  const previousProductOverrides = new Map(
    input.previousOverlay?.nodeProductOverrides.map((entry) => [entry.nodeId, entry.fields]),
  );

  const nodeProductOverrides = effective.nodes.flatMap((node) => {
    const original = baseNodes.get(node.id);
    if (!original || createdNodeIds.has(node.id)) return [];
    const fields = {
      ...productFieldDifference(original, node),
      ...preserveProductFields(node, previousProductOverrides.get(node.id)),
    };
    return Object.keys(fields).length > 0 ? [{ nodeId: node.id, fields }] : [];
  });
  const nodeTopologyOverrides = effective.nodes.flatMap((node) => {
    const original = baseNodes.get(node.id);
    if (!original || createdNodeIds.has(node.id)) return [];
    const wasOverridden = input.previousOverlay?.nodeTopologyOverrides.some(
      (entry) => entry.nodeId === node.id,
    );
    return wasOverridden || original.parentId !== node.parentId || !sameJson(original.children ?? [], node.children ?? [])
      ? [{ nodeId: node.id, parentId: node.parentId ?? null, children: [...(node.children ?? [])] }]
      : [];
  });
  const nodeLinkedFilesOverrides = effective.nodes.flatMap((node) => {
    const original = baseNodes.get(node.id);
    const wasOverridden = input.previousOverlay?.nodeLinkedFilesOverrides.some(
      (entry) => entry.nodeId === node.id,
    );
    if (!original || createdNodeIds.has(node.id) || (!wasOverridden && sameJson(original.linkedFiles, node.linkedFiles))) return [];
    return [{ nodeId: node.id, linkedFiles: cloneJson(node.linkedFiles) }];
  });

  const baseEdges = new Map(base.edges.map((edge) => [edge.id, edge]));
  const previouslyCreatedEdges = new Set(input.previousOverlay?.createdEdges.map((edge) => edge.id));
  const createdEdges = effective.edges.filter((edge) =>
    previouslyCreatedEdges.has(edge.id) || !baseEdges.has(edge.id));
  const effectiveEdgeIds = new Set(effective.edges.map((edge) => edge.id));
  const removedEdgeIds = [...new Set([
    ...(input.previousOverlay?.removedEdgeIds ?? []),
    ...base.edges.filter((edge) => !effectiveEdgeIds.has(edge.id)).map((edge) => edge.id),
  ])].filter((edgeId) => !effectiveEdgeIds.has(edgeId));

  const baseFiles = new Map(base.fileIndex.map((file) => [file.path, file]));
  const previouslyOverriddenFiles = new Set(
    input.previousOverlay?.fileEntryOverrides.map((file) => file.path),
  );
  const fileEntryOverrides = effective.fileIndex.filter((file) => {
    const original = baseFiles.get(file.path);
    return previouslyOverriddenFiles.has(file.path) || !original || !sameJson(original, file);
  });
  const effectiveFilePaths = new Set(effective.fileIndex.map((file) => file.path));
  const removedFilePaths = [...new Set([
    ...(input.previousOverlay?.removedFilePaths ?? []),
    ...base.fileIndex.filter((file) => !effectiveFilePaths.has(file.path)).map((file) => file.path),
  ])].filter((path) => !effectiveFilePaths.has(path));
  const baseGraphHash = await computeProjectGraphHash(base);

  return GraphProductOverlaySchema.parse({
    version: "0.1.0",
    projectId: base.projectId,
    structuralRevision: {
      revision: input.revision,
      effectiveGraphHash: await computeProjectGraphHash(effective),
      updatedAt: input.updatedAt,
    },
    analyzerEvidence: {
      basedOnGraphHash: baseGraphHash,
      lastAnalyzedAt: base.analyzedAt,
      stale: input.analyzerEvidenceStale,
      ...(input.analyzerEvidenceStale ? { staleSince: input.updatedAt } : {}),
    },
    createdNodes,
    nodeProductOverrides,
    nodeTopologyOverrides,
    nodeLinkedFilesOverrides,
    tombstoneNodeIds,
    createdEdges,
    removedEdgeIds,
    fileEntryOverrides,
    removedFilePaths,
  });
}

export async function resolveHybridGraphFreshness(
  analyzerBase: ProjectGraph,
  productOverlay: GraphProductOverlay | undefined,
): Promise<GraphFreshness> {
  const base = ProjectGraphSchema.parse(analyzerBase);
  const baseGraphHash = await computeProjectGraphHash(base);
  if (!productOverlay) {
    return {
      stale: false,
      lastAnalyzedAt: base.analyzedAt,
      structuralRevision: {
        revision: 0,
        effectiveGraphHash: baseGraphHash,
        updatedAt: base.analyzedAt,
      },
      analyzerEvidence: {
        basedOnGraphHash: baseGraphHash,
        lastAnalyzedAt: base.analyzedAt,
        stale: false,
      },
    };
  }
  const overlay = GraphProductOverlaySchema.parse(productOverlay);
  if (overlay.projectId !== base.projectId) {
    throw new GraphProvenanceError("project_mismatch", "Graph overlay belongs to another project");
  }
  const analyzerMoved = overlay.analyzerEvidence.basedOnGraphHash !== baseGraphHash;
  const stale = overlay.analyzerEvidence.stale || analyzerMoved;
  const staleSince = overlay.analyzerEvidence.staleSince ??
    (analyzerMoved ? base.analyzedAt : undefined);
  return {
    stale,
    lastAnalyzedAt: base.analyzedAt,
    ...(staleSince ? { staleSince } : {}),
    structuralRevision: overlay.structuralRevision,
    analyzerEvidence: {
      ...overlay.analyzerEvidence,
      lastAnalyzedAt: base.analyzedAt,
      stale,
      ...(staleSince ? { staleSince } : {}),
    },
  };
}

function applyProductFields(node: FunctionalNode, fields: GraphNodeProductFieldsPatch): void {
  for (const [key, value] of Object.entries(fields)) {
    if (key === "technology" && value === null) delete node.technology;
    else Object.assign(node, { [key]: value });
  }
}

function productFieldDifference(
  original: FunctionalNode,
  current: FunctionalNode,
): GraphNodeProductFieldsPatch {
  const fields: GraphNodeProductFieldsPatch = {};
  const keys = [
    "name",
    "nameEn",
    "status",
    "description",
    "summary",
    "responsibility",
    "technology",
    "preview",
    "tags",
  ] as const;
  for (const key of keys) {
    if (sameJson(original[key], current[key])) continue;
    if (key === "technology" && current[key] === undefined) fields.technology = null;
    else if (current[key] !== undefined) Object.assign(fields, { [key]: cloneJson(current[key]) });
  }
  return fields;
}

function preserveProductFields(
  current: FunctionalNode,
  previous: GraphNodeProductFieldsPatch | undefined,
): GraphNodeProductFieldsPatch {
  if (!previous) return {};
  const fields: GraphNodeProductFieldsPatch = {};
  for (const key of Object.keys(previous) as Array<keyof GraphNodeProductFieldsPatch>) {
    const value = current[key as keyof FunctionalNode];
    if (key === "technology" && value === undefined) fields.technology = null;
    else if (value !== undefined) Object.assign(fields, { [key]: cloneJson(value) });
  }
  return fields;
}

function recomputeTopology(graph: ProjectGraph): void {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const roots = graph.nodes.filter((node) => !node.parentId);
  const depths = new Map<string, number>();
  const visit = (nodeId: string, depth: number) => {
    if (depths.has(nodeId)) return;
    depths.set(nodeId, depth);
    for (const childId of nodesById.get(nodeId)?.children ?? []) visit(childId, depth + 1);
  };
  roots.forEach((node) => visit(node.id, 0));
  for (const node of graph.nodes) node.depth = depths.get(node.id) ?? 0;
  graph.topology = {
    rootIds: roots.map((node) => node.id),
    maxDepth: Math.max(0, ...depths.values()),
    totalNodes: graph.nodes.length,
  };
}

function dangling(kind: string, nodeId: string): GraphProvenanceError {
  return new GraphProvenanceError(
    "dangling_overlay_reference",
    `Graph overlay ${kind} entry references missing node '${nodeId}'`,
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
