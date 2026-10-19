import { z } from "zod";

/**
 * Per-model harness instruction variants (H4.B).
 * File: `.projectos/model-harness.json`
 */

export const ModelHarnessVariantMatchSchema = z
  .object({
    modelProfileId: z.string().min(1).optional(),
    /** Glob against ModelProfile.model (e.g. `claude-*`). */
    model: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((match, ctx) => {
    if (!match.modelProfileId && !match.model && !match.provider) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Variant match requires modelProfileId, model, or provider",
      });
    }
  });

export const ModelHarnessVariantSchema = z
  .object({
    match: ModelHarnessVariantMatchSchema,
    systemDelta: z.string().max(8_000).optional(),
    preferGrepVsSearch: z.boolean().optional(),
  })
  .strict();

export const ModelHarnessDocumentSchema = z
  .object({
    version: z.literal("0.1.0"),
    variants: z.array(ModelHarnessVariantSchema).max(64),
  })
  .strict();

export type ModelHarnessVariantMatch = z.infer<
  typeof ModelHarnessVariantMatchSchema
>;
export type ModelHarnessVariant = z.infer<typeof ModelHarnessVariantSchema>;
export type ModelHarnessDocument = z.infer<typeof ModelHarnessDocumentSchema>;
