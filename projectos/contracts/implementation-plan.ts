import { z } from "zod";

import { AgentConversationScopeSchema } from "./agent-conversation.js";
import { ModelImagePartSchema } from "./model-gateway.js";
import { PromptComposerFieldsSchema } from "./prompt-composer.js";

export const ImplementationPlanVersionSchema = z.literal("0.1.0");

export const ImplementationPlanStepSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().trim().min(1),
    affectedFiles: z.array(z.string().min(1)),
    acceptanceCriteria: z.array(z.string().trim().min(1)),
  })
  .strict();

export const ImplementationPlanTodoSchema = z
  .object({
    id: z.string().min(1),
    content: z.string().trim().min(1),
    status: z.enum(["pending", "done"]),
  })
  .strict();

export const ClarifyingQuestionOptionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
  })
  .strict();

export const ClarifyingQuestionSchema = z
  .object({
    id: z.string().min(1),
    question: z.string().trim().min(1),
    options: z.array(ClarifyingQuestionOptionSchema).min(2).max(5).optional(),
    answer: z.string().trim().min(1).optional(),
    selectedOptionId: z.string().min(1).optional(),
  })
  .strict();

export const ImplementationPlanStatusSchema = z.enum([
  "draft",
  "needs_clarification",
  "ready",
  "building",
  "built",
]);

export const ImplementationPlanSchema = z
  .object({
    version: ImplementationPlanVersionSchema,
    id: z.string().min(1),
    projectId: z.string().min(1),
    scope: AgentConversationScopeSchema,
    objective: z.string().trim().min(1),
    steps: z.array(ImplementationPlanStepSchema),
    todos: z.array(ImplementationPlanTodoSchema),
    ambiguities: z.array(z.string()),
    clarifyingQuestions: z.array(ClarifyingQuestionSchema).optional(),
    rationale: z.string().trim().min(1),
    status: ImplementationPlanStatusSchema,
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const CreatePlanRequestSchema = z
  .object({
    projectId: z.string().min(1),
    scope: AgentConversationScopeSchema,
    objective: z.string().trim().min(1),
    clarifyingAnswers: z
      .array(
        z
          .object({
            questionId: z.string().min(1),
            answer: z.string().trim().min(1),
            selectedOptionId: z.string().min(1).optional(),
          })
          .strict(),
      )
      .optional(),
    existingQuestions: z.array(ClarifyingQuestionSchema).optional(),
    existingPlanId: z.string().min(1).optional(),
    chatSessionId: z.string().min(1).optional(),
    images: z.array(ModelImagePartSchema).max(4).optional(),
  })
  .merge(PromptComposerFieldsSchema)
  .strict();

export const UpdatePlanRequestSchema = z
  .object({
    planId: z.string().min(1),
    objective: z.string().trim().min(1).optional(),
    steps: z.array(ImplementationPlanStepSchema).optional(),
    todos: z.array(ImplementationPlanTodoSchema).optional(),
    rationale: z.string().trim().min(1).optional(),
    status: ImplementationPlanStatusSchema.optional(),
  })
  .strict();

export const LatestPlanTraceSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("running"),
      scope: AgentConversationScopeSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("complete"),
      scope: AgentConversationScopeSchema,
      result: ImplementationPlanSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("needs_clarification"),
      scope: AgentConversationScopeSchema,
      result: ImplementationPlanSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("error"),
      scope: AgentConversationScopeSchema,
      message: z.string(),
    })
    .strict(),
]);

export type ImplementationPlanVersion = z.infer<
  typeof ImplementationPlanVersionSchema
>;
export type ImplementationPlanStep = z.infer<
  typeof ImplementationPlanStepSchema
>;
export type ImplementationPlanTodo = z.infer<
  typeof ImplementationPlanTodoSchema
>;
export type ClarifyingQuestionOption = z.infer<typeof ClarifyingQuestionOptionSchema>;
export type ClarifyingQuestion = z.infer<typeof ClarifyingQuestionSchema>;
export type ImplementationPlanStatus = z.infer<
  typeof ImplementationPlanStatusSchema
>;
export type ImplementationPlan = z.infer<typeof ImplementationPlanSchema>;
export type CreatePlanRequest = z.infer<typeof CreatePlanRequestSchema>;
export type UpdatePlanRequest = z.infer<typeof UpdatePlanRequestSchema>;

export const WorkspacePlanSummarySchema = z
  .object({
    id: z.string().min(1),
    path: z.string().min(1),
    objective: z.string().min(1),
    status: ImplementationPlanStatusSchema.optional(),
    updatedAt: z.string().min(1).optional(),
  })
  .strict();

export type WorkspacePlanSummary = z.infer<typeof WorkspacePlanSummarySchema>;
export type LatestPlanTrace = z.infer<typeof LatestPlanTraceSchema>;
