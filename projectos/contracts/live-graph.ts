import { z } from "zod";

/**
 * Live Graph execution overlay (Phase 1).
 * Architecture graph stays separate; this only describes Agent activity on resources.
 */

export const LiveNodeActivityKindSchema = z.enum([
  "reading",
  "editing",
  "creating",
  "running_tests",
  "waiting",
  "needs_approval",
  "completed",
  "failed",
]);

export const LiveNodeActivityStatusSchema = z.enum([
  "running",
  "complete",
  "error",
]);

export const LiveNodeActivitySchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    taskId: z.string().min(1).optional(),
    agentId: z.string().min(1).optional(),
    kind: LiveNodeActivityKindSchema,
    status: LiveNodeActivityStatusSchema,
    /** Workspace-relative path when the activity targets a file. */
    path: z.string().min(1).optional(),
    /** C4 / function-map node ids resolved via fileIndex. Empty ⇒ unmapped. */
    nodeIds: z.array(z.string().min(1)),
    /** Short UI label (filename or command); not a full reasoning dump. */
    label: z.string().min(1),
    startedAt: z.string().min(1),
    completedAt: z.string().min(1).optional(),
    sourceEventIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

/** Compact per-node projection for canvas badges (not persisted separately). */
export const LiveNodeSummarySchema = z
  .object({
    nodeId: z.string().min(1),
    /** Highest-priority running activity, else latest terminal activity. */
    primaryKind: LiveNodeActivityKindSchema,
    primaryStatus: LiveNodeActivityStatusSchema,
    activeCount: z.number().int().nonnegative(),
    totalCount: z.number().int().positive(),
    label: z.string().min(1),
    /** Distinct agent labels on this node (e.g. A1, A2) — text, not color-only. */
    agentLabels: z.array(z.string().min(1)).default([]),
  })
  .strict();

/**
 * Execution edges are derived from activities (not architecture edges).
 * `impact` edges are inferred and must be labeled as such in the UI.
 * `delegation` edges come from task_delegated / parent-child run links.
 */
export const LiveExecutionEdgeKindSchema = z.enum([
  "read_context",
  "edit_create",
  "impact",
  "delegation",
]);

export const LiveExecutionEdgeSchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    taskId: z.string().min(1).optional(),
    kind: LiveExecutionEdgeKindSchema,
    sourceNodeId: z.string().min(1),
    targetNodeId: z.string().min(1),
    /** Activity ids that justify this edge (empty only for pure impact inference). */
    sourceActivityIds: z.array(z.string().min(1)),
    label: z.string().min(1),
    /** True when the edge is inferred impact, not a recorded read/edit. */
    inferred: z.boolean(),
  })
  .strict();

/** Parent → child run link recorded from task_delegated (not architecture). */
export const LiveDelegationLinkSchema = z
  .object({
    id: z.string().min(1),
    parentRunId: z.string().min(1),
    childRunId: z.string().min(1),
    taskId: z.string().min(1).optional(),
    sourceNodeId: z.string().min(1).optional(),
    targetNodeId: z.string().min(1).optional(),
    sourceActivityIds: z.array(z.string().min(1)),
  })
  .strict();

/**
 * Verification narrative for Inspector (honest event fields only — not COT).
 * Prefer full VerificationEvidence from verificationResult when present.
 */
export const LiveVerificationNarrativeSchema = z
  .object({
    runId: z.string().min(1),
    status: z.enum(["passed", "failed", "not_run"]),
    reason: z
      .enum([
        "commands_passed",
        "command_failed",
        "not_configured",
        "approval_required",
        "policy_denied",
        "timed_out",
        "output_truncated",
        "unexpected_paths",
      ])
      .optional(),
    evidenceId: z.string().min(1).optional(),
    summary: z.string().max(400).optional(),
    command: z.string().min(1).optional(),
  })
  .strict();

export const ExecutionOverlaySchema = z
  .object({
    /** Root / session run id (first run that opened this overlay). */
    runId: z.string().min(1),
    /** Root + child run ids contributing activities. */
    runIds: z.array(z.string().min(1)).min(1),
    /** childRunId → parentRunId */
    childRunParentById: z.record(z.string().min(1), z.string().min(1)),
    /** runId → stable badge label (A1, A2, …) */
    agentLabelByRunId: z.record(z.string().min(1), z.string().min(1)),
    /** Recorded parent→child delegation links for execution edges. */
    delegationLinks: z.array(LiveDelegationLinkSchema),
    /** Latest verification_result projection (not model reasoning). */
    verificationNarrative: LiveVerificationNarrativeSchema.optional(),
    updatedAt: z.string().min(1),
    activitiesById: z.record(z.string().min(1), LiveNodeActivitySchema),
    /** nodeId → activity ids (may include completed). */
    activityIdsByNodeId: z.record(z.string().min(1), z.array(z.string().min(1))),
    /** Activities with no C4 node mapping — must remain visible. */
    unmappedActivityIds: z.array(z.string().min(1)),
    seenEventIds: z.array(z.string().min(1)),
  })
  .strict();

export type LiveNodeActivityKind = z.infer<typeof LiveNodeActivityKindSchema>;
export type LiveNodeActivityStatus = z.infer<typeof LiveNodeActivityStatusSchema>;
export type LiveNodeActivity = z.infer<typeof LiveNodeActivitySchema>;
export type LiveNodeSummary = z.infer<typeof LiveNodeSummarySchema>;
export type LiveExecutionEdgeKind = z.infer<typeof LiveExecutionEdgeKindSchema>;
export type LiveExecutionEdge = z.infer<typeof LiveExecutionEdgeSchema>;
export type LiveDelegationLink = z.infer<typeof LiveDelegationLinkSchema>;
export type LiveVerificationNarrative = z.infer<typeof LiveVerificationNarrativeSchema>;
export type ExecutionOverlay = z.infer<typeof ExecutionOverlaySchema>;
