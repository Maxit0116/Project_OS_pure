import { z } from "zod";

import { ExecutorSelectionSchema } from "./executor-selection.js";

export const IntentTouchSchema = z.object({
  nodeId: z.string().min(1),
  reason: z.string().trim().min(1),
  allow: z.object({
    editExisting: z.boolean(),
    addParts: z.boolean(),
    deletePartIds: z.array(z.string().min(1)),
  }).strict(),
}).strict();

export const IntentStructuralEffectSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("add_node"),
    parentNodeId: z.string().min(1),
    name: z.string().trim().min(1),
    source: z.enum(["model_proposed", "server_derived"]),
  }).strict(),
  z.object({
    kind: z.literal("delete_node"),
    nodeId: z.string().min(1),
    descendantCount: z.number().int().nonnegative(),
    ownedFileCount: z.number().int().nonnegative(),
    source: z.literal("server_derived"),
  }).strict(),
  z.object({
    kind: z.literal("connect_nodes"),
    sourceNodeId: z.string().min(1),
    targetNodeId: z.string().min(1),
    source: z.enum(["model_proposed", "server_derived"]),
  }).strict(),
]);

export const IntentQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1),
  options: z.array(z.object({ id: z.string().min(1), label: z.string().trim().min(1) }).strict()).optional(),
  recommendation: z.string().trim().min(1).optional(),
  answer: z.string().trim().min(1).optional(),
}).strict();

export const RequestIntentSchema = z.object({
  version: z.literal("0.1.0"),
  id: z.string().min(1),
  projectId: z.string().min(1),
  rawRequest: z.string().trim().min(1),
  goal: z.string().trim().min(1),
  kind: z.enum(["change", "add_node", "delete_node", "mixed"]),
  entryNodeId: z.string().min(1).nullable(),
  touches: z.array(IntentTouchSchema).min(1),
  structuralEffects: z.array(IntentStructuralEffectSchema),
  assumptions: z.array(z.string().trim().min(1)),
  outOfScope: z.array(z.string().trim().min(1)),
  acceptance: z.array(z.string().trim().min(1)).min(1),
  questions: z.array(IntentQuestionSchema),
  executorSelection: ExecutorSelectionSchema,
  baseGraphHash: z.string().min(1),
  revision: z.number().int().positive(),
  status: z.enum(["draft", "approved", "superseded"]),
  approvalHash: z.string().min(1).optional(),
  approvedAt: z.string().min(1).optional(),
}).strict().superRefine((intent, ctx) => {
  if (intent.status === "approved" && (!intent.approvalHash || !intent.approvedAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Approved intent requires approval metadata" });
  }
});

export type IntentTouch = z.infer<typeof IntentTouchSchema>;
export type IntentStructuralEffect = z.infer<typeof IntentStructuralEffectSchema>;
export type IntentQuestion = z.infer<typeof IntentQuestionSchema>;
export type RequestIntent = z.infer<typeof RequestIntentSchema>;
