import { z } from "zod";

import { GraphContentHashSchema, GraphNodeProductFieldsPatchSchema } from "./graph-change-set.js";
import {
  FileEntrySchema,
  FunctionalEdgeSchema,
  FunctionalNodeSchema,
  LinkedFileSchema,
} from "./graph.js";

export const GraphStructuralRevisionSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    effectiveGraphHash: GraphContentHashSchema,
    updatedAt: z.string().min(1),
  })
  .strict();

export const AnalyzerEvidenceFreshnessSchema = z
  .object({
    basedOnGraphHash: GraphContentHashSchema,
    lastAnalyzedAt: z.string().min(1),
    stale: z.boolean(),
    staleSince: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((freshness, ctx) => {
    if (freshness.stale !== Boolean(freshness.staleSince)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["staleSince"],
        message: "staleSince is required exactly when analyzer evidence is stale",
      });
    }
  });

export const GraphNodeProductOverrideSchema = z
  .object({
    nodeId: z.string().min(1),
    fields: GraphNodeProductFieldsPatchSchema,
  })
  .strict();

export const GraphNodeTopologyOverrideSchema = z
  .object({
    nodeId: z.string().min(1),
    parentId: z.string().min(1).nullable(),
    children: z.array(z.string().min(1)),
  })
  .strict();

export const GraphNodeLinkedFilesOverrideSchema = z
  .object({
    nodeId: z.string().min(1),
    linkedFiles: z.array(LinkedFileSchema),
  })
  .strict();

export const GraphProductOverlaySchema = z
  .object({
    version: z.literal("0.1.0"),
    projectId: z.string().min(1),
    structuralRevision: GraphStructuralRevisionSchema,
    analyzerEvidence: AnalyzerEvidenceFreshnessSchema,
    createdNodes: z.array(FunctionalNodeSchema),
    nodeProductOverrides: z.array(GraphNodeProductOverrideSchema),
    nodeTopologyOverrides: z.array(GraphNodeTopologyOverrideSchema),
    nodeLinkedFilesOverrides: z.array(GraphNodeLinkedFilesOverrideSchema),
    tombstoneNodeIds: z.array(z.string().min(1)),
    createdEdges: z.array(FunctionalEdgeSchema),
    removedEdgeIds: z.array(z.string().min(1)),
    fileEntryOverrides: z.array(FileEntrySchema),
    removedFilePaths: z.array(z.string().min(1)),
  })
  .strict()
  .superRefine((overlay, ctx) => {
    const uniqueLists: Array<[string, string[]]> = [
      ["createdNodes", overlay.createdNodes.map((node) => node.id)],
      ["nodeProductOverrides", overlay.nodeProductOverrides.map((entry) => entry.nodeId)],
      ["nodeTopologyOverrides", overlay.nodeTopologyOverrides.map((entry) => entry.nodeId)],
      ["nodeLinkedFilesOverrides", overlay.nodeLinkedFilesOverrides.map((entry) => entry.nodeId)],
      ["tombstoneNodeIds", overlay.tombstoneNodeIds],
      ["createdEdges", overlay.createdEdges.map((edge) => edge.id)],
      ["removedEdgeIds", overlay.removedEdgeIds],
      ["fileEntryOverrides", overlay.fileEntryOverrides.map((file) => file.path)],
      ["removedFilePaths", overlay.removedFilePaths],
    ];
    for (const [path, values] of uniqueLists) {
      if (new Set(values).size !== values.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message: `${path} entries must be unique`,
        });
      }
    }
    const tombstonedNodeIds = new Set(overlay.tombstoneNodeIds);
    const nodeCollections: Array<[string, string[]]> = [
      ["createdNodes", overlay.createdNodes.map((node) => node.id)],
      ["nodeProductOverrides", overlay.nodeProductOverrides.map((entry) => entry.nodeId)],
      ["nodeTopologyOverrides", overlay.nodeTopologyOverrides.map((entry) => entry.nodeId)],
      ["nodeLinkedFilesOverrides", overlay.nodeLinkedFilesOverrides.map((entry) => entry.nodeId)],
    ];
    const conflictingNodeCollection = nodeCollections.find(([, nodeIds]) =>
      nodeIds.some((nodeId) => tombstonedNodeIds.has(nodeId))
    )?.[0];
    if (conflictingNodeCollection) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tombstoneNodeIds"],
        message: `Tombstoned nodes cannot also appear in ${conflictingNodeCollection}`,
      });
    }
    const createdEdgeIds = new Set(overlay.createdEdges.map((edge) => edge.id));
    if (overlay.removedEdgeIds.some((edgeId) => createdEdgeIds.has(edgeId))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["removedEdgeIds"],
        message: "Created edges cannot also be removed",
      });
    }
    const overriddenFiles = new Set(overlay.fileEntryOverrides.map((file) => file.path));
    if (overlay.removedFilePaths.some((path) => overriddenFiles.has(path))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["removedFilePaths"],
        message: "File entries cannot be both overridden and removed",
      });
    }
  });

export type GraphStructuralRevision = z.infer<typeof GraphStructuralRevisionSchema>;
export type AnalyzerEvidenceFreshness = z.infer<typeof AnalyzerEvidenceFreshnessSchema>;
export type GraphProductOverlay = z.infer<typeof GraphProductOverlaySchema>;
