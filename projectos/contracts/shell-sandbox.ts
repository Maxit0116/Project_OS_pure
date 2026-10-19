import { z } from "zod";

/**
 * Agent Harness shell sandbox config (H3.B).
 * File: `.projectos/sandbox.json`
 *
 * v0 is a soft sandbox (argv/env policy). Full OS Seatbelt/Landlock is later;
 * when a command cannot be proven soft-safe, classification is `ask` — never
 * silent full-access escalation.
 */

export const ShellSandboxConfigSchema = z
  .object({
    version: z.literal("0.1.0"),
    /** When false (default), network-oriented binaries are not soft-runnable. */
    networkAccess: z.boolean().default(false),
    /** Extra relative roots writable under soft policy (rarely needed). */
    additionalWritableRoots: z.array(z.string().min(1)).max(20).default([]),
    /** Disable writing under workspace temp dirs (default allows). */
    allowTempWrites: z.boolean().default(true),
  })
  .strict();

export const ShellSandboxDecisionSchema = z.enum([
  "sandboxed",
  "ask",
  "deny",
]);

export const ShellSandboxClassificationSchema = z
  .object({
    decision: ShellSandboxDecisionSchema,
    reasons: z.array(z.string().min(1)).max(20),
    /** True when no OS-level sandbox is available (v0 always true). */
    softOnly: z.boolean(),
    platform: z.enum(["darwin", "linux", "win32", "other"]),
  })
  .strict();

export type ShellSandboxConfig = z.infer<typeof ShellSandboxConfigSchema>;
export type ShellSandboxDecision = z.infer<typeof ShellSandboxDecisionSchema>;
export type ShellSandboxClassification = z.infer<
  typeof ShellSandboxClassificationSchema
>;
