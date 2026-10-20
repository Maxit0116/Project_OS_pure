import { z } from "zod";

/**
 * Frozen record of one run's six context slots (CTX-0).
 * Hashes and sizes only. Rule text, retrieval quotes, and file bodies stay
 * in their own snapshots.
 */

export const ContextAssemblyVersionSchema = z.literal("0.1.0");

export const ContextAssemblyOmissionReasonSchema = z.enum([
  "rules_budget",
  "rules_frontmatter",
  "walk_secret",
  "stale_selection",
  "editor_buffer",
  "compaction_failed",
  "explicit_budget",
  "stale_description",
]);

export const ContextSlotDigestSchema = z
  .object({
    chars: z.number().int().nonnegative(),
    sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  })
  .strict();

export const ContextRetrievalSlotSchema = ContextSlotDigestSchema.extend({
  searched: z.boolean(),
}).strict();

export const ContextAssemblySchema = z
  .object({
    version: ContextAssemblyVersionSchema,
    assemblyId: z.string().min(1),
    contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    slots: z
      .object({
        instructions: ContextSlotDigestSchema,
        scope: ContextSlotDigestSchema,
        pins: ContextSlotDigestSchema,
        retrieval: ContextRetrievalSlotSchema,
        memory: ContextSlotDigestSchema,
        session: ContextSlotDigestSchema,
      })
      .strict(),
    omissions: z
      .array(
        z
          .object({
            reason: ContextAssemblyOmissionReasonSchema,
            count: z.number().int().positive(),
          })
          .strict(),
      ),
    /** Selected-file bytes plus pin characters. Retrieval must not spend these. */
    reserved: z.number().int().nonnegative(),
  })
  .strict();

export type ContextAssemblyVersion = z.infer<typeof ContextAssemblyVersionSchema>;
export type ContextAssemblyOmissionReason = z.infer<
  typeof ContextAssemblyOmissionReasonSchema
>;
export type ContextAssembly = z.infer<typeof ContextAssemblySchema>;
