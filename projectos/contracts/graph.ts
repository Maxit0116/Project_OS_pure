import { z } from "zod";

import { ConfidenceSchema } from "./confidence.js";
import { ProjectFrameworkSchema } from "./project.js";

export const PROJECT_GRAPH_MAX_FILE_SIZE_BYTES = 1_099_511_627_776;

export const PROJECT_GRAPH_LIMITS = {
  architectureLayers: 128,
  architectureViews: 512,
  includeNodeIdsPerView: 4_096,
  excludeNodeIdsPerView: 4_096,
  nodes: 4_096,
  edges: 65_536,
  fileRelations: 131_072,
  fileIndex: 65_536,
  linkedFilesPerNode: 2_048,
  upstreamPerNode: 4_096,
  downstreamPerNode: 4_096,
  tagsPerNode: 256,
  childrenPerNode: 4_096,
  refsPerNode: 4_096,
  nodeIdsPerFile: 256,
  importsPerFile: 4_096,
  exportsPerFile: 4_096,
  topologyRootIds: 4_096,
} as const;

function boundedArray<Element extends z.ZodTypeAny>(
  element: Element,
  maximum: number,
  minimum?: number,
): z.ZodType<
  Array<z.output<Element>>,
  z.ZodTypeDef,
  Array<z.output<Element>>
> {
  const arraySchema =
    minimum === undefined
      ? z.array(element).max(maximum)
      : z.array(element).min(minimum).max(maximum);

  return z.preprocess((value, ctx) => {
    if (Array.isArray(value) && value.length > maximum) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        type: "array",
        maximum,
        inclusive: true,
        exact: false,
        fatal: true,
        message: `Array must contain at most ${maximum} element(s)`,
      });
      return z.NEVER;
    }
    return value;
  }, arraySchema) as z.ZodType<
    Array<z.output<Element>>,
    z.ZodTypeDef,
    Array<z.output<Element>>
  >;
}

function setsIntersect(
  left: ReadonlySet<string> | undefined,
  right: ReadonlySet<string> | undefined,
): boolean {
  if (!left || !right) return false;
  const [smaller, larger] =
    left.size <= right.size ? [left, right] : [right, left];
  for (const value of smaller) {
    if (larger.has(value)) return true;
  }
  return false;
}

export const ProjectGraphVersionSchema = z.enum([
  "0.1.0",
  "0.2.0",
  "0.3.0",
  "0.4.0",
  "0.5.0",
]);

/** Provenance for nodes/edges — used by merge priority and UI filters. */
export const GraphSourceKindSchema = z.enum([
  "heuristic",
  "ai",
  "authored",
  "runtime",
  "import",
]);

export const GraphAnalysisStatusSchema = z.enum([
  "complete",
  "partial",
  "demo_fixture",
  "error",
]);

export const FunctionalNodeTypeSchema = z.enum(["capability", "suggested"]);

export const FunctionalNodeStatusSchema = z.enum([
  "active",
  "in_progress",
  "error",
  "suggested",
]);

export const FunctionalEdgeRelationSchema = z.enum([
  "depends_on",
  "redirects_to",
  "data_flows_to",
  "imports",
  "shares_data",
  "uses",
  "calls",
  "reads_from",
  "writes_to",
  "publishes_to",
  "subscribes_to",
]);

export const ArchitectureLevelSchema = z.enum([
  "context",
  "container",
  "component",
  "code",
]);

/**
 * Named C4 view over the model (Structurizr-style: one model, many views).
 * When absent, the workbench synthesizes default level-scoped views.
 */
export const ArchitectureViewSchema = z
  .object({
    key: z.string().min(1).max(256),
    title: z.string().min(1).max(512),
    level: ArchitectureLevelSchema,
    parentId: z.string().min(1).max(256).optional(),
    focusNodeId: z.string().min(1).max(256).optional(),
    includeNodeIds: boundedArray(
      z.string().min(1).max(256),
      PROJECT_GRAPH_LIMITS.includeNodeIdsPerView,
    ).optional(),
    excludeNodeIds: boundedArray(
      z.string().min(1).max(256),
      PROJECT_GRAPH_LIMITS.excludeNodeIdsPerView,
    ).optional(),
    /**
     * When true (or sourceKind is authored), regenerate keeps this view.
     * Auto-generated views omit locked / use sourceKind ai|heuristic.
     */
    locked: z.boolean().optional(),
    sourceKind: GraphSourceKindSchema.optional(),
  })
  .strict();

export const ArchitectureElementTypeSchema = z.enum([
  "person",
  "software_system",
  "external_system",
  "container",
  "component",
  "code_element",
  "data_store",
]);

export const ArchitectureLayerSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    order: z.number().int().nonnegative(),
    description: z.string().min(1),
  })
  .strict();

export const ProjectArchitectureSchema = z
  .object({
    notation: z.literal("c4"),
    defaultLevel: ArchitectureLevelSchema,
    layers: boundedArray(
      ArchitectureLayerSchema,
      PROJECT_GRAPH_LIMITS.architectureLayers,
      1,
    ),
  })
  .strict();

export const FileEntryTypeSchema = z.enum([
  "page",
  "component",
  "api",
  "lib",
  "config",
  "style",
  "test",
  "asset",
  "other",
]);

export const FileEntryStatusSchema = z.enum([
  "normal",
  "changed",
  "error",
  "attention",
]);

export const LinkedFileRoleSchema = z.enum([
  "primary",
  "supporting",
  "config",
  "test",
]);

export const LinkedFileSchema = z
  .object({
    path: z.string(),
    role: LinkedFileRoleSchema,
    summary: z.string().optional(),
  })
  .strict();

export const FunctionalNodePreviewSchema = z
  .object({
    route: z.string().nullable().optional(),
    thumbnail: z.string().nullable().optional(),
  })
  .strict();

export const FunctionalNodeSchema = z
  .object({
    id: z.string(),
    type: FunctionalNodeTypeSchema,
    name: z.string(),
    nameEn: z.string().optional(),
    status: FunctionalNodeStatusSchema,
    description: z.string(),
    summary: z.string(),
    responsibility: z.string().min(1).optional(),
    elementType: ArchitectureElementTypeSchema.optional(),
    level: ArchitectureLevelSchema.optional(),
    layer: z.string().min(1).optional(),
    technology: z.string().min(1).optional(),
    linkedFiles: boundedArray(
      LinkedFileSchema,
      PROJECT_GRAPH_LIMITS.linkedFilesPerNode,
    ),
    upstream: boundedArray(z.string(), PROJECT_GRAPH_LIMITS.upstreamPerNode),
    downstream: boundedArray(
      z.string(),
      PROJECT_GRAPH_LIMITS.downstreamPerNode,
    ),
    preview: FunctionalNodePreviewSchema.nullable().optional(),
    confidence: ConfidenceSchema,
    tags: boundedArray(z.string(), PROJECT_GRAPH_LIMITS.tagsPerNode),
    parentId: z.string().nullable().optional(),
    children: boundedArray(
      z.string(),
      PROJECT_GRAPH_LIMITS.childrenPerNode,
    ).optional(),
    refs: boundedArray(z.string(), PROJECT_GRAPH_LIMITS.refsPerNode).optional(),
    depth: z.number().int().nonnegative().optional(),
    /** Team / CODEOWNERS-style owners (Arch4 entity enrichment). */
    owners: boundedArray(z.string().min(1).max(128), 32).optional(),
    /** Free-form implementation notes tied to the node. */
    notes: z.string().max(4_096).optional(),
    /** Unresolved architecture questions for this node. */
    openQuestions: boundedArray(z.string().min(1).max(512), 32).optional(),
    /** Provenance for multi-source merge (Phase 3). */
    sourceKind: GraphSourceKindSchema.optional(),
  })
  .strict();

/** Edge endpoints require non-empty ids. Self-loops are enforced in fixtures / prune. */
export const FunctionalEdgeSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
    relation: FunctionalEdgeRelationSchema,
    label: z.string().optional(),
    purpose: z.string().optional(),
    technology: z.string().optional(),
    confidence: ConfidenceSchema,
    evidence: z.string().optional(),
    /** Provenance for multi-source merge (Phase 3). */
    sourceKind: GraphSourceKindSchema.optional(),
  })
  .strict();

export const FileRelationSchema = z
  .object({
    id: z.string().min(1),
    sourcePath: z.string().min(1),
    targetPath: z.string().min(1),
    relation: FunctionalEdgeRelationSchema,
    label: z.string().min(1),
    purpose: z.string().min(1).optional(),
    technology: z.string().optional(),
    confidence: ConfidenceSchema,
    evidence: z.string().min(1),
  })
  .strict();

export const FileEntrySchema = z
  .object({
    path: z.string(),
    type: FileEntryTypeSchema,
    nodeIds: boundedArray(z.string(), PROJECT_GRAPH_LIMITS.nodeIdsPerFile),
    imports: boundedArray(z.string(), PROJECT_GRAPH_LIMITS.importsPerFile),
    exports: boundedArray(z.string(), PROJECT_GRAPH_LIMITS.exportsPerFile),
    status: FileEntryStatusSchema.optional(),
    size: z
      .number()
      .finite()
      .int()
      .nonnegative()
      .max(PROJECT_GRAPH_MAX_FILE_SIZE_BYTES)
      .optional(),
    lastModified: z.string().optional(),
  })
  .strict();

export const ProjectGraphTopologySchema = z
  .object({
    rootIds: boundedArray(z.string(), PROJECT_GRAPH_LIMITS.topologyRootIds),
    maxDepth: z.number().int().nonnegative(),
    totalNodes: z.number().int().nonnegative(),
  })
  .strict();

export const ProjectGraphSchema = z
  .object({
    version: ProjectGraphVersionSchema,
    projectId: z.string(),
    projectName: z.string(),
    projectType: ProjectFrameworkSchema,
    analyzedAt: z.string(),
    analysisStatus: GraphAnalysisStatusSchema,
    architecture: ProjectArchitectureSchema.optional(),
    /**
     * When true, regenerate scans must not overwrite this graph unless the
     * caller passes force (c4-gen authored guard).
     */
    authored: z.boolean().optional(),
    nodes: boundedArray(FunctionalNodeSchema, PROJECT_GRAPH_LIMITS.nodes),
    edges: boundedArray(FunctionalEdgeSchema, PROJECT_GRAPH_LIMITS.edges),
    views: boundedArray(
      ArchitectureViewSchema,
      PROJECT_GRAPH_LIMITS.architectureViews,
    ).optional(),
    fileRelations: boundedArray(
      FileRelationSchema,
      PROJECT_GRAPH_LIMITS.fileRelations,
    ).optional(),
    fileIndex: boundedArray(FileEntrySchema, PROJECT_GRAPH_LIMITS.fileIndex),
    topology: ProjectGraphTopologySchema.optional(),
    analysisError: z.string().nullable().optional(),
  })
  .strict()
  .superRefine((graph, ctx) => {
    const layerIds = new Set(graph.architecture?.layers.map((layer) => layer.id) ?? []);
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const nodeIndexesById = new Map<string, number>();
    const childIdsByNodeId = new Map<string, Set<string>>();
    const componentOwnersByFilePath = new Map<string, Set<string>>();
    const filePaths = new Set(graph.fileIndex.map((file) => file.path));

    graph.nodes.forEach((node, index) => {
      if (!nodeIndexesById.has(node.id)) nodeIndexesById.set(node.id, index);
      childIdsByNodeId.set(node.id, new Set(node.children ?? []));
      if (node.level !== "component") return;
      for (const file of node.linkedFiles) {
        const owners = componentOwnersByFilePath.get(file.path) ?? new Set<string>();
        owners.add(node.id);
        componentOwnersByFilePath.set(file.path, owners);
      }
    });

    if (nodesById.size !== graph.nodes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nodes"],
        message: "Architecture node IDs must be unique",
      });
    }
    if (filePaths.size !== graph.fileIndex.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fileIndex"],
        message: "File index paths must be unique",
      });
    }

    const checkedParentChains = new Set<string>();
    for (const node of graph.nodes) {
      if (checkedParentChains.has(node.id)) continue;

      const chain: string[] = [];
      const chainIndexes = new Map<string, number>();
      let current = node;
      while (!checkedParentChains.has(current.id)) {
        const cycleStart = chainIndexes.get(current.id);
        if (cycleStart !== undefined) {
          const cycle = [...chain.slice(cycleStart), current.id];
          const cycleNodeIndex = nodeIndexesById.get(current.id) ?? 0;
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["nodes", Math.max(0, cycleNodeIndex), "parentId"],
            message: `Architecture parent chain contains a cycle: ${cycle.join(" -> ")}`,
          });
          break;
        }

        chainIndexes.set(current.id, chain.length);
        chain.push(current.id);
        const parent = current.parentId
          ? nodesById.get(current.parentId)
          : undefined;
        if (!parent) break;
        current = parent;
      }
      for (const nodeId of chain) checkedParentChains.add(nodeId);
    }

    graph.nodes.forEach((node, index) => {
      const isArchitectureNode = Boolean(
        node.level || node.elementType || node.layer || node.responsibility,
      );
      if (!isArchitectureNode) return;

      if (!node.level || !node.elementType || !node.layer || !node.responsibility) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", index],
          message:
            "Architecture nodes require level, elementType, layer, and responsibility",
        });
      }
      if (node.layer && !layerIds.has(node.layer)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", index, "layer"],
          message: `Unknown architecture layer '${node.layer}'`,
        });
      }

      if (node.parentId) {
        const parent = nodesById.get(node.parentId);
        if (!parent) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["nodes", index, "parentId"],
            message: `Unknown parent node '${node.parentId}'`,
          });
        } else if (!childIdsByNodeId.get(parent.id)?.has(node.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["nodes", index, "parentId"],
            message: `Parent node '${node.parentId}' must include '${node.id}' in children`,
          });
        }
      }

      for (const childId of node.children ?? []) {
        const child = nodesById.get(childId);
        if (!child) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["nodes", index, "children"],
            message: `Unknown child node '${childId}'`,
          });
        } else if (child.parentId !== node.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["nodes", index, "children"],
            message: `Child node '${childId}' must reference '${node.id}' as parentId`,
          });
        }
      }

      if (node.level === "code") {
        const parent = node.parentId ? nodesById.get(node.parentId) : undefined;
        if (node.elementType !== "code_element" || parent?.level !== "component") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["nodes", index],
            message: "Code elements require elementType 'code_element' and a component parent",
          });
        }
      }
    });

    const fileRelationIds = new Set<string>();
    graph.fileRelations?.forEach((relation, index) => {
      if (fileRelationIds.has(relation.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fileRelations", index, "id"],
          message: `Duplicate file relationship ID '${relation.id}'`,
        });
      }
      fileRelationIds.add(relation.id);

      if (!filePaths.has(relation.sourcePath)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fileRelations", index, "sourcePath"],
          message: `Unknown source file '${relation.sourcePath}'`,
        });
      }
      if (!filePaths.has(relation.targetPath)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fileRelations", index, "targetPath"],
          message: `Unknown target file '${relation.targetPath}'`,
        });
      }
      const hasSharedComponent = setsIntersect(
        componentOwnersByFilePath.get(relation.sourcePath),
        componentOwnersByFilePath.get(relation.targetPath),
      );
      if (!hasSharedComponent) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fileRelations", index],
          message: "File relationship endpoints must belong to the same feature module",
        });
      }
    });

    const requiresArchitectureMeta =
      graph.version === "0.3.0" ||
      graph.version === "0.4.0" ||
      graph.version === "0.5.0";
    if (!requiresArchitectureMeta) return;

    if (!graph.architecture) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["architecture"],
        message: "Project graph v0.3+ requires architecture metadata",
      });
    }

    if (graph.views) {
      const viewKeys = new Set<string>();
      graph.views.forEach((view, index) => {
        if (viewKeys.has(view.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["views", index, "key"],
            message: `Duplicate architecture view key '${view.key}'`,
          });
        }
        viewKeys.add(view.key);
        if (view.parentId && !nodesById.has(view.parentId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["views", index, "parentId"],
            message: `Unknown parent node '${view.parentId}'`,
          });
        }
        if (view.focusNodeId && !nodesById.has(view.focusNodeId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["views", index, "focusNodeId"],
            message: `Unknown focus node '${view.focusNodeId}'`,
          });
        }
      });
    }

    graph.edges.forEach((edge, index) => {
      if (!edge.label?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", index, "label"],
          message: "Project graph relationships require a human-readable label",
        });
      }
      if (!edge.evidence?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", index, "evidence"],
          message: "Project graph relationships require evidence",
        });
      }
    });
  });

export type ProjectGraphVersion = z.infer<typeof ProjectGraphVersionSchema>;
export type GraphAnalysisStatus = z.infer<typeof GraphAnalysisStatusSchema>;
export type FunctionalNodeType = z.infer<typeof FunctionalNodeTypeSchema>;
export type FunctionalNodeStatus = z.infer<typeof FunctionalNodeStatusSchema>;
export type FunctionalEdgeRelation = z.infer<
  typeof FunctionalEdgeRelationSchema
>;
export type FileRelation = z.infer<typeof FileRelationSchema>;
export type ArchitectureLevel = z.infer<typeof ArchitectureLevelSchema>;
export type GraphSourceKind = z.infer<typeof GraphSourceKindSchema>;
export type ArchitectureView = z.infer<typeof ArchitectureViewSchema>;
export type ArchitectureElementType = z.infer<
  typeof ArchitectureElementTypeSchema
>;
export type ArchitectureLayer = z.infer<typeof ArchitectureLayerSchema>;
export type ProjectArchitecture = z.infer<typeof ProjectArchitectureSchema>;
export type FileEntryType = z.infer<typeof FileEntryTypeSchema>;
export type FileEntryStatus = z.infer<typeof FileEntryStatusSchema>;
export type LinkedFileRole = z.infer<typeof LinkedFileRoleSchema>;
export type LinkedFile = z.infer<typeof LinkedFileSchema>;
export type FunctionalNodePreview = z.infer<
  typeof FunctionalNodePreviewSchema
>;
export type FunctionalNode = z.infer<typeof FunctionalNodeSchema>;
export type FunctionalEdge = z.infer<typeof FunctionalEdgeSchema>;
export type FileEntry = z.infer<typeof FileEntrySchema>;
export type ProjectGraphTopology = z.infer<typeof ProjectGraphTopologySchema>;
export type ProjectGraph = z.infer<typeof ProjectGraphSchema>;

export const StructureScanModeSchema = z.enum([
  "regenerate",
  "refine",
  "deepen",
  /** Emit refine prompts as JSON without calling an LLM (c4-gen agent-mode). */
  "prepareRefine",
  /** Accept a refined model payload and merge into the graph. */
  "acceptRefine",
]);

export const StructureScanOptionsSchema = z
  .object({
    mode: StructureScanModeSchema.default("regenerate"),
    nodeIds: z.array(z.string().min(1).max(256)).max(64).optional(),
    /**
     * Bypass authored / completeness guards (explicit user force rescan).
     * Default false so authored graphs are preserved.
     */
    force: z.boolean().optional(),
    /** Changed paths to bias refine (Arch4 changed-files context). */
    changedFiles: z.array(z.string().min(1).max(1_024)).max(256).optional(),
    /**
     * Refined graph (or partial nodes/edges) for acceptRefine agent-mode.
     * Validated loosely by the scan service before merge.
     */
    refinedGraph: z.unknown().optional(),
  })
  .strict();

export type StructureScanMode = z.infer<typeof StructureScanModeSchema>;
export type StructureScanOptions = z.infer<typeof StructureScanOptionsSchema>;
