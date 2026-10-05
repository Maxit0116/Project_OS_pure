import { z } from "zod";

import { FunctionalEdgeRelationSchema } from "./graph.js";
import { GraphContentHashSchema } from "./graph-change-set.js";
import { HierarchyPlannerLevelSchema } from "./hierarchy-delegation.js";

const ProductNodeFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(1_000),
  responsibility: z.string().trim().min(1).max(2_000),
  level: HierarchyPlannerLevelSchema,
  tags: z.array(z.string().trim().min(1).max(100)).max(16).default([]),
}).strict();

const GreenfieldFileProposalSchema = z.object({
  filePath: z.string().trim().min(1).max(500).refine(isSafeProductPath, "File path must be safe and workspace-relative"),
  responsibility: z.string().trim().min(1).max(2_000),
  objective: z.string().trim().min(1).max(500),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
}).strict();

const GreenfieldNodeProposalSchema = z.object({
  tempRef: z.string().min(1).max(200),
  parentTempRef: z.string().min(1).max(200).nullable(),
  node: ProductNodeFieldsSchema,
  files: z.array(GreenfieldFileProposalSchema).max(4),
}).strict();

const GreenfieldWiringProposalSchema = z.object({
  tempRef: z.string().min(1).max(200),
  sourceTempRef: z.string().min(1).max(200),
  targetTempRef: z.string().min(1).max(200),
  relation: FunctionalEdgeRelationSchema,
  label: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(500).optional(),
}).strict();

/** Untrusted, typed model output. It deliberately has no durable IDs or evidence fields. */
export const GreenfieldProductGraphProposalSchema = z.object({
  version: z.literal("0.1.0"),
  objective: z.string().trim().min(1).max(500),
  nodes: z.array(GreenfieldNodeProposalSchema).min(3).max(64),
  wiring: z.array(GreenfieldWiringProposalSchema).min(1).max(64),
  rationale: z.string().trim().min(1).max(1_000),
}).strict();

const PlannedFileSchema = GreenfieldFileProposalSchema.extend({
  taskId: z.string().min(1),
}).strict();

const PlannedNodeSchema = z.object({
  tempRef: z.string().min(1),
  nodeId: z.string().min(1),
  parentNodeId: z.string().min(1).nullable(),
  node: ProductNodeFieldsSchema,
  files: z.array(PlannedFileSchema).max(4),
}).strict();

const PlannedWiringSchema = GreenfieldWiringProposalSchema.omit({
  sourceTempRef: true,
  targetTempRef: true,
}).extend({
  edgeId: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
}).strict();

export const GreenfieldInitializationTrancheSchema = z.object({
  trancheId: z.string().min(1),
  order: z.number().int().min(1).max(64),
  dependsOnTrancheId: z.string().min(1).nullable(),
  nodeIds: z.array(z.string().min(1)).min(1).max(8),
  edgeIds: z.array(z.string().min(1)).max(64),
  fileTaskIds: z.array(z.string().min(1)).max(8),
}).strict();

/** Server-owned durable plan. Tranche hashes are bound later, immediately before execution. */
export const GreenfieldInitializationPlanSchema = z.object({
  version: z.literal("0.1.0"),
  planId: z.string().min(1),
  projectId: z.string().min(1),
  contextHash: GraphContentHashSchema,
  initialBaseGraphHash: GraphContentHashSchema,
  objective: z.string().trim().min(1).max(500),
  nodes: z.array(PlannedNodeSchema).min(3).max(64),
  wiring: z.array(PlannedWiringSchema).max(64),
  tranches: z.array(GreenfieldInitializationTrancheSchema).min(1).max(64),
  rationale: z.string().trim().min(1).max(1_000),
}).strict().superRefine((plan, ctx) => {
  requireUnique(plan.nodes.map((node) => node.tempRef), ["nodes"], "Node temporary references", ctx);
  requireUnique(plan.nodes.map((node) => node.nodeId), ["nodes"], "Durable node IDs", ctx);
  requireUnique(plan.wiring.map((edge) => edge.tempRef), ["wiring"], "Edge temporary references", ctx);
  requireUnique(plan.wiring.map((edge) => edge.edgeId), ["wiring"], "Durable edge IDs", ctx);
  const files = plan.nodes.flatMap((node) => node.files);
  if (files.length > 32) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes"], message: "Greenfield plans may contain at most 32 file leaves" });
  }
  requireUnique(files.map((file) => file.filePath), ["nodes"], "File paths", ctx);
  requireUnique(files.map((file) => file.taskId), ["nodes"], "File task IDs", ctx);
  requireUnique(plan.tranches.map((tranche) => tranche.trancheId), ["tranches"], "Tranche IDs", ctx);

  const nodeIds = new Set(plan.nodes.map((node) => node.nodeId));
  const edgeIds = new Set(plan.wiring.map((edge) => edge.edgeId));
  const taskIds = new Set(files.map((file) => file.taskId));
  const trancheNodeIds = plan.tranches.flatMap((tranche) => tranche.nodeIds);
  const trancheEdgeIds = plan.tranches.flatMap((tranche) => tranche.edgeIds);
  const trancheTaskIds = plan.tranches.flatMap((tranche) => tranche.fileTaskIds);
  requireExactPartition(trancheNodeIds, nodeIds, ["tranches"], "node", ctx);
  requireExactPartition(trancheEdgeIds, edgeIds, ["tranches"], "edge", ctx);
  requireExactPartition(trancheTaskIds, taskIds, ["tranches"], "file task", ctx);

  const nodesById = new Map(plan.nodes.map((node) => [node.nodeId, node]));
  const childCount = new Map<string, number>();
  const legalParentLevel = { context: null, container: "context", component: "container" } as const;
  plan.nodes.forEach((entry, index) => {
    const expectedParentLevel = legalParentLevel[entry.node.level];
    const parent = entry.parentNodeId ? nodesById.get(entry.parentNodeId) : undefined;
    if (
      expectedParentLevel === null
        ? entry.parentNodeId !== null
        : !parent || parent.node.level !== expectedParentLevel
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes", index, "parentNodeId"], message: "Planned hierarchy has an illegal parent" });
    }
    if (entry.parentNodeId) childCount.set(entry.parentNodeId, (childCount.get(entry.parentNodeId) ?? 0) + 1);
    if (entry.node.level === "component" ? entry.files.length === 0 : entry.files.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes", index, "files"], message: "Only component leaves may own files, and each component needs one" });
    }
  });
  plan.nodes.forEach((entry, index) => {
    if (entry.node.level !== "component" && (childCount.get(entry.nodeId) ?? 0) === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes", index], message: "Context and container nodes must lead to a component" });
    }
  });
  plan.wiring.forEach((edge, index) => {
    if (!nodesById.has(edge.sourceNodeId) || !nodesById.has(edge.targetNodeId) || edge.sourceNodeId === edge.targetNodeId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["wiring", index], message: "Planned wiring must connect two distinct planned nodes" });
    }
  });

  plan.tranches.forEach((tranche, index) => {
    if (tranche.order !== index + 1 || tranche.dependsOnTrancheId !== (index === 0 ? null : plan.tranches[index - 1]!.trancheId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tranches", index], message: "Tranches must form one explicit contiguous checkpoint chain" });
    }
  });
  const trancheIndexByNodeId = new Map(plan.tranches.flatMap((tranche, index) =>
    tranche.nodeIds.map((nodeId) => [nodeId, index] as const)));
  const trancheIndexByTaskId = new Map(plan.tranches.flatMap((tranche, index) =>
    tranche.fileTaskIds.map((taskId) => [taskId, index] as const)));
  const trancheIndexByEdgeId = new Map(plan.tranches.flatMap((tranche, index) =>
    tranche.edgeIds.map((edgeId) => [edgeId, index] as const)));
  if (!sameOrderedValues(trancheNodeIds, plan.nodes.map((node) => node.nodeId))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tranches"], message: "Tranche node order must match the server-derived hierarchy order" });
  }
  plan.nodes.forEach((node, index) => {
    const nodeTranche = trancheIndexByNodeId.get(node.nodeId);
    if (node.parentNodeId && (trancheIndexByNodeId.get(node.parentNodeId) ?? Number.MAX_SAFE_INTEGER) > (nodeTranche ?? -1)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes", index], message: "A parent must commit no later than its child" });
    }
    if (node.files.some((file) => trancheIndexByTaskId.get(file.taskId) !== nodeTranche)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes", index, "files"], message: "File tasks must commit atomically with their owner node" });
    }
  });
  plan.wiring.forEach((edge, index) => {
    const expectedTranche = Math.max(
      trancheIndexByNodeId.get(edge.sourceNodeId) ?? Number.MAX_SAFE_INTEGER,
      trancheIndexByNodeId.get(edge.targetNodeId) ?? Number.MAX_SAFE_INTEGER,
    );
    if (trancheIndexByEdgeId.get(edge.edgeId) !== expectedTranche) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["wiring", index], message: "Wiring must commit in the first tranche where both endpoints exist" });
    }
  });
});

function isSafeProductPath(path: string): boolean {
  if (path.includes("\\") || path.includes("\0") || path.startsWith("/")) return false;
  const parts = path.split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..") &&
    parts[0] !== ".git" && parts[0] !== ".projectos";
}

function requireUnique(
  values: string[],
  path: Array<string | number>,
  label: string,
  ctx: z.RefinementCtx,
): void {
  if (new Set(values).size !== values.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: `${label} must be unique` });
  }
}

function requireExactPartition(
  values: string[],
  expected: Set<string>,
  path: Array<string | number>,
  label: string,
  ctx: z.RefinementCtx,
): void {
  if (values.length !== expected.size || new Set(values).size !== values.length || values.some((value) => !expected.has(value))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: `Tranches must partition every ${label} exactly once` });
  }
}

function sameOrderedValues(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export type GreenfieldProductGraphProposal = z.infer<typeof GreenfieldProductGraphProposalSchema>;
export type GreenfieldInitializationPlan = z.infer<typeof GreenfieldInitializationPlanSchema>;
export type GreenfieldInitializationTranche = z.infer<typeof GreenfieldInitializationTrancheSchema>;
