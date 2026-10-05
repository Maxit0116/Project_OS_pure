import { z } from "zod";

import { ConfidenceSchema } from "./confidence.js";
import { VerificationStatusSchema } from "./diff.js";

export const HarnessRecordVersionSchema = z.literal("0.1.0");

export const HarnessSourceSchema = z.enum([
  "terminal",
  "compiler",
  "runtime",
  "demo",
]);

export const HarnessHypothesisSchema = z
  .object({
    id: z.string(),
    summary: z.string(),
    confidence: ConfidenceSchema,
    evidence: z.array(z.string()),
    rejected: z.boolean().optional(),
    rejectionReason: z.string().optional(),
  })
  .strict();

export const HarnessPatchKindSchema = z.enum([
  "root_cause",
  "patch_like",
  "unknown",
]);

export const HarnessProposedFixSchema = z
  .object({
    summary: z.string(),
    touchedFiles: z.array(z.string()),
    patchKind: HarnessPatchKindSchema,
  })
  .strict();

export const HarnessVerificationSchema = z
  .object({
    status: VerificationStatusSchema,
    command: z.string().optional(),
    outputSummary: z.string().optional(),
  })
  .strict();

export const HarnessRecordSchema = z
  .object({
    version: HarnessRecordVersionSchema,
    errorId: z.string(),
    projectId: z.string(),
    source: HarnessSourceSchema,
    rawError: z.string(),
    businessNodeId: z.string().optional(),
    technicalFiles: z.array(z.string()),
    hypotheses: z.array(HarnessHypothesisSchema),
    chosenRootCauseId: z.string(),
    proposedFix: HarnessProposedFixSchema,
    verification: HarnessVerificationSchema,
  })
  .strict();

export type HarnessRecordVersion = z.infer<typeof HarnessRecordVersionSchema>;
export type HarnessSource = z.infer<typeof HarnessSourceSchema>;
export type HarnessHypothesis = z.infer<typeof HarnessHypothesisSchema>;
export type HarnessPatchKind = z.infer<typeof HarnessPatchKindSchema>;
export type HarnessProposedFix = z.infer<typeof HarnessProposedFixSchema>;
export type HarnessVerification = z.infer<typeof HarnessVerificationSchema>;
export type HarnessRecord = z.infer<typeof HarnessRecordSchema>;
