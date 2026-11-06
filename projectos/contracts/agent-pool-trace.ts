import { z } from "zod";

import { AgentFlowStepKindSchema, AgentRunEventSchema } from "./events.js";

/** Timing honesty for projected bars — never claim exact when evidence is thin. */
export const TraceTimingQualitySchema = z.enum([
  "exact",
  "derived",
  "incomplete",
]);

export const TraceMajorActionStatusSchema = z.enum([
  "pending",
  "running",
  "complete",
  "failed",
  "skipped",
  "cancelled",
]);

export const TraceSpanKindSchema = z.enum([
  "model",
  "tool",
  "file",
  "apply",
  "verify",
  "wait",
  "handoff",
  "other",
]);

/**
 * Per-run KPI strip for expanded Agent Pool lanes.
 * Tokens are present only when every counted model_request reported usage.
 * costUsd is omitted in v1.1 — no reported cost field on events.
 */
export const AgentPoolRunKpiSchema = z
  .object({
    durationMs: z.number().finite().nonnegative(),
    modelCallCount: z.number().int().nonnegative(),
    toolCallCount: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
    tokensIn: z.number().int().nonnegative().optional(),
    tokensOut: z.number().int().nonnegative().optional(),
  })
  .strict();

export const TraceSpanStatusSchema = z.enum([
  "running",
  "ok",
  "error",
  "cancelled",
]);

export const TraceSpanViewSchema = z
  .object({
    spanId: z.string().min(1),
    agentRunId: z.string().min(1),
    actionId: z.string().min(1).optional(),
    parentSpanId: z.string().min(1).optional(),
    name: z.string().min(1),
    kind: TraceSpanKindSchema,
    status: TraceSpanStatusSchema,
    /** ms relative to poolOriginMs */
    startMs: z.number().finite().nonnegative(),
    endMs: z.number().finite().nonnegative().optional(),
    timingQuality: TraceTimingQualitySchema,
    attributes: z.record(z.unknown()).default({}),
    evidenceEventIds: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const TraceSubActionSchema = z
  .object({
    subActionId: z.string().min(1),
    name: z.string().min(1),
    status: TraceMajorActionStatusSchema,
    startMs: z.number().finite().nonnegative(),
    endMs: z.number().finite().nonnegative().optional(),
    timingQuality: TraceTimingQualitySchema,
    spanIds: z.array(z.string().min(1)).default([]),
    /** Always true in v1.0 — Sub Actions are computed groupings. */
    derived: z.literal(true),
  })
  .strict();

export const TraceMajorActionSchema = z
  .object({
    actionId: z.string().min(1),
    agentRunId: z.string().min(1),
    name: z.string().min(1),
    kind: z.union([AgentFlowStepKindSchema, z.literal("custom")]),
    status: TraceMajorActionStatusSchema,
    startMs: z.number().finite().nonnegative(),
    endMs: z.number().finite().nonnegative().optional(),
    timingQuality: TraceTimingQualitySchema,
    stepId: z.string().min(1).optional(),
    attempt: z.number().int().positive().optional(),
    subActions: z.array(TraceSubActionSchema).default([]),
  })
  .strict();

export const AgentPoolRunStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
  "cancelled",
  "partial",
]);

export const AgentPoolTriggerSourceSchema = z.enum([
  "chat",
  "loop",
  "compose",
  "harness",
  "mixed",
  "unknown",
]);

export const AgentPoolRunSchema = z
  .object({
    poolRunId: z.string().min(1),
    projectId: z.string().min(1).optional(),
    status: AgentPoolRunStatusSchema,
    createdAt: z.string().min(1),
    startedAt: z.string().min(1),
    endedAt: z.string().min(1).optional(),
    agentRunIds: z.array(z.string().min(1)).default([]),
    rootRunId: z.string().min(1).nullable().optional(),
    sessionId: z.string().min(1).nullable().optional(),
    loopInstanceId: z.string().min(1).nullable().optional(),
    loopSpecId: z.string().min(1).nullable().optional(),
    triggerSource: AgentPoolTriggerSourceSchema.default("unknown"),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const AgentDefinitionKindSchema = z.enum(["workforce", "pool_lane"]);

/** Lightweight provenance for catalog / export installs (Capability Marketplace P2). */
export const AgentMarketplaceProvenanceSchema = z
  .object({
    listingId: z.string().min(1).max(120),
    catalogVersion: z.string().min(1).max(32),
    trustTier: z.enum(["curated", "community"]),
    listingVersion: z.string().min(1).max(64),
    installedAt: z.string().min(1).max(64),
    source: z
      .enum(["catalog", "manual", "git-url", "export-reimport"])
      .default("catalog"),
  })
  .strict();

export const AgentDefinitionConfigSchema = z
  .object({
    displayName: z.string().min(1).max(120),
    /** Observability lane vs user-authored specialized agent. Default pool_lane for back-compat. */
    kind: AgentDefinitionKindSchema.default("pool_lane"),
    role: z.string().min(1).max(80).optional(),
    /** Human-facing role label (e.g. QA Reviewer). */
    roleLabel: z.string().min(1).max(80).optional(),
    /** System instructions for workforce agents. */
    instructions: z.string().max(12_000).optional(),
    modelProfileId: z.string().nullable().optional(),
    skillIds: z.array(z.string().min(1).max(120)).max(64).default([]),
    mcpServerIds: z.array(z.string().min(1).max(80)).max(64).default([]),
    /** Free-text permission intent; enforcement deferred. */
    permissionNotes: z.string().max(2000).optional(),
    composeSlotId: z.string().nullable().optional(),
    loopNodeId: z.string().nullable().optional(),
    /** Present when installed from Capability Marketplace agent catalog / export pack. */
    marketplaceProvenance: AgentMarketplaceProvenanceSchema.optional(),
  })
  .strict();

export const AgentDefinitionSchema = z
  .object({
    definitionId: z.string().min(1),
    projectId: z.string().min(1).optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    config: AgentDefinitionConfigSchema,
  })
  .strict();

export const AgentRunAcceptanceSchema = z.enum([
  "accepted",
  "rejected",
  "pending",
  "none",
]);

export const AgentRunIndexEntrySchema = z
  .object({
    runId: z.string().min(1),
    definitionId: z.string().min(1),
    poolRunId: z.string().min(1),
    rootRunId: z.string().min(1).nullable().optional(),
    parentRunId: z.string().min(1).nullable().optional(),
    sessionId: z.string().min(1).nullable().optional(),
    loopInstanceId: z.string().min(1).nullable().optional(),
    status: z.string().min(1),
    attempt: z.number().int().positive().default(1),
    startedAt: z.string().min(1),
    endedAt: z.string().min(1).optional(),
    acceptance: AgentRunAcceptanceSchema.default("none"),
    title: z.string().min(1),
  })
  .strict();

export const AgentRunEventSnapshotSchema = z
  .object({
    runId: z.string().min(1),
    events: z.array(AgentRunEventSchema),
    /** Last runSequence in the snapshot; null when legacy events lack sequence. */
    watermark: z.number().int().positive().nullable(),
    watermarkEventId: z.string().min(1).nullable(),
  })
  .strict();

export const EnsureAgentPoolRunRequestSchema = z
  .object({
    rootRunId: z.string().min(1).nullable().optional(),
    sessionId: z.string().min(1).nullable().optional(),
    loopInstanceId: z.string().min(1).nullable().optional(),
    loopSpecId: z.string().min(1).nullable().optional(),
    triggerSource: AgentPoolTriggerSourceSchema.optional(),
    existingPoolRunId: z.string().min(1).nullable().optional(),
    definitionId: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
  })
  .strict();

export const ListAgentRunsByDefinitionRequestSchema = z
  .object({
    definitionId: z.string().min(1),
    limit: z.number().int().positive().max(200).optional(),
    offset: z.number().int().nonnegative().optional(),
  })
  .strict();

export const SetAgentRunAcceptanceRequestSchema = z
  .object({
    runId: z.string().min(1),
    acceptance: AgentRunAcceptanceSchema,
  })
  .strict();

export type TraceTimingQuality = z.infer<typeof TraceTimingQualitySchema>;
export type TraceMajorActionStatus = z.infer<typeof TraceMajorActionStatusSchema>;
export type TraceSpanKind = z.infer<typeof TraceSpanKindSchema>;
export type TraceSpanStatus = z.infer<typeof TraceSpanStatusSchema>;
export type TraceSpanView = z.infer<typeof TraceSpanViewSchema>;
export type TraceSubAction = z.infer<typeof TraceSubActionSchema>;
export type TraceMajorAction = z.infer<typeof TraceMajorActionSchema>;
export type AgentPoolRunKpi = z.infer<typeof AgentPoolRunKpiSchema>;
export type AgentPoolRun = z.infer<typeof AgentPoolRunSchema>;
export type AgentPoolRunStatus = z.infer<typeof AgentPoolRunStatusSchema>;
export type AgentPoolTriggerSource = z.infer<typeof AgentPoolTriggerSourceSchema>;
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;
export type AgentDefinitionKind = z.infer<typeof AgentDefinitionKindSchema>;
export type AgentDefinitionConfig = z.infer<typeof AgentDefinitionConfigSchema>;
export type AgentRunAcceptance = z.infer<typeof AgentRunAcceptanceSchema>;
export type AgentRunIndexEntry = z.infer<typeof AgentRunIndexEntrySchema>;
export type AgentRunEventSnapshot = z.infer<typeof AgentRunEventSnapshotSchema>;
export type EnsureAgentPoolRunRequest = z.infer<typeof EnsureAgentPoolRunRequestSchema>;
export type ListAgentRunsByDefinitionRequest = z.infer<
  typeof ListAgentRunsByDefinitionRequestSchema
>;
export type SetAgentRunAcceptanceRequest = z.infer<
  typeof SetAgentRunAcceptanceRequestSchema
>;
