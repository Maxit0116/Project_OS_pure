import { z } from "zod";

import { FunctionalEdgeRelationSchema } from "./graph.js";
import { HierarchyPlannerLevelSchema } from "./hierarchy-delegation.js";

const ParentScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("global") }).strict(),
  z.object({
    kind: z.enum(["context", "container"]),
    nodeId: z.string().min(1),
  }).strict(),
]);

export const NodeScaffoldWiringSchema = z.object({
  edgeId: z.string().min(1),
  direction: z.enum(["from_new", "to_new"]),
  existingNodeId: z.string().min(1),
  relation: FunctionalEdgeRelationSchema,
  label: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(500).optional(),
}).strict();

export const NodeScaffoldFileTaskSchema = z.object({
  taskId: z.string().min(1),
  filePath: z.string().min(1),
  responsibility: z.string().trim().min(1).max(2_000),
  objective: z.string().trim().min(1).max(500),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
}).strict();

export const NodeScaffoldPlanSchema = z.object({
  version: z.literal("0.1.0"),
  planId: z.string().min(1),
  projectId: z.string().min(1),
  parentRunId: z.string().min(1),
  parentScope: ParentScopeSchema,
  contextHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  baseGraphHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  objective: z.string().trim().min(1).max(500),
  newNodeId: z.string().min(1),
  nodeTempRef: z.string().min(1),
  node: z.object({
    name: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(1_000),
    responsibility: z.string().trim().min(1).max(2_000),
    level: HierarchyPlannerLevelSchema,
  }).strict(),
  wiring: z.array(NodeScaffoldWiringSchema).max(8),
  files: z.array(NodeScaffoldFileTaskSchema).max(4),
  rationale: z.string().trim().min(1).max(500),
}).strict().superRefine((plan, ctx) => {
  if (plan.wiring.length === 0 && plan.files.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["wiring"],
      message: "A scaffolded node requires wiring or owned files",
    });
  }
  if (plan.files.length > 0 && plan.node.level !== "component") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["files"],
      message: "Only component nodes may own scaffolded files",
    });
  }
  if (new Set(plan.files.map((file) => file.filePath)).size !== plan.files.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["files"],
      message: "Scaffolded file paths must be unique",
    });
  }
  if (new Set(plan.wiring.map((edge) => edge.edgeId)).size !== plan.wiring.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["wiring"],
      message: "Scaffold wiring identities must be unique",
    });
  }
});

export type NodeScaffoldPlan = z.infer<typeof NodeScaffoldPlanSchema>;
export type NodeScaffoldFileTask = z.infer<typeof NodeScaffoldFileTaskSchema>;
