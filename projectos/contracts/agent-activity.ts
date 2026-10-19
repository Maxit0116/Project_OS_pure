import { z } from "zod";

/** One real agent action, projected twice: sidebar summary, Agent Flow detail. */
export const AgentActivityKindSchema = z.enum([
  "thinking",
  "planning",
  "grep",
  "read_file",
  "edit",
  "shell",
  "context",
  "mcp",
]);

export const AgentActivityStatusSchema = z.enum([
  "running",
  "complete",
  "error",
]);

export const AgentActivityModeSchema = z.enum([
  "ask",
  "change",
  "plan",
  "debug",
]);

const GrepHitSchema = z
  .object({
    path: z.string().min(1),
    line: z.number().int().positive().optional(),
    preview: z.string().optional(),
  })
  .strict();

const ContextFileSchema = z
  .object({
    path: z.string().min(1),
    disposition: z.string().min(1),
    includedByteLength: z.number().int().nonnegative().optional(),
    byteLength: z.number().int().nonnegative().optional(),
    omissionReason: z.string().optional(),
  })
  .strict();

export const AgentActivityDetailSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("thinking"),
      content: z.string(),
      truncated: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("planning"),
      objective: z.string(),
      anchors: z.array(z.string()),
      acceptanceCriteria: z.array(z.string()),
    })
    .strict(),
  z
    .object({
      kind: z.literal("grep"),
      queries: z.array(z.string()),
      hits: z.array(GrepHitSchema),
      paths: z.array(z.string()),
    })
    .strict(),
  z
    .object({
      kind: z.literal("read_file"),
      path: z.string().min(1),
      byteLength: z.number().int().nonnegative().optional(),
      status: z.string().optional(),
      startLine: z.number().int().positive().optional(),
      endLine: z.number().int().positive().optional(),
      excerpt: z.string().optional(),
      truncated: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("edit"),
      path: z.string().min(1),
      operation: z.string().min(1),
      additions: z.number().int().nonnegative().optional(),
      deletions: z.number().int().nonnegative().optional(),
      hunkHeader: z.string().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("shell"),
      command: z.string().optional(),
      status: z.string().min(1),
      exitCode: z.number().int().nullable().optional(),
      stdout: z.string().optional(),
      stderr: z.string().optional(),
      truncated: z.boolean().optional(),
      durationMs: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("context"),
      bundleHash: z.string().optional(),
      files: z.array(ContextFileSchema),
    })
    .strict(),
  z
    .object({
      kind: z.literal("mcp"),
      serverId: z.string().min(1),
      toolName: z.string().min(1),
      status: z.string().min(1),
      durationMs: z.number().int().nonnegative(),
      error: z.string().optional(),
    })
    .strict(),
]);

export const AgentActivitySchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    /** Chat message this summary row belongs to. Absent rows render with the live run. */
    anchorMessageId: z.string().min(1).optional(),
    mode: AgentActivityModeSchema,
    kind: AgentActivityKindSchema,
    status: AgentActivityStatusSchema,
    /** Sidebar-only line. Detail must not be copied into this string. */
    summary: z.string().min(1),
    /** Agent Flow step this activity belongs under, when the run emitted one. */
    phaseId: z.string().min(1).optional(),
    startedAt: z.string().min(1),
    completedAt: z.string().optional(),
    detail: AgentActivityDetailSchema,
  })
  .strict()
  .superRefine((activity, ctx) => {
    if (activity.detail.kind !== activity.kind) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["detail", "kind"],
        message: "Activity detail kind must match activity kind",
      });
    }
  });

export type AgentActivityKind = z.infer<typeof AgentActivityKindSchema>;
export type AgentActivityStatus = z.infer<typeof AgentActivityStatusSchema>;
export type AgentActivityMode = z.infer<typeof AgentActivityModeSchema>;
export type AgentActivityDetail = z.infer<typeof AgentActivityDetailSchema>;
export type AgentActivity = z.infer<typeof AgentActivitySchema>;
