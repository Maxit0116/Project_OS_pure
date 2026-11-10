import { z } from "zod";

/** Structured DevPlan task consumed by Coder / downstream nodes. */
export const LoopDevPlanTaskSchema = z
  .object({
    id: z.string().min(1).max(80),
    title: z.string().trim().min(1).max(240),
    type: z.enum(["frontend", "backend", "database", "testing", "docs", "infra", "other"]),
    depends_on: z.array(z.string().min(1).max(80)).max(40).default([]),
    constraints: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
    writeScope: z.array(z.string().trim().min(1).max(500)).max(40).optional(),
  })
  .strict();

export const LoopDevPlanSchema = z
  .object({
    goal: z.string().trim().min(1).max(1000),
    tasks: z.array(LoopDevPlanTaskSchema).min(1).max(80),
    risks: z.array(z.string().trim().min(1).max(500)).max(30).optional(),
    expectedArtifacts: z.array(z.string().trim().min(1).max(240)).max(30).optional(),
  })
  .strict();

export const LoopChangeSetSchema = z
  .object({
    files: z.array(z.string().trim().min(1).max(500)).max(200),
    /**
     * Paths intentionally removed/renamed-away in this ChangeSet.
     * Expected absent at digest time (tombstones) — not unknown missing.
     */
    deletedFiles: z.array(z.string().trim().min(1).max(500)).max(200).optional(),
    summary: z.string().trim().min(1).max(2000),
    unfinished: z.array(z.string().trim().min(1).max(500)).max(40).optional(),
    problems: z.array(z.string().trim().min(1).max(500)).max(40).optional(),
    agentRunId: z.string().min(1).optional(),
    /** Combined digest of workspace file bytes at ChangeSet creation. */
    contentDigest: z.string().trim().min(1).max(128).optional(),
    /** Per-path digests (bounded) for dirty detection. */
    fileDigests: z.record(z.string(), z.string().trim().min(1).max(128)).optional(),
    /**
     * Optional unified diff excerpt for Run UI (bounded).
     * Presence ≠ full patch apply authority; display/evidence only.
     */
    unifiedDiff: z.string().max(20_000).optional(),
  })
  .strict();

export const LoopTestReportSchema = z
  .object({
    status: z.enum(["passed", "failed", "error", "not_run"]),
    total: z.number().int().nonnegative().optional(),
    passed: z.number().int().nonnegative().optional(),
    failed: z.number().int().nonnegative().optional(),
    failedTests: z.array(z.string().trim().min(1).max(500)).max(200).optional(),
    command: z.string().trim().min(1).max(500).optional(),
    evidenceId: z.string().min(1).optional(),
    /** Code digest this TestReport actually validated. */
    validatedCodeDigest: z.string().trim().min(1).max(128).optional(),
    /** Process exit code when the verification command was spawned. */
    exitCode: z.number().int().nullable().optional(),
  })
  .strict();

export const LoopReviewResultSchema = z
  .object({
    verdict: z.enum(["pass", "needs_changes", "blocked"]),
    issues: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            severity: z.enum(["info", "warning", "error", "critical"]),
            message: z.string().trim().min(1).max(1000),
            suggestedFix: z.string().trim().min(1).max(1000).optional(),
          })
          .strict(),
      )
      .max(100)
      .default([]),
    allowNext: z.boolean(),
    summary: z.string().trim().min(1).max(2000).optional(),
    /** Code digest this ReviewResult evaluated. */
    validatedCodeDigest: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export const LoopGitHubOpResultSchema = z
  .object({
    operation: z.string().trim().min(1).max(80),
    ok: z.boolean(),
    url: z.string().trim().url().optional(),
    number: z.number().int().positive().optional(),
    refs: z.record(z.string(), z.string()).optional(),
    message: z.string().trim().max(1000).optional(),
    /**
     * True when HTTP already succeeded but engineering baseline drifted
     * afterward — real side effect is retained; do not redo.
     */
    deliveryStale: z.boolean().optional(),
    /** Dispatch identity — required to reuse prior result (not nodeId alone). */
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
    operationDigest: z.string().trim().min(1).max(128).optional(),
    engineeringBaseline: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

/** Binds an approval to a run, concrete Action, artifacts, code, and params. */
export const LoopApprovalBindingSchema = z
  .object({
    instanceId: z.string().min(1),
    /** Action node this approval authorizes (not merely the Human gate). */
    nodeId: z.string().min(1),
    decisionNodeId: z.string().min(1).optional(),
    actionIntegration: z.string().trim().min(1).max(80).optional(),
    actionOperation: z.string().trim().min(1).max(80).optional(),
    artifactIds: z.array(z.string().min(1)).max(20),
    /** Combined engineering baseline (code + evidence stamps). */
    engineeringBaseline: z.string().trim().min(1).max(128),
    /** Workspace content digest bound at approve time. */
    codeDigest: z.string().trim().min(1).max(128).optional(),
    /** Hash of the approved Action payload / params (defaults included). */
    operationDigest: z.string().trim().min(1).max(128),
    /**
     * local_declared = UI/local actor string only; not external auth.
     * unspecified = no actor claimed.
     */
    actorKind: z.enum(["local_declared", "unspecified"]).optional(),
    status: z.enum(["valid", "invalidated"]).default("valid"),
    invalidatedReason: z.string().trim().max(500).optional(),
    invalidatedAt: z.string().min(1).optional(),
  })
  .strict();

export const LoopHumanDecisionSchema = z
  .object({
    mode: z.enum(["approval", "review", "input", "decision", "takeover", "gate"]),
    choice: z.string().trim().min(1).max(120),
    comment: z.string().trim().max(2000).optional(),
    /** When Approval Edit occurs, the payload the Action must execute. */
    editedPayload: z.record(z.string(), z.unknown()).optional(),
    at: z.string().min(1),
    actor: z.string().trim().min(1).max(120).optional(),
    nodeId: z.string().min(1).optional(),
    /** Delivery-gate binding; required for side-effect Actions after Batch-1. */
    binding: LoopApprovalBindingSchema.optional(),
  })
  .strict();

export const LoopArtifactKindSchema = z.enum([
  "dev_plan",
  "change_set",
  "test_report",
  "review_result",
  "github_op_result",
  "human_decision",
]);

export const LoopArtifactRefSchema = z
  .object({
    kind: LoopArtifactKindSchema,
    artifactId: z.string().min(1),
    nodeId: z.string().min(1).optional(),
  })
  .strict();

export type LoopDevPlanTask = z.infer<typeof LoopDevPlanTaskSchema>;
export type LoopDevPlan = z.infer<typeof LoopDevPlanSchema>;
export type LoopChangeSet = z.infer<typeof LoopChangeSetSchema>;
export type LoopTestReport = z.infer<typeof LoopTestReportSchema>;
export type LoopReviewResult = z.infer<typeof LoopReviewResultSchema>;
export type LoopGitHubOpResult = z.infer<typeof LoopGitHubOpResultSchema>;
export type LoopApprovalBinding = z.infer<typeof LoopApprovalBindingSchema>;
export type LoopHumanDecision = z.infer<typeof LoopHumanDecisionSchema>;
export type LoopArtifactKind = z.infer<typeof LoopArtifactKindSchema>;
export type LoopArtifactRef = z.infer<typeof LoopArtifactRefSchema>;
