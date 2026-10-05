import { z } from "zod";

import {
  ArchitectureElementTypeSchema,
  ArchitectureLevelSchema,
  FunctionalEdgeRelationSchema,
  FunctionalNodePreviewSchema,
  FunctionalNodeStatusSchema,
  FunctionalNodeTypeSchema,
  FileEntryTypeSchema,
  LinkedFileRoleSchema,
  LinkedFileSchema,
} from "./graph.js";

export const GraphContentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);

export const GraphNodeReferenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), nodeId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("temporary"), tempRef: z.string().min(1) }).strict(),
]);

const ExistingGraphNodeReferenceSchema = z
  .object({ kind: z.literal("existing"), nodeId: z.string().min(1) })
  .strict();

const AddNodeFieldsSchema = z
  .object({
    type: FunctionalNodeTypeSchema,
    name: z.string().min(1),
    nameEn: z.string().optional(),
    status: FunctionalNodeStatusSchema,
    description: z.string(),
    summary: z.string(),
    responsibility: z.string().min(1),
    elementType: ArchitectureElementTypeSchema,
    level: ArchitectureLevelSchema,
    layer: z.string().min(1),
    technology: z.string().min(1).optional(),
    linkedFiles: z.array(LinkedFileSchema),
    preview: FunctionalNodePreviewSchema.nullable().optional(),
    tags: z.array(z.string()),
  })
  .strict();

export const GraphNodeProductFieldsPatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    nameEn: z.string().optional(),
    status: FunctionalNodeStatusSchema.optional(),
    description: z.string().optional(),
    summary: z.string().optional(),
    responsibility: z.string().min(1).optional(),
    technology: z.string().min(1).nullable().optional(),
    preview: FunctionalNodePreviewSchema.nullable().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, "At least one product field is required");

const AddNodeOperationSchema = z
  .object({
    kind: z.literal("addNode"),
    tempRef: z.string().min(1),
    parent: GraphNodeReferenceSchema.nullable(),
    node: AddNodeFieldsSchema,
  })
  .strict();

const UpdateNodeFieldsOperationSchema = z
  .object({
    kind: z.literal("updateNodeFields"),
    node: GraphNodeReferenceSchema,
    fields: GraphNodeProductFieldsPatchSchema,
  })
  .strict();

const MoveNodeOperationSchema = z
  .object({
    kind: z.literal("moveNode"),
    node: GraphNodeReferenceSchema,
    newParent: GraphNodeReferenceSchema.nullable(),
  })
  .strict();

const AddEdgeOperationSchema = z
  .object({
    kind: z.literal("addEdge"),
    tempRef: z.string().min(1),
    source: GraphNodeReferenceSchema,
    target: GraphNodeReferenceSchema,
    relation: FunctionalEdgeRelationSchema,
    label: z.string().min(1),
    purpose: z.string().optional(),
    technology: z.string().optional(),
    evidence: z.string().min(1),
  })
  .strict();

const RemoveEdgeOperationSchema = z
  .object({ kind: z.literal("removeEdge"), edgeId: z.string().min(1) })
  .strict();

const AddOwnedFileOperationSchema = z
  .object({
    kind: z.literal("addOwnedFile"),
    owner: GraphNodeReferenceSchema,
    path: z.string().min(1),
    fileType: FileEntryTypeSchema,
    linkedRole: LinkedFileRoleSchema,
    responsibility: z.string().trim().min(1).max(2_000),
  })
  .strict();

const RemoveOwnedFileOperationSchema = z
  .object({
    kind: z.literal("removeOwnedFile"),
    path: z.string().min(1),
    expectedOwnerNodeIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const GraphFileOwnershipImpactSchema = z
  .object({
    path: z.string().min(1),
    disposition: z.enum(["retain", "remove"]),
    expectedRemainingNodeIds: z.array(z.string().min(1)),
  })
  .strict();

const DeleteNodeOperationSchema = z
  .object({
    kind: z.literal("deleteNode"),
    node: ExistingGraphNodeReferenceSchema,
    expectedChildren: z.array(ExistingGraphNodeReferenceSchema),
    expectedIncidentEdgeIds: z.array(z.string().min(1)),
    ownershipImpact: z.array(GraphFileOwnershipImpactSchema),
  })
  .strict();

export const GraphChangeOperationSchema = z.discriminatedUnion("kind", [
  AddNodeOperationSchema,
  UpdateNodeFieldsOperationSchema,
  MoveNodeOperationSchema,
  AddEdgeOperationSchema,
  RemoveEdgeOperationSchema,
  AddOwnedFileOperationSchema,
  RemoveOwnedFileOperationSchema,
  DeleteNodeOperationSchema,
]);

export const GraphChangeSetSchema = z
  .object({
    version: z.literal("0.1.0"),
    projectId: z.string().min(1),
    baseGraphHash: GraphContentHashSchema,
    operations: z.array(GraphChangeOperationSchema).min(1),
  })
  .strict();

export type GraphContentHash = z.infer<typeof GraphContentHashSchema>;
export type GraphNodeReference = z.infer<typeof GraphNodeReferenceSchema>;
export type GraphNodeProductFieldsPatch = z.infer<typeof GraphNodeProductFieldsPatchSchema>;
export type GraphFileOwnershipImpact = z.infer<typeof GraphFileOwnershipImpactSchema>;
export type GraphChangeOperation = z.infer<typeof GraphChangeOperationSchema>;
export type GraphChangeSet = z.infer<typeof GraphChangeSetSchema>;
