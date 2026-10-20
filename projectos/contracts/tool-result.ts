import { z } from "zod";

import { HarnessToolNameSchema } from "./tool-policy.js";

/**
 * Shared envelope for harness tool results (Tools T-0).
 * `summary` is server-written. `output` is already truncated and redacted.
 * A truncated result is not a complete log or a complete patch.
 */
export const ToolResultDiffStatsSchema = z
  .object({
    files: z.number().int().nonnegative(),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
  })
  .strict();

export const ToolResultArtifactsSchema = z
  .object({
    paths: z.array(z.string()).optional(),
    diffStats: ToolResultDiffStatsSchema.optional(),
    backupId: z.string().min(1).optional(),
  })
  .strict();

export const ToolResultSchema = z
  .object({
    tool: HarnessToolNameSchema,
    ok: z.boolean(),
    exitCode: z.number().int().nullable(),
    summary: z.string(),
    output: z.string(),
    truncated: z.boolean(),
    artifacts: ToolResultArtifactsSchema.optional(),
  })
  .strict();

export type ToolResultDiffStats = z.infer<typeof ToolResultDiffStatsSchema>;
export type ToolResultArtifacts = z.infer<typeof ToolResultArtifactsSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;
