import { z } from "zod";

import { VerificationEvidenceSchema } from "./verification-evidence.js";

export const ExecCommandSchema = z.object({
  command: z.string().trim().min(1),
  args: z.array(z.string()),
  timeoutMs: z.number().int().min(100).max(300_000),
}).strict();

export const VerificationCommandResultSchema = z.object({
  command: ExecCommandSchema,
  status: z.enum(["passed", "failed"]),
  exitCode: z.number().int().nullable(),
  durationMs: z.number().nonnegative(),
  timedOut: z.boolean(),
  outputTruncated: z.boolean(),
  output: z.string().optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
}).strict();

export const VerificationRunResultSchema = z.object({
  runId: z.string().min(1),
  status: z.enum(["passed", "failed", "not_run"]),
  results: z.array(VerificationCommandResultSchema),
  evidence: VerificationEvidenceSchema.optional(),
}).strict();

export type ExecCommand = z.infer<typeof ExecCommandSchema>;
export type VerificationCommandResult = z.infer<typeof VerificationCommandResultSchema>;
export type VerificationRunResult = z.infer<typeof VerificationRunResultSchema>;
