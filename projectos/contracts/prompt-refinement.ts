import { z } from "zod";

import { ConfidenceSchema } from "./confidence.js";
import { ModelImagePartSchema } from "./model-gateway.js";
import { ChangeExecutionPolicySchema } from "./settings.js";
import { PromptComposerFieldsSchema } from "./prompt-composer.js";

export const PromptRefineRequestSchema = z
  .object({
    projectId: z.string(),
    nodeId: z.string().optional(),
    filePath: z.string().optional(),
    rawPrompt: z.string(),
    chatSessionId: z.string().min(1).optional(),
    images: z.array(ModelImagePartSchema).max(4).optional(),
  })
  .merge(PromptComposerFieldsSchema)
  .strict();

export const PromptRefinementModeSchema = z.enum([
  "model",
  "deterministic_fixture",
]);

export const PromptRefinementFallbackSchema = z
  .object({
    stage: z.literal("prompt_refinement"),
    backend: z.enum(["model", "external"]),
    profileId: z.string().optional(),
    message: z.string(),
    providerMessage: z.string().optional(),
  })
  .strict();

export const PromptRefinementSchema = z
  .object({
    id: z.string(),
    understood: z.string(),
    ambiguities: z.array(z.string()),
    suggestions: z.array(z.string()),
    affectedNodeIds: z.array(z.string()),
    affectedFiles: z.array(z.string()),
    confidence: ConfidenceSchema,
    mode: PromptRefinementModeSchema,
    executionPolicy: ChangeExecutionPolicySchema.optional(),
    fallback: PromptRefinementFallbackSchema.optional(),
    sourcePlanId: z.string().min(1).optional(),
  })
  .strict();

export type PromptRefineRequest = z.infer<typeof PromptRefineRequestSchema>;
export type PromptRefinementMode = z.infer<typeof PromptRefinementModeSchema>;
export type PromptRefinementFallback = z.infer<
  typeof PromptRefinementFallbackSchema
>;
export type PromptRefinement = z.infer<typeof PromptRefinementSchema>;
