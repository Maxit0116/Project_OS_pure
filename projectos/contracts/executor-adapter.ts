import { z } from "zod";

import { AgentRunScopeSchema } from "./agent-run.js";
import { GeneratedDiffSchema } from "./diff.js";

export const ExecutorModeSchema = z.enum(["ask", "plan", "change", "debug"]);
export const ExecutorRoleSchema = z.enum(["global", "planner", "leaf"]);
export const ExecutorUsagePrecisionSchema = z.enum(["reported", "estimated", "unavailable"]);

export const ExecutorCapabilitiesSchema = z.object({
  modes: z.array(ExecutorModeSchema),
  roles: z.array(ExecutorRoleSchema),
  structuredPlans: z.boolean(),
  proposalExport: z.boolean(),
  mediatedTools: z.boolean(),
  cancellation: z.boolean(),
  nativeResume: z.boolean(),
  usage: ExecutorUsagePrecisionSchema,
  thinkingDepths: z.array(z.enum(["off", "low", "medium", "high"])),
}).strict();

export const ExecutorTaskSchema = z.object({
  taskId: z.string().min(1),
  rootRunId: z.string().min(1),
  projectId: z.string().min(1),
  scope: AgentRunScopeSchema,
  mode: ExecutorModeSchema,
  role: ExecutorRoleSchema,
  objective: z.string().trim().min(1),
  acceptanceCriteria: z.array(z.string().trim().min(1)),
  contextBundleHash: z.string().min(1),
  allowedReadPaths: z.array(z.string()),
  allowedWritePaths: z.array(z.string()),
}).strict();

export const ExecutorUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  durationMs: z.number().int().nonnegative().optional(),
}).strict();

export const ExecutorEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task_started"), taskId: z.string(), timestamp: z.string() }).strict(),
  z.object({ type: z.literal("progress"), taskId: z.string(), message: z.string(), timestamp: z.string() }).strict(),
  z.object({ type: z.literal("decision_requested"), taskId: z.string(), decisionId: z.string(), question: z.string(), timestamp: z.string() }).strict(),
  z.object({ type: z.literal("proposal_ready"), taskId: z.string(), proposalId: z.string(), timestamp: z.string() }).strict(),
  z.object({ type: z.literal("usage"), taskId: z.string(), usage: ExecutorUsageSchema, timestamp: z.string() }).strict(),
  z.object({ type: z.literal("task_completed"), taskId: z.string(), timestamp: z.string() }).strict(),
  z.object({ type: z.literal("task_failed"), taskId: z.string(), reason: z.string(), timestamp: z.string() }).strict(),
]);

export const ExecutorProposalSchema = z.object({
  proposalId: z.string().min(1),
  taskId: z.string().min(1),
  diff: GeneratedDiffSchema,
}).strict();

export const ExecutorResultSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("completed"), taskId: z.string(), proposal: ExecutorProposalSchema.optional() }).strict(),
  z.object({ outcome: z.literal("waiting"), taskId: z.string(), decisionId: z.string() }).strict(),
  z.object({ outcome: z.literal("failed"), taskId: z.string(), reason: z.string() }).strict(),
]);

export type ExecutorMode = z.infer<typeof ExecutorModeSchema>;
export type ExecutorRole = z.infer<typeof ExecutorRoleSchema>;
export type ExecutorCapabilities = z.infer<typeof ExecutorCapabilitiesSchema>;
export type ExecutorTask = z.infer<typeof ExecutorTaskSchema>;
export type ExecutorUsage = z.infer<typeof ExecutorUsageSchema>;
export type ExecutorEvent = z.infer<typeof ExecutorEventSchema>;
export type ExecutorProposal = z.infer<typeof ExecutorProposalSchema>;
export type ExecutorResult = z.infer<typeof ExecutorResultSchema>;
