import { z } from "zod";

import { ClarifyingQuestionOptionSchema } from "./implementation-plan.js";
import { ConfidenceSchema } from "./confidence.js";

export const AlignmentItemKindSchema = z.enum([
  "stated",
  "guess",
  "constraint",
  "out_of_scope",
]);

export const AlignmentItemSchema = z
  .object({
    id: z.string().min(1),
    kind: AlignmentItemKindSchema,
    text: z.string().trim().min(1).max(500),
    selected: z.boolean(),
    comment: z.string().trim().max(2_000).optional(),
    severity: z.enum(["blocking", "normal"]).optional(),
    relatedFileHints: z.array(z.string().min(1).max(500)).max(32).optional(),
  })
  .strict();

export const AlignmentQuestionTopicSchema = z.enum([
  "implementation",
  "scope",
  "ux",
  "data",
  "testing",
  "other",
]);

export const AlignmentQuestionSchema = z
  .object({
    id: z.string().min(1),
    question: z.string().trim().min(1),
    options: z.array(ClarifyingQuestionOptionSchema).min(2).max(5).optional(),
    answer: z.string().trim().min(1).optional(),
    selectedOptionId: z.string().min(1).optional(),
    topic: AlignmentQuestionTopicSchema.optional(),
    blocking: z.boolean().optional(),
  })
  .strict();

export const AlignmentContractStatusSchema = z.enum([
  "drafting",
  "awaiting_user",
  "confirmed",
  "revised",
  "superseded",
]);

export const AlignmentContractSchema = z
  .object({
    version: z.literal("0.1.0"),
    id: z.string().min(1),
    rawPrompt: z.string().optional(),
    items: z.array(AlignmentItemSchema).max(24),
    questions: z.array(AlignmentQuestionSchema).max(5),
    confidence: ConfidenceSchema.optional(),
    status: AlignmentContractStatusSchema.optional(),
  })
  .strict();

export const ConfirmAlignmentItemPatchSchema = z
  .object({
    id: z.string().min(1),
    selected: z.boolean(),
    comment: z.string().trim().max(2_000).optional(),
  })
  .strict();

export const ConfirmAlignmentAnswerSchema = z
  .object({
    questionId: z.string().min(1),
    selectedOptionId: z.string().min(1).optional(),
    answer: z.string().trim().min(1).max(4_000),
  })
  .strict();

export const ConfirmAlignmentRequestSchema = z
  .object({
    contractId: z.string().min(1),
    refinementId: z.string().min(1),
    items: z.array(ConfirmAlignmentItemPatchSchema).max(24),
    answers: z.array(ConfirmAlignmentAnswerSchema).max(5),
  })
  .strict();

/** Debug: per-bug alignment + per-item fixed. */
export const BugAlignmentStatusSchema = z.enum([
  "proposed",
  "confirmed",
  "rejected",
  "fixing",
  "fixed",
  "regressed",
  "abandoned",
]);

export const BugAlignmentItemSchema = z
  .object({
    id: z.string().min(1),
    summary: z.string().trim().min(1).max(500),
    selected: z.boolean(),
    comment: z.string().trim().max(2_000).optional(),
    status: BugAlignmentStatusSchema,
    reproHint: z.string().trim().max(2_000).optional(),
    dependsOn: z.array(z.string().min(1)).max(8).optional(),
    linkedRunId: z.string().min(1).optional(),
    fixedAt: z.string().min(1).optional(),
  })
  .strict();

export const ConfirmBugAlignmentRequestSchema = z
  .object({
    sessionId: z.string().min(1),
    bugs: z
      .array(
        z
          .object({
            id: z.string().min(1),
            selected: z.boolean(),
            comment: z.string().trim().max(2_000).optional(),
            rejected: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(24),
  })
  .strict();

export const MarkBugFixedRequestSchema = z
  .object({
    sessionId: z.string().min(1),
    bugId: z.string().min(1),
  })
  .strict();

export type AlignmentItemKind = z.infer<typeof AlignmentItemKindSchema>;
export type AlignmentItem = z.infer<typeof AlignmentItemSchema>;
export type AlignmentQuestionTopic = z.infer<typeof AlignmentQuestionTopicSchema>;
export type AlignmentQuestion = z.infer<typeof AlignmentQuestionSchema>;
export type AlignmentContractStatus = z.infer<typeof AlignmentContractStatusSchema>;
export type AlignmentContract = z.infer<typeof AlignmentContractSchema>;
export type ConfirmAlignmentItemPatch = z.infer<
  typeof ConfirmAlignmentItemPatchSchema
>;
export type ConfirmAlignmentAnswer = z.infer<typeof ConfirmAlignmentAnswerSchema>;
export type ConfirmAlignmentRequest = z.infer<typeof ConfirmAlignmentRequestSchema>;
export type BugAlignmentStatus = z.infer<typeof BugAlignmentStatusSchema>;
export type BugAlignmentItem = z.infer<typeof BugAlignmentItemSchema>;
export type ConfirmBugAlignmentRequest = z.infer<
  typeof ConfirmBugAlignmentRequestSchema
>;
export type MarkBugFixedRequest = z.infer<typeof MarkBugFixedRequestSchema>;

/** Re-export option schema for consumers that only need options. */
export { ClarifyingQuestionOptionSchema };
