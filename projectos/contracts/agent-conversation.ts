import { z } from "zod";

import { ContextAssembledPayloadSchema } from "./events.js";
import { PromptComposerFieldsSchema } from "./prompt-composer.js";

export const AgentConversationScopeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("global"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("node"),
      nodeId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("file"),
      nodeId: z.string().min(1),
      selectedFilePath: z.string().min(1),
    })
    .strict(),
]);

export const FileOwnershipErrorDetailsSchema = z
  .object({
    selectedFilePath: z.string().min(1),
    candidateNodeIds: z.array(z.string().min(1)),
  })
  .strict();

export const Bcp47LanguageTagSchema = z.string().min(1).max(64).refine(
  (tag) => {
    try {
      return Intl.getCanonicalLocales(tag).length === 1;
    } catch {
      return false;
    }
  },
  { message: "Expected a valid BCP-47 language tag" },
);

export const AgentAskLanguageSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("auto") }).strict(),
  z
    .object({
      mode: z.literal("override"),
      tag: Bcp47LanguageTagSchema,
    })
    .strict(),
]);

export const AgentAskRequestSchema = z
  .object({
    projectId: z.string().min(1),
    scope: AgentConversationScopeSchema,
    question: z.string().trim().min(1),
    language: AgentAskLanguageSchema,
  })
  .merge(PromptComposerFieldsSchema)
  .strict();

export const AgentResponseLanguageSchema = z
  .object({
    tag: Bcp47LanguageTagSchema,
    source: z.enum(["detected", "override", "undetermined"]),
    validation: z.enum([
      "passed",
      "retry_passed",
      "not_checkable",
      "mismatch_after_retry",
    ]),
  })
  .strict();

export const AgentAnswerReasoningSchema = z
  .object({
    content: z.string().min(1),
    source: z.literal("provider_supplied"),
    truncated: z.boolean(),
  })
  .strict();

export const AgentAnswerResultSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    scope: AgentConversationScopeSchema,
    answer: z.string().min(1),
    backend: z.literal("model"),
    modelProfileId: z.string().min(1),
    contextBundleHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    contextSummary: ContextAssembledPayloadSchema,
    reasoning: AgentAnswerReasoningSchema.optional(),
    responseLanguage: AgentResponseLanguageSchema,
    createdAt: z.string().min(1),
  })
  .strict()
  .superRefine((answer, ctx) => {
    if (answer.contextBundleHash !== answer.contextSummary.bundleHash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contextSummary", "bundleHash"],
        message: "Context summary hash must match contextBundleHash",
      });
    }
  });

export type AgentConversationScope = z.infer<
  typeof AgentConversationScopeSchema
>;
export type FileOwnershipErrorDetails = z.infer<
  typeof FileOwnershipErrorDetailsSchema
>;
export type AgentAskLanguage = z.infer<typeof AgentAskLanguageSchema>;
export type AgentAskRequest = z.infer<typeof AgentAskRequestSchema>;
export type AgentResponseLanguage = z.infer<
  typeof AgentResponseLanguageSchema
>;
export type AgentAnswerReasoning = z.infer<typeof AgentAnswerReasoningSchema>;
export type AgentAnswerResult = z.infer<typeof AgentAnswerResultSchema>;
