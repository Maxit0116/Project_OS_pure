import { z } from "zod";

import { ExecutorSelectionSchema } from "./executor-selection.js";
import { FunctionalEdgeRelationSchema } from "./graph.js";
import { ModelProfileSchema, ThinkingDepthSchema } from "./settings.js";

export const IntentTouchSchema = z.object({
  nodeId: z.string().min(1),
  reason: z.string().trim().min(1),
  allow: z.object({
    editExisting: z.boolean(),
    addParts: z.boolean(),
    deletePartIds: z.array(z.string().min(1)),
  }).strict(),
  /**
   * Existing files the model expects this change to edit, as it found them while reading the code.
   * A file several capabilities own is shared: the server adds those owners as derived touches so the
   * approver sees every capability the change reaches. Paths the project does not have are ignored.
   */
  files: z.array(z.string().min(1).max(300)).max(12).optional(),
  /**
   * Set by the server for an owner of a file the change edits that the model did not name. It widens
   * what the approver sees and what publication may touch, but it is not work to route or delegate.
   */
  derived: z.literal(true).optional(),
}).strict();

export const IntentNodeWiringSchema = z.object({
  existingNodeId: z.string().min(1),
  direction: z.enum(["from_new", "to_new"]),
  relation: FunctionalEdgeRelationSchema,
  label: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(500).optional(),
}).strict();

export const IntentStructuralEffectSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("add_node"),
    parentNodeId: z.string().min(1),
    name: z.string().trim().min(1),
    level: z.enum(["context", "container", "component"]).optional(),
    wiring: z.array(IntentNodeWiringSchema).max(8).optional(),
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
  selectedOptionId: z.string().min(1).optional(),
}).strict();

/** Closed model output used before the server derives graph routing and deletion counts. */
// What the model returns. Keys it adds beyond these are dropped rather than failing the whole
// answer; the server derives everything that carries authority and re-validates the stored intent.
export const RequestIntentDraftSchema = z.object({
  goal: z.string().trim().min(1),
  kind: z.enum(["change", "add_node", "delete_node", "mixed"]),
  touches: z.array(IntentTouchSchema.strip()).min(1),
  structuralProposals: z.array(z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("add_node"),
      parentNodeId: z.string().min(1),
      name: z.string().trim().min(1),
      level: z.enum(["context", "container", "component"]),
      wiring: z.array(IntentNodeWiringSchema).max(8),
    }).strict(),
    z.object({ kind: z.literal("delete_node"), nodeId: z.string().min(1) }).strict(),
    z.object({ kind: z.literal("connect_nodes"), sourceNodeId: z.string().min(1), targetNodeId: z.string().min(1) }).strict(),
  ])),
  assumptions: z.array(z.string().trim().min(1)),
  outOfScope: z.array(z.string().trim().min(1)),
  acceptance: z.array(z.string().trim().min(1)).min(1),
  questions: z.array(IntentQuestionSchema),
});

export const RequestIntentSchema = z.object({
  version: z.literal("0.1.0"),
  id: z.string().min(1),
  projectId: z.string().min(1),
  rawRequest: z.string().trim().min(1),
  requestedFile: z.object({
    nodeId: z.string().min(1),
    path: z.string().min(1),
  }).strict().optional(),
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
  executorSnapshot: z.object({
    kind: z.literal("model"),
    profile: ModelProfileSchema,
    thinkingDepth: ThinkingDepthSchema,
  }).strict().optional(),
  /**
   * The model that independently validates a runtime executor's proposal. Fixed when the
   * intent is drafted and covered by the approval hash, so the user sees and approves which
   * provider will receive the file and diff. Absent means the proposal stays review-only.
   */
  validatorSnapshot: z.object({
    kind: z.literal("model"),
    profile: ModelProfileSchema,
    thinkingDepth: ThinkingDepthSchema,
  }).strict().optional(),
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

export const ExtractRequestIntentRequestSchema = z.object({
  projectId: z.string().min(1),
  rawRequest: z.string().trim().min(1),
  nodeId: z.string().min(1).optional(),
  filePath: z.string().min(1).optional(),
  executorSelection: ExecutorSelectionSchema,
  chatSessionId: z.string().min(1).optional(),
}).strict();

export type IntentTouch = z.infer<typeof IntentTouchSchema>;
export type IntentNodeWiring = z.infer<typeof IntentNodeWiringSchema>;
export type IntentStructuralEffect = z.infer<typeof IntentStructuralEffectSchema>;
export type IntentQuestion = z.infer<typeof IntentQuestionSchema>;
export type RequestIntentDraft = z.infer<typeof RequestIntentDraftSchema>;
export type RequestIntent = z.infer<typeof RequestIntentSchema>;
export type ExtractRequestIntentRequest = z.infer<typeof ExtractRequestIntentRequestSchema>;
