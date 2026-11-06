import { z } from "zod";

import { VerificationEvidenceSchema } from "./verification-evidence.js";

/**
 * A folder inside the project, relative to its root, with forward slashes: `backend`, `apps/web`.
 * Projects with a backend and a frontend keep each one's tests in its own folder (pytest in
 * `backend/`, npm in `frontend/`), and the runner starts a program with no shell, so `cd backend &&`
 * cannot be written into the command itself.
 */
export const CommandDirectorySchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !/^[A-Za-z]:/u.test(value) &&
      value.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
    { message: "must be a folder inside the project, like backend or apps/web" },
  );

export const ExecCommandSchema = z.object({
  command: z.string().trim().min(1),
  args: z.array(z.string()),
  timeoutMs: z.number().int().min(100).max(300_000),
  /** Run in this folder of the project instead of its root. */
  cwd: CommandDirectorySchema.optional(),
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
