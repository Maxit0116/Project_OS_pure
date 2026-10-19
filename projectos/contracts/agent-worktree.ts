import { z } from "zod";

/**
 * Agent harness git worktree isolation (H4.C).
 * Manifest: `.projectos/agent-worktrees.json`
 * Checkouts: `.projectos/agent-worktrees/<id>/`
 */

export const AgentWorktreeStatusSchema = z.enum([
  "active",
  "merged",
  "removed",
]);

export const AgentWorktreeRecordSchema = z
  .object({
    id: z.string().min(1).max(80),
    branch: z.string().min(1).max(200),
    /** Absolute path to the worktree checkout. */
    path: z.string().min(1),
    /** Relative path from workspace root (under `.projectos/agent-worktrees/`). */
    relativePath: z.string().min(1),
    createdAt: z.string().min(1),
    status: AgentWorktreeStatusSchema,
    /** Optional agent run / chat session that owns this isolation. */
    boundRunId: z.string().min(1).optional(),
    boundSessionId: z.string().min(1).optional(),
    mergedAt: z.string().min(1).optional(),
    removedAt: z.string().min(1).optional(),
  })
  .strict();

export const AgentWorktreeManifestSchema = z
  .object({
    version: z.literal("0.1.0"),
    worktrees: z.array(AgentWorktreeRecordSchema).max(32),
  })
  .strict();

export const CreateAgentWorktreeOptionsSchema = z
  .object({
    id: z.string().min(1).max(80).optional(),
    baseRef: z.string().min(1).max(200).optional(),
    boundRunId: z.string().min(1).optional(),
    boundSessionId: z.string().min(1).optional(),
  })
  .strict();

export const MergeAgentWorktreeOptionsSchema = z
  .object({
    worktreeId: z.string().min(1),
    /** Must be true — merge never runs without explicit confirmation. */
    confirm: z.literal(true),
    /** Target branch in the main workspace (default: current branch). */
    intoRef: z.string().min(1).max(200).optional(),
  })
  .strict();

export type AgentWorktreeStatus = z.infer<typeof AgentWorktreeStatusSchema>;
export type AgentWorktreeRecord = z.infer<typeof AgentWorktreeRecordSchema>;
export type AgentWorktreeManifest = z.infer<typeof AgentWorktreeManifestSchema>;
export type CreateAgentWorktreeOptions = z.infer<
  typeof CreateAgentWorktreeOptionsSchema
>;
export type MergeAgentWorktreeOptions = z.infer<
  typeof MergeAgentWorktreeOptionsSchema
>;
