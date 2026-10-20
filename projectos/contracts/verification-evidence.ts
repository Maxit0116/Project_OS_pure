import { z } from "zod";

import { ToolResultSchema } from "./tool-result.js";

/**
 * One run's verification record (V-0).
 * `passed` is command evidence plus an empty unexpected-path list.
 * Acceptance criteria may be attached, but they never produce `passed` alone.
 */
export const VerificationEvidenceReasonSchema = z.enum([
  "commands_passed",
  "command_failed",
  "not_configured",
  "approval_required",
  "policy_denied",
  "timed_out",
  "output_truncated",
  "unexpected_paths",
]);

export const VerificationEvidenceSchema = z
  .object({
    evidenceId: z.string().min(1),
    runId: z.string().min(1),
    status: z.enum(["passed", "failed", "not_run"]),
    reason: VerificationEvidenceReasonSchema,
    commands: z.array(ToolResultSchema),
    unexpectedPaths: z.array(z.string()),
    /** Read-only suggestions. Empty unless a symbol index supplied them. */
    suggestedTests: z.array(z.string()),
    acceptanceCriteria: z.array(z.string()).optional(),
  })
  .strict();

export type VerificationEvidenceReason = z.infer<typeof VerificationEvidenceReasonSchema>;
export type VerificationEvidence = z.infer<typeof VerificationEvidenceSchema>;
