import { z } from "zod";

import {
  isConditionNode,
  isConfigNode,
  isLoopLogicNode,
  isMergeNode,
  LOOP_ACTION_INTEGRATIONS,
  withArchitectureDefaults,
  type LoopActionIntegration,
  type LoopAgentRole,
  type LoopHumanMode,
  type LoopLogicKind,
  type LoopNodeType,
} from "./loop-node-architecture.js";
import { LoopTaskMaterialSchema } from "./loop-task-materials.js";

export {
  LOOP_ACTION_INTEGRATIONS,
  LOOP_AGENT_CONFIG_PORTS,
  LOOP_AGENT_ROLES,
  LOOP_CAPABILITY_INDEGREE_MAX,
  LOOP_GITHUB_OPERATIONS,
  LOOP_HUMAN_MODES,
  LOOP_INTENT_NODE_TYPES,
  LOOP_LOGIC_KINDS,
  LOOP_MEMORY_MODES,
  LOOP_NODE_TYPES,
  LOOP_SATELLITE_KINDS,
  architectureFromLegacyRole,
  configPortForSatelliteKind,
  isConditionNode,
  isConfigNode,
  isDutyNode,
  isLoopLogicNode,
  isMergeNode,
  legacyRoleFromArchitecture,
  resolveNodeArchitecture,
  withArchitectureDefaults,
  type LegacyIntentNodeRole,
  type LoopActionIntegration,
  type LoopAgentConfigPort,
  type LoopAgentRole,
  type LoopArchitectureMapping,
  type LoopGitHubOperation,
  type LoopHumanMode,
  type LoopIntentNodeType,
  type LoopLogicKind,
  type LoopMemoryMode,
  type LoopNodeArchitectureFields,
  type LoopNodeType,
  type LoopSatelliteKind,
} from "./loop-node-architecture.js";

export const LOOP_GRAPH_VERSION = "0.1.0" as const;

export const LoopGraphVersionSchema = z.literal(LOOP_GRAPH_VERSION);

export const IntentNodeRoleSchema = z.enum([
  "implement",
  "verify",
  "fix",
  "decide",
  "unknown",
]);

export const LoopNodeTypeSchema = z.enum(["agent", "action", "logic", "human"]);

/** Intent canvas types include Agent wiring satellites (`config`). */
export const IntentGraphNodeTypeSchema = z.enum([
  "agent",
  "action",
  "logic",
  "human",
  "config",
]);

export const LoopAgentRoleSchema = z.enum([
  "planner",
  "coder",
  "reviewer",
  "researcher",
  "tester",
  "debugger",
  "architect",
  "documenter",
]);

export const LoopHumanModeSchema = z.enum([
  "approval",
  "review",
  "input",
  "decision",
  "takeover",
]);

export const LoopActionIntegrationSchema = z.enum(LOOP_ACTION_INTEGRATIONS);

export const LoopLogicKindSchema = z.enum([
  "condition",
  "loop",
  "merge",
  "exit",
  "retry",
  "wait",
]);

export const LoopSatelliteKindSchema = z.enum([
  "model",
  "memory",
  "skill",
  "mcp",
  "rules",
  "pack",
]);

export const LoopAgentConfigPortSchema = z.enum(["model", "memory", "capability"]);

export const LoopMemoryModeSchema = z.enum(["project", "buffer", "none"]);

export const LoopConfigRefSchema = z
  .object({
    modelProfileId: z.string().min(1).max(120).optional(),
    skillId: z.string().min(1).max(120).optional(),
    mcpServerId: z.string().min(1).max(80).optional(),
    memoryMode: LoopMemoryModeSchema.optional(),
    packId: z.string().min(1).max(120).optional(),
    rulesId: z.string().min(1).max(120).optional(),
  })
  .strict();

export const AgentWiringOverrideSchema = z
  .object({
    modelProfileId: z.string().min(1).max(120).nullable().optional(),
    skillIds: z.array(z.string().min(1).max(120)).max(64).optional(),
    mcpServerIds: z.array(z.string().min(1).max(80)).max(64).optional(),
    memoryMode: LoopMemoryModeSchema.optional(),
  })
  .strict();

export const IntentEdgeKindSchema = z.enum([
  "depends",
  "feedback",
  "conditional",
  "fallback",
  "provides",
]);

/** Max feedback edges per Spec (aligned with cycleGates.max). */
export const LOOP_FEEDBACK_EDGE_MAX = 5;

export const IntentEdgePortSchema = z.enum(["n", "e", "s", "w"]);

/** Shared optional architecture fields for Intent + Spec nodes. */
export const LoopNodeArchitectureFieldsSchema = z
  .object({
    type: LoopNodeTypeSchema.optional(),
    agentRole: LoopAgentRoleSchema.optional(),
    humanMode: LoopHumanModeSchema.optional(),
    actionIntegration: LoopActionIntegrationSchema.optional(),
    actionOperation: z.string().trim().min(1).max(80).optional(),
    logicKind: LoopLogicKindSchema.optional(),
    maxIterations: z.number().int().positive().max(50).optional(),
    repairMode: z.boolean().optional(),
  })
  .strict();

export const AcceptanceKindSchema = z.enum(["machine", "human"]);

export const LoopInstanceStatusSchema = z.enum([
  "queued",
  "running",
  "paused",
  "awaiting_hitl",
  "awaiting_review",
  "blocked",
  "cancelled",
  "complete",
  "error",
]);

export const LoopNodeRecordStatusSchema = z.enum([
  "pending",
  "ready",
  "running",
  "waiting",
  "waiting_approval",
  "blocked",
  "verifying",
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
]);

export const LoopDocumentStatusSchema = z.enum([
  "draft",
  "compiled",
  "approved",
  "running",
  "paused",
  "complete",
  "error",
]);

export const IntentGraphPositionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

export const IntentGraphNodeActionParamsSchema = z
  .record(
    z.string().min(1).max(80),
    z.union([z.string().max(2000), z.number().finite(), z.boolean()]),
  )
  .refine((value) => Object.keys(value).length <= 32, {
    message: "actionParams supports at most 32 keys",
  });

export const IntentGraphNodeSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(120),
    prompt: z.string().trim().max(4000),
    role: IntentNodeRoleSchema.optional(),
    type: IntentGraphNodeTypeSchema.optional(),
    agentRole: LoopAgentRoleSchema.optional(),
    /** Workforce agent binding; null/omit = General Agent. */
    agentDefinitionId: z.string().min(1).nullable().optional(),
    humanMode: LoopHumanModeSchema.optional(),
    actionIntegration: LoopActionIntegrationSchema.optional(),
    actionOperation: z.string().trim().min(1).max(80).optional(),
    logicKind: LoopLogicKindSchema.optional(),
    maxIterations: z.number().int().positive().max(50).optional(),
    repairMode: z.boolean().optional(),
    /** Credential reference id — secret material never stored on the node. */
    credentialRefId: z.string().trim().min(1).max(120).optional(),
    /** Per-node timeout (ms) for applicable Action/Logic waits. */
    timeoutMs: z.number().int().positive().max(600_000).optional(),
    /** Logic retry limit when logicKind === "retry". */
    retryLimit: z.number().int().positive().max(20).optional(),
    /** Logic wait duration when logicKind === "wait". */
    waitMs: z.number().int().nonnegative().max(3_600_000).optional(),
    /** Human assignee / approver label (not auth proof). */
    humanAssignee: z.string().trim().min(1).max(120).optional(),
    /** Allowed human operations for approval/decision nodes. */
    humanAllowedActions: z
      .array(z.string().trim().min(1).max(80))
      .max(12)
      .optional(),
    /** Typed Action parameters (shared manual + AI schema). */
    actionParams: IntentGraphNodeActionParamsSchema.optional(),
    /** Present when `type === "config"` (Agent wiring satellite). */
    satelliteKind: LoopSatelliteKindSchema.optional(),
    /** Asset pointer for a config satellite. */
    configRef: LoopConfigRefSchema.optional(),
    /**
     * Node-local wiring patch (Q2 default). Takes priority over provides edges
     * and Definition when resolving runtime inject; never silently written back.
     */
    agentWiringOverride: AgentWiringOverrideSchema.optional(),
    position: IntentGraphPositionSchema,
    authoringSessionId: z.string().min(1).optional(),
  })
  .strict();

export const IntentGraphEdgeSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
    prompt: z.string().trim().max(2000).optional(),
    kind: IntentEdgeKindSchema.optional(),
    /** Named branch for conditional edges (e.g. true / false / pass). */
    branchKey: z.string().trim().min(1).max(80).optional(),
    sourcePort: IntentEdgePortSchema.optional(),
    targetPort: IntentEdgePortSchema.optional(),
    /**
     * Agent config port for `provides` edges (Model* / Memory / Capability).
     * Independent of cardinal `targetPort` used for bezier routing.
     */
    configPort: LoopAgentConfigPortSchema.optional(),
    authoringSessionId: z.string().min(1).optional(),
  })
  .strict();

export const IntentGraphSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    graphPrompt: z.string().trim().max(4000),
    nodes: z.array(IntentGraphNodeSchema),
    edges: z.array(IntentGraphEdgeSchema),
  })
  .strict();

export const LoopAcceptanceItemSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().trim().min(1).max(500),
    kind: AcceptanceKindSchema,
  })
  .strict();

export const LoopSpecNodeSchema = z
  .object({
    id: z.string().min(1),
    role: IntentNodeRoleSchema,
    type: LoopNodeTypeSchema.optional(),
    agentRole: LoopAgentRoleSchema.optional(),
    agentDefinitionId: z.string().min(1).nullable().optional(),
    humanMode: LoopHumanModeSchema.optional(),
    actionIntegration: LoopActionIntegrationSchema.optional(),
    actionOperation: z.string().trim().min(1).max(80).optional(),
    logicKind: LoopLogicKindSchema.optional(),
    maxIterations: z.number().int().positive().max(50).optional(),
    repairMode: z.boolean().optional(),
    /** Folded Agent wiring from Intent `provides` + override (no config nodes in Spec). */
    resolvedWiring: AgentWiringOverrideSchema.optional(),
    goal: z.string().trim().min(1).max(1000),
    constraints: z.array(z.string().trim().min(1).max(500)).max(20),
    inputs: z.array(z.string().trim().min(1).max(240)).max(20),
    outputs: z.array(z.string().trim().min(1).max(240)).max(20),
    acceptance: z.array(LoopAcceptanceItemSchema).max(20),
  })
  .strict();

export const LoopSpecEdgeSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    /** Spec topology never includes `provides` (folded at compile). */
    kind: z.enum(["depends", "feedback", "conditional", "fallback"]),
    when: z.string().trim().max(500).optional(),
    branchKey: z.string().trim().min(1).max(80).optional(),
    carry: z.array(z.string().trim().min(1).max(240)).max(10).optional(),
  })
  .strict();

export const LoopRetryPolicySchema = z
  .object({
    onFailure: z.enum(["retry", "replan", "pause_hitl", "fallback"]),
    maxAutoRetries: z.number().int().nonnegative().max(20),
  })
  .strict();

export const LoopStopPolicySchema = z
  .object({
    maxRounds: z.number().int().positive().max(50),
    maxBudgetTokens: z.number().int().positive().max(2_000_000).optional(),
    maxWallClockMs: z.number().int().positive().max(86_400_000).optional(),
  })
  .strict();

export const LoopPermissionSchema = z
  .object({
    id: z.string().min(1),
    action: z.string().trim().min(1).max(120),
    scope: z.string().trim().min(1).max(500),
    requiresApproval: z.boolean(),
  })
  .strict();

export const LoopOpenQuestionSchema = z
  .object({
    id: z.string().min(1),
    question: z.string().trim().min(1).max(500),
    options: z.array(z.string().trim().min(1).max(240)).max(6).optional(),
    answer: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export const LoopAssumptionSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().trim().min(1).max(500),
    accepted: z.boolean().optional(),
  })
  .strict();

export const LoopCycleGateSchema = z
  .object({
    edgeId: z.string().min(1),
    isFeedback: z.boolean(),
    triggerWhen: z.string().trim().min(1).max(500),
    retain: z.array(z.string().trim().min(1).max(240)).max(10),
    maxRounds: z.number().int().positive().max(50),
    onContinuousFailure: z.enum(["continue_fix", "pause_hitl"]),
    confirmed: z.boolean().optional(),
  })
  .strict();

export const LoopInputParamSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    type: z.enum(["string", "number", "boolean"]),
    required: z.boolean().optional(),
    description: z.string().trim().max(500).optional(),
    defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })
  .strict();

export const LoopParallelModeSchema = z.enum(["serial_drain", "multi_run"]);

export const LoopStalePolicySchema = z.enum(["warn", "pause_hitl"]);

export const LoopSpecSchema = z
  .object({
    version: z.string().min(1),
    graphRevision: z.number().int().nonnegative(),
    goal: z.string().trim().min(1).max(1000),
    nodes: z.array(LoopSpecNodeSchema).min(1),
    edges: z.array(LoopSpecEdgeSchema),
    acceptance: z.array(LoopAcceptanceItemSchema).max(30),
    retryPolicy: LoopRetryPolicySchema,
    stopPolicy: LoopStopPolicySchema,
    permissions: z.array(LoopPermissionSchema).max(40),
    openQuestions: z.array(LoopOpenQuestionSchema).max(20),
    assumptions: z.array(LoopAssumptionSchema).max(30).optional(),
    cycleGates: z.array(LoopCycleGateSchema).max(5).optional(),
    /** GC-5.1: declared launch parameters. */
    inputParams: z.array(LoopInputParamSchema).max(32).optional(),
    /** GC-7: Parallel scheduling mode (default serial_drain). */
    parallelMode: LoopParallelModeSchema.optional(),
    /** GC-4.2: how to react when context freshness is stale. */
    stalePolicy: LoopStalePolicySchema.optional(),
    createdAt: z.string().min(1),
  })
  .strict();

/** Matches `LoopInstanceSchema.events` max. */
export const LOOP_INSTANCE_EVENT_LIMIT = 500;

export const LoopInstanceEventSchema = z
  .object({
    id: z.string().min(1),
    at: z.string().min(1),
    type: z.enum([
      "started",
      "node_entered",
      "node_completed",
      "node_failed",
      "feedback_taken",
      "fallback_taken",
      "paused",
      "resumed",
      "cancelled",
      "awaiting_hitl",
      "hitl_resolved",
      "completed",
      "errored",
      "message",
      "checkpoint_saved",
      "freshness_stale",
      "budget_exceeded",
      "approval_stale",
      /** HTTP side effect kept; post-dispatch evidence drifted. */
      "delivery_stale",
    ]),
    nodeId: z.string().min(1).optional(),
    message: z.string().trim().max(2000).optional(),
    agentRunId: z.string().min(1).optional(),
    evidenceId: z.string().min(1).optional(),
  })
  .strict();

export const LoopInstanceArtifactSchema = z
  .object({
    id: z.string().min(1),
    nodeId: z.string().min(1),
    kind: z.enum([
      "dev_plan",
      "change_set",
      "test_report",
      "review_result",
      "github_op_result",
      "human_decision",
    ]),
    createdAt: z.string().min(1),
    data: z.unknown(),
  })
  .strict();

export const LoopNodeRecordSchema = z
  .object({
    nodeId: z.string().min(1),
    status: LoopNodeRecordStatusSchema,
    updatedAt: z.string().min(1),
    agentRunId: z.string().min(1).optional(),
    evidenceId: z.string().min(1).optional(),
    artifactIds: z.array(z.string().min(1)).max(20).optional(),
    errorMessage: z.string().trim().max(1000).optional(),
    attempt: z.number().int().nonnegative().optional(),
  })
  .strict();

export const LoopInstanceCheckpointSchema = z
  .object({
    savedAt: z.string().min(1),
    cursorNodeId: z.string().min(1).nullable(),
    status: LoopInstanceStatusSchema,
    round: z.number().int().nonnegative(),
    attemptCounts: z.record(z.string(), z.number().int().nonnegative()),
    loopIterations: z
      .record(z.string(), z.number().int().nonnegative())
      .optional(),
    nodeRecords: z.array(LoopNodeRecordSchema).max(200).optional(),
    activeRunId: z.string().min(1).optional(),
    activeRunNodeId: z.string().min(1).optional(),
    activeRunIds: z.array(z.string().min(1)).max(16).optional(),
    hitlQuestionIds: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const LoopFreshnessSchema = z
  .object({
    status: z.enum(["fresh", "stale", "unknown"]),
    baselineId: z.string().min(1).optional(),
    pathFingerprint: z.string().min(1).max(128).optional(),
    checkedAt: z.string().min(1).optional(),
  })
  .strict();

export const LoopBudgetUsageSchema = z
  .object({
    tokens: z.number().int().nonnegative().optional(),
    wallClockMs: z.number().int().nonnegative().optional(),
    retries: z.number().int().nonnegative().optional(),
    /** Agent↔agent / loop-started AgentRun count (互调预算). */
    agentCalls: z.number().int().nonnegative().optional(),
    /** Nested agent call depth for the active chain. */
    agentCallDepth: z.number().int().nonnegative().optional(),
  })
  .strict();

export const LoopLaunchSchema = z
  .object({
    kind: z.enum(["manual", "params", "event"]),
    params: z.record(z.string(), z.unknown()).optional(),
    eventId: z.string().min(1).max(160).optional(),
    eventType: z.string().trim().min(1).max(120).optional(),
    idempotencyKey: z.string().trim().min(1).max(160).optional(),
  })
  .strict();

export const LoopReplanProposalSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    fromSpecVersion: z.string().min(1),
    reusedNodeIds: z.array(z.string().min(1)).max(100),
    addedNodeIds: z.array(z.string().min(1)).max(100),
    removedNodeIds: z.array(z.string().min(1)).max(100),
    permissionDelta: z.array(z.string().trim().min(1).max(240)).max(40),
    riskNotes: z.array(z.string().trim().min(1).max(500)).max(20),
  })
  .strict();

export const LoopInstanceSchema = z
  .object({
    id: z.string().min(1),
    specVersion: z.string().min(1),
    status: LoopInstanceStatusSchema,
    cursorNodeId: z.string().min(1).nullable(),
    round: z.number().int().nonnegative(),
    attemptCounts: z.record(z.string(), z.number().int().nonnegative()),
    /** Logic Loop node iteration counters (separate from feedback round). */
    loopIterations: z
      .record(z.string(), z.number().int().nonnegative())
      .optional(),
    hitlQuestionIds: z.array(z.string().min(1)).optional(),
    /** Functional-graph node that owns the leaf file. Loop copy cannot set this. */
    featureNodeId: z.string().min(1).optional(),
    /** Run attached to the current implement or fix node. */
    activeRunId: z.string().min(1).optional(),
    activeRunNodeId: z.string().min(1).optional(),
    /** P1 Parallel: multiple in-flight runs (optional; P0 uses activeRunId only). */
    activeRunIds: z.array(z.string().min(1)).max(16).optional(),
    /** Explicit per-node execution projection (GC-2.1). */
    nodeRecords: z.array(LoopNodeRecordSchema).max(200).optional(),
    /** Artifacts produced by completed nodes (DevPlan, TestReport, …). */
    artifacts: z.array(LoopInstanceArtifactSchema).max(100).optional(),
    /** Payload approved/edited by Human Approval for the next Action. */
    pendingActionPayload: z.record(z.string(), z.unknown()).optional(),
    /**
     * Live approval gate binding for the next side-effect Action.
     * Cleared or invalidated when engineering artifacts / payload change.
     */
    pendingApprovalBinding: z
      .object({
        decisionArtifactId: z.string().min(1),
        instanceId: z.string().min(1),
        nodeId: z.string().min(1),
        decisionNodeId: z.string().min(1).optional(),
        actionIntegration: z.string().trim().min(1).max(80).optional(),
        actionOperation: z.string().trim().min(1).max(80).optional(),
        artifactIds: z.array(z.string().min(1)).max(20),
        engineeringBaseline: z.string().trim().min(1).max(128),
        codeDigest: z.string().trim().min(1).max(128).optional(),
        operationDigest: z.string().trim().min(1).max(128),
        actor: z.string().trim().min(1).max(120).optional(),
        actorKind: z.enum(["local_declared", "unspecified"]).optional(),
        approvedAt: z.string().min(1),
      })
      .strict()
      .optional(),
    /**
     * SaaS connector Action queued for async settle (Slack/Feishu/Lark/Sentry/…).
     * Settled via loop-connectors settleConnectorOperation — never auto-executes
     * without LocalApi/transport DI.
     */
    pendingConnectorOp: z
      .object({
        nodeId: z.string().min(1),
        vendorId: z.string().trim().min(1).max(40),
        capabilityId: z.string().trim().min(1).max(80),
        payload: z.record(z.string(), z.unknown()),
        credentialRefId: z.string().trim().min(1).max(120),
        idempotencyKey: z.string().trim().min(1).max(160),
        queuedAt: z.string().min(1),
        dispatchState: z
          .enum(["queued", "preparing", "http_started", "in_flight"])
          .optional(),
      })
      .strict()
      .optional(),
    /** GitHub Action queued for async settle (REST create_pr, etc.). */
    pendingGithubOp: z
      .object({
        nodeId: z.string().min(1),
        operation: z.string().trim().min(1).max(80),
        payload: z.record(z.string(), z.unknown()),
        queuedAt: z.string().min(1),
        /**
         * queued = not sent;
         * preparing = token/import window (no remote side effect yet — may clear);
         * http_started = transport/push claimed (unknown until settled — must not clear);
         * in_flight = legacy alias of http_started (treated as side-effect unknown).
         */
        dispatchState: z
          .enum(["queued", "preparing", "http_started", "in_flight"])
          .optional(),
        /** Stable key for query-before-resend (instance+node+op+payload digest). */
        idempotencyKey: z.string().trim().min(1).max(160).optional(),
        dispatchAttemptId: z.string().min(1).optional(),
        httpAttemptedAt: z.string().min(1).optional(),
        /**
         * Durable journal for http_started/unknown outcomes — must not be erased by
         * deny-before-HTTP so a later approve cannot create a second side effect.
         */
        dispatchJournal: z
          .array(
            z
              .object({
                at: z.string().min(1),
                kind: z.enum([
                  "queued",
                  "preparing",
                  "http_started",
                  "in_flight",
                  "unknown",
                  "lookup_hit",
                  "completed",
                  "denied_preflight",
                  "orphaned_result",
                ]),
                message: z.string().trim().max(500),
              })
              .strict(),
          )
          .max(20)
          .optional(),
        /** Snapshot for TOCTOU re-check at HTTP dispatch boundary (preflight). */
        approvalBinding: z
          .object({
            decisionArtifactId: z.string().min(1),
            instanceId: z.string().min(1),
            nodeId: z.string().min(1),
            decisionNodeId: z.string().min(1).optional(),
            actionIntegration: z.string().trim().min(1).max(80).optional(),
            actionOperation: z.string().trim().min(1).max(80).optional(),
            artifactIds: z.array(z.string().min(1)).max(20),
            engineeringBaseline: z.string().trim().min(1).max(128),
            codeDigest: z.string().trim().min(1).max(128).optional(),
            operationDigest: z.string().trim().min(1).max(128),
            actor: z.string().trim().min(1).max(120).optional(),
            actorKind: z.enum(["local_declared", "unspecified"]).optional(),
            approvedAt: z.string().min(1),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    /**
     * Project/run binding snapshot for project-workflow starts.
     * Editing Intent/Spec must not rewrite this after the run is created.
     */
    runBinding: z
      .object({
        projectId: z.string().min(1),
        workspaceRoot: z.string().min(1).optional(),
        repo: z.string().trim().min(1).max(240).optional(),
        branch: z.string().trim().min(1).max(240).optional(),
        codeDigest: z.string().trim().min(1).max(128).optional(),
        specVersion: z.string().min(1),
        taskInputId: z.string().min(1).optional(),
        /** Frozen task materials at start — definition edits must not rewrite. */
        materials: z.array(LoopTaskMaterialSchema).max(64).optional(),
        credentialRefIds: z.array(z.string().min(1).max(120)).max(32).optional(),
        preflightNotes: z.array(z.string().trim().min(1).max(500)).max(40).optional(),
        createdAt: z.string().min(1),
      })
      .strict()
      .optional(),
    /**
     * Live code digest captured when verification entered; must match at stamp time.
     */
    verificationCodeDigest: z.string().trim().min(1).max(128).optional(),
    /** Evidence id bound when verification first accepted a run result. */
    verificationEvidenceId: z.string().min(1).optional(),
    /** GC-4.1 recoverable snapshot. */
    checkpoint: LoopInstanceCheckpointSchema.optional(),
    /** GC-4.2 context freshness (orthogonal to status). */
    freshness: LoopFreshnessSchema.optional(),
    /** GC-4.5 budget counters. */
    budgetUsage: LoopBudgetUsageSchema.optional(),
    /** GC-4.3 / GC-5 launch provenance. */
    launch: LoopLaunchSchema.optional(),
    events: z.array(LoopInstanceEventSchema).max(LOOP_INSTANCE_EVENT_LIMIT),
    startedAt: z.string().min(1),
    updatedAt: z.string().min(1),
    completedAt: z.string().min(1).optional(),
    errorMessage: z.string().trim().max(1000).optional(),
  })
  .strict();

export const LoopGraphHeadSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(160),
    status: LoopDocumentStatusSchema,
    linkedSessionIds: z.array(z.string().min(1)).max(20),
    draftRevision: z.number().int().nonnegative(),
    approvedSpecVersion: z.string().min(1).optional(),
    activeInstanceId: z.string().min(1).optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const LoopGraphIndexSchema = z
  .object({
    version: LoopGraphVersionSchema,
    heads: z.array(LoopGraphHeadSchema),
    lastActiveId: z.string().min(1).optional(),
  })
  .strict();

export const LOOP_DRAFT_HISTORY_MAX = 20;

export const LoopComposerModeSchema = z.enum(["ask", "edit", "create_agent"]);

export const LoopGoalContextStatusSchema = z.enum(["draft", "confirmed"]);

export const LoopGoalContextSchema = z
  .object({
    goal: z.string().trim().min(1).max(1000),
    constraints: z.array(z.string().trim().min(1).max(500)).max(20),
    doneWhen: z.array(z.string().trim().min(1).max(500)).max(20),
    outOfScope: z.array(z.string().trim().min(1).max(500)).max(20),
    openQuestions: z.array(LoopOpenQuestionSchema).max(20),
    status: LoopGoalContextStatusSchema,
    revision: z.number().int().nonnegative(),
    updatedAt: z.string().min(1),
    sourceThreadLength: z.number().int().nonnegative(),
  })
  .strict();

export const LoopAuthoringMessageSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["user", "assistant", "system"]),
    content: z.string().trim().max(8000),
    timestamp: z.string().min(1),
  })
  .strict();

export const LoopAuthoringTraceStepKindSchema = z.enum([
  "thinking",
  "tool",
  "writing_context",
  "proposing_graph",
  "applying_patch",
  "error",
]);

export const LoopAuthoringTraceStepSchema = z
  .object({
    id: z.string().min(1),
    kind: LoopAuthoringTraceStepKindSchema,
    label: z.string().trim().min(1).max(240),
    at: z.string().min(1),
  })
  .strict();

export const LoopAuthoringTraceSchema = z
  .object({
    status: z.enum(["idle", "running", "complete", "error"]),
    currentStepId: z.string().min(1).optional(),
    steps: z.array(LoopAuthoringTraceStepSchema).max(40),
    errorMessage: z.string().trim().max(1000).optional(),
  })
  .strict();

export const IntentGraphHistoryEntrySchema = z
  .object({
    id: z.string().min(1),
    at: z.string().min(1),
    label: z.string().trim().min(1).max(240),
    draft: IntentGraphSchema,
  })
  .strict();

export const LoopGraphEditDiffSchema = z
  .object({
    addedNodeIds: z.array(z.string().min(1)).max(100),
    removedNodeIds: z.array(z.string().min(1)).max(100),
    changedNodeIds: z.array(z.string().min(1)).max(100),
    addedEdgeIds: z.array(z.string().min(1)).max(200),
    removedEdgeIds: z.array(z.string().min(1)).max(200),
    summaryLines: z.array(z.string().trim().min(1).max(240)).max(20),
  })
  .strict();

export const LoopPendingGraphEditOfferSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    createdAt: z.string().min(1),
    /** When set, Accept applies this proposed draft (AI Edit propose-before-apply). */
    proposedDraft: IntentGraphSchema.optional(),
    /** Draft revision the proposal was computed against (reject if diverged). */
    baseRevision: z.number().int().nonnegative().optional(),
    /** Goal-context revision at propose time (reject if goal changed). */
    baseGoalRevision: z.number().int().nonnegative().optional(),
    summary: z.string().trim().min(1).max(1000).optional(),
    /** Structured preview for reviewable accept/dismiss (not reason text alone). */
    diff: LoopGraphEditDiffSchema.optional(),
  })
  .strict();

export const LoopGraphDocumentSchema = z
  .object({
    version: LoopGraphVersionSchema,
    id: z.string().min(1),
    projectId: z.string().min(1),
    title: z.string().trim().min(1).max(160),
    draft: IntentGraphSchema,
    approvedSpecs: z.array(LoopSpecSchema).max(50),
    instances: z.array(LoopInstanceSchema).max(50),
    linkedSessionIds: z.array(z.string().min(1)).max(20),
    pendingCompile: z
      .object({
        specDraft: LoopSpecSchema,
        assumptions: z.array(LoopAssumptionSchema),
        cycleGates: z.array(LoopCycleGateSchema),
        compiledAt: z.string().min(1),
        /** GC-4.4 structured replan metadata (optional for plain compiles). */
        replan: LoopReplanProposalSchema.optional(),
      })
      .strict()
      .optional(),
    composerMode: LoopComposerModeSchema.default("ask"),
    authoringThread: z.array(LoopAuthoringMessageSchema).max(200).default([]),
    draftGoalContext: LoopGoalContextSchema.optional(),
    confirmedGoalContext: LoopGoalContextSchema.optional(),
    authoringTrace: LoopAuthoringTraceSchema.default({
      status: "idle",
      steps: [],
    }),
    draftHistory: z
      .array(IntentGraphHistoryEntrySchema)
      .max(LOOP_DRAFT_HISTORY_MAX)
      .default([]),
    /** Populated by undo; cleared on new Accept / persist edits. */
    draftRedoStack: z
      .array(IntentGraphHistoryEntrySchema)
      .max(LOOP_DRAFT_HISTORY_MAX)
      .default([]),
    pendingGraphEditOffer: LoopPendingGraphEditOfferSchema.optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const LoopCompileResultSchema = z
  .object({
    specDraft: LoopSpecSchema,
    assumptions: z.array(LoopAssumptionSchema),
    cycleGates: z.array(LoopCycleGateSchema),
  })
  .strict();

export const LoopHitlAnswerSchema = z
  .object({
    questionId: z.string().min(1),
    answer: z.string().trim().min(1).max(1000),
    /** Approval Edit: Action must execute this payload, not the Agent draft. */
    editedPayload: z.record(z.string(), z.unknown()).optional(),
    /** Authorized human actor; assignment alone does not imply this. */
    actor: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const LoopAuthoringTurnRequestSchema = z
  .object({
    mode: LoopComposerModeSchema,
    text: z.string().trim().min(1).max(4000),
    /**
     * Optional canvas selection — Edit prompts may target a single node.
     * Omitted = whole-workflow context (still includes full draft in provider path).
     */
    selectedNodeId: z.string().min(1).optional(),
    /**
     * When true, prefer the ModelGateway provider path over heuristics.
     * Loopback/tests inject a gateway; live keys are never auto-read this round.
     */
    useProvider: z.boolean().optional(),
  })
  .strict();

export const LoopGoalClarificationAnswerSchema = z
  .object({
    questionId: z.string().min(1),
    answer: z.string().trim().min(1).max(1000),
  })
  .strict();

export type IntentNodeRole = z.infer<typeof IntentNodeRoleSchema>;
export type IntentEdgeKind = z.infer<typeof IntentEdgeKindSchema>;
export type IntentEdgePort = z.infer<typeof IntentEdgePortSchema>;
export type IntentGraph = z.infer<typeof IntentGraphSchema>;
export type IntentGraphNode = z.infer<typeof IntentGraphNodeSchema>;
export type IntentGraphEdge = z.infer<typeof IntentGraphEdgeSchema>;
export type IntentGraphNodeType = z.infer<typeof IntentGraphNodeTypeSchema>;
export type LoopConfigRef = z.infer<typeof LoopConfigRefSchema>;
export type AgentWiringOverride = z.infer<typeof AgentWiringOverrideSchema>;
export type LoopSpec = z.infer<typeof LoopSpecSchema>;
export type LoopSpecNode = z.infer<typeof LoopSpecNodeSchema>;
export type LoopSpecEdge = z.infer<typeof LoopSpecEdgeSchema>;
export type LoopNodeTypeParsed = z.infer<typeof LoopNodeTypeSchema>;
export type LoopAgentRoleParsed = z.infer<typeof LoopAgentRoleSchema>;
export type LoopHumanModeParsed = z.infer<typeof LoopHumanModeSchema>;
export type LoopActionIntegrationParsed = z.infer<typeof LoopActionIntegrationSchema>;
export type LoopLogicKindParsed = z.infer<typeof LoopLogicKindSchema>;
export type LoopSatelliteKindParsed = z.infer<typeof LoopSatelliteKindSchema>;
export type LoopAgentConfigPortParsed = z.infer<typeof LoopAgentConfigPortSchema>;
export type LoopMemoryModeParsed = z.infer<typeof LoopMemoryModeSchema>;
export type LoopInstance = z.infer<typeof LoopInstanceSchema>;
export type LoopInstanceEvent = z.infer<typeof LoopInstanceEventSchema>;
export type LoopInstanceArtifact = z.infer<typeof LoopInstanceArtifactSchema>;
export type LoopNodeRecord = z.infer<typeof LoopNodeRecordSchema>;
export type LoopNodeRecordStatus = z.infer<typeof LoopNodeRecordStatusSchema>;
export type LoopInstanceCheckpoint = z.infer<typeof LoopInstanceCheckpointSchema>;
export type LoopFreshness = z.infer<typeof LoopFreshnessSchema>;
export type LoopBudgetUsage = z.infer<typeof LoopBudgetUsageSchema>;
export type LoopLaunch = z.infer<typeof LoopLaunchSchema>;
export type LoopReplanProposal = z.infer<typeof LoopReplanProposalSchema>;
export type LoopInputParam = z.infer<typeof LoopInputParamSchema>;
export type LoopParallelMode = z.infer<typeof LoopParallelModeSchema>;
export type LoopStalePolicy = z.infer<typeof LoopStalePolicySchema>;
export type LoopGraphHead = z.infer<typeof LoopGraphHeadSchema>;
export type LoopGraphIndex = z.infer<typeof LoopGraphIndexSchema>;
export type LoopGraphDocument = z.infer<typeof LoopGraphDocumentSchema>;
export type LoopCompileResult = z.infer<typeof LoopCompileResultSchema>;
export type LoopHitlAnswer = z.infer<typeof LoopHitlAnswerSchema>;
export type LoopAssumption = z.infer<typeof LoopAssumptionSchema>;
export type LoopCycleGate = z.infer<typeof LoopCycleGateSchema>;
export type LoopOpenQuestion = z.infer<typeof LoopOpenQuestionSchema>;
export type LoopDocumentStatus = z.infer<typeof LoopDocumentStatusSchema>;
export type LoopInstanceStatus = z.infer<typeof LoopInstanceStatusSchema>;
export type LoopComposerMode = z.infer<typeof LoopComposerModeSchema>;
export type LoopGoalContext = z.infer<typeof LoopGoalContextSchema>;
export type LoopAuthoringMessage = z.infer<typeof LoopAuthoringMessageSchema>;
export type LoopAuthoringTraceStep = z.infer<typeof LoopAuthoringTraceStepSchema>;
export type LoopAuthoringTrace = z.infer<typeof LoopAuthoringTraceSchema>;
export type IntentGraphHistoryEntry = z.infer<typeof IntentGraphHistoryEntrySchema>;
export type LoopPendingGraphEditOffer = z.infer<typeof LoopPendingGraphEditOfferSchema>;
export type LoopAuthoringTurnRequest = z.infer<typeof LoopAuthoringTurnRequestSchema>;
export type LoopGoalClarificationAnswer = z.infer<typeof LoopGoalClarificationAnswerSchema>;

/**
 * Keep the newest events, and always retain the earliest `started` marker
 * when the list is truncated.
 */
export function trimLoopInstanceEvents(
  events: LoopInstanceEvent[],
  limit = LOOP_INSTANCE_EVENT_LIMIT,
): LoopInstanceEvent[] {
  if (events.length <= limit) return events;
  const startedIndex = events.findIndex((event) => event.type === "started");
  if (startedIndex < 0 || limit < 1) return events.slice(-limit);
  const started = events[startedIndex]!;
  const rest = events.filter((_, index) => index !== startedIndex);
  const tail = rest.slice(-(limit - 1));
  const kept = new Set(tail.map((event) => event.id));
  kept.add(started.id);
  return events.filter((event) => kept.has(event.id));
}

export function emptyIntentGraph(revision = 0): IntentGraph {
  return {
    revision,
    graphPrompt: "",
    nodes: [],
    edges: [],
  };
}

export function emptyAuthoringTrace(): LoopAuthoringTrace {
  return { status: "idle", steps: [] };
}

export function summarizeGoalContextForGraphPrompt(context: LoopGoalContext): string {
  const parts = [context.goal.trim()];
  if (context.constraints.length > 0) {
    parts.push(`Constraints: ${context.constraints.join("; ")}`);
  }
  if (context.doneWhen.length > 0) {
    parts.push(`Done when: ${context.doneWhen.join("; ")}`);
  }
  if (context.outOfScope.length > 0) {
    parts.push(`Out of scope: ${context.outOfScope.join("; ")}`);
  }
  return parts.join("\n").slice(0, 4000);
}

function enrichIntentNodeArchitecture(
  node: Record<string, unknown>,
): Record<string, unknown> {
  const role =
    typeof node.role === "string" ? (node.role as IntentNodeRole) : undefined;
  const enriched = withArchitectureDefaults({
    role,
    type: node.type as LoopNodeType | undefined,
    agentRole: node.agentRole as LoopAgentRole | undefined,
    humanMode: node.humanMode as LoopHumanMode | undefined,
    actionIntegration: node.actionIntegration as LoopActionIntegration | undefined,
    actionOperation:
      typeof node.actionOperation === "string" ? node.actionOperation : undefined,
    logicKind: node.logicKind as LoopLogicKind | undefined,
    maxIterations:
      typeof node.maxIterations === "number" ? node.maxIterations : undefined,
    repairMode: typeof node.repairMode === "boolean" ? node.repairMode : undefined,
  });
  return { ...node, ...enriched };
}

function enrichSpecNodeArchitecture(
  node: Record<string, unknown>,
): Record<string, unknown> {
  return enrichIntentNodeArchitecture(node);
}

function enrichDraftArchitecture(draft: unknown): unknown {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return draft;
  const d = draft as Record<string, unknown>;
  const nodes = Array.isArray(d.nodes)
    ? d.nodes.map((node) =>
        node && typeof node === "object" && !Array.isArray(node)
          ? enrichIntentNodeArchitecture(node as Record<string, unknown>)
          : node,
      )
    : d.nodes;
  return { ...d, nodes };
}

function enrichSpecArchitecture(spec: unknown): unknown {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return spec;
  const s = spec as Record<string, unknown>;
  const nodes = Array.isArray(s.nodes)
    ? s.nodes.map((node) =>
        node && typeof node === "object" && !Array.isArray(node)
          ? enrichSpecNodeArchitecture(node as Record<string, unknown>)
          : node,
      )
    : s.nodes;
  return { ...s, nodes };
}

/** Fill authoring + architecture fields missing on older on-disk documents. */
export function normalizeLoopGraphDocument(raw: unknown): LoopGraphDocument {
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const draft = enrichDraftArchitecture(base.draft);
  const approvedSpecs = Array.isArray(base.approvedSpecs)
    ? base.approvedSpecs.map(enrichSpecArchitecture)
    : base.approvedSpecs;
  const pendingCompile =
    base.pendingCompile &&
    typeof base.pendingCompile === "object" &&
    !Array.isArray(base.pendingCompile)
      ? {
          ...(base.pendingCompile as Record<string, unknown>),
          specDraft: enrichSpecArchitecture(
            (base.pendingCompile as Record<string, unknown>).specDraft,
          ),
        }
      : base.pendingCompile;

  return LoopGraphDocumentSchema.parse({
    ...base,
    draft,
    approvedSpecs,
    pendingCompile,
    composerMode: base.composerMode ?? "ask",
    authoringThread: Array.isArray(base.authoringThread) ? base.authoringThread : [],
    authoringTrace:
      base.authoringTrace && typeof base.authoringTrace === "object"
        ? base.authoringTrace
        : emptyAuthoringTrace(),
    draftHistory: Array.isArray(base.draftHistory)
      ? base.draftHistory.slice(0, LOOP_DRAFT_HISTORY_MAX)
      : [],
    draftRedoStack: Array.isArray(base.draftRedoStack)
      ? base.draftRedoStack.slice(0, LOOP_DRAFT_HISTORY_MAX)
      : [],
  });
}

export function pushIntentGraphHistory(
  history: IntentGraphHistoryEntry[],
  entry: IntentGraphHistoryEntry,
  max = LOOP_DRAFT_HISTORY_MAX,
): IntentGraphHistoryEntry[] {
  return [...history, entry].slice(-max);
}

export interface IntentGraphReadinessIssue {
  path: string;
  message: string;
}

/** Draw-mode hard gate: every node/edge must have authored semantics before compile. */
export function getIntentGraphCompileIssues(draft: IntentGraph): IntentGraphReadinessIssue[] {
  const issues: IntentGraphReadinessIssue[] = [];
  const dutyNodes = draft.nodes.filter((node) => !isConfigNode(node));
  if (dutyNodes.length === 0) {
    issues.push({ path: "nodes", message: "At least one node is required" });
    return issues;
  }
  for (const node of dutyNodes) {
    if (!node.prompt.trim()) {
      issues.push({
        path: `nodes.${node.id}.prompt`,
        message: `Node "${node.title}" needs a description`,
      });
    }
  }
  for (const edge of draft.edges) {
    if (edge.kind === "provides") {
      // Config wiring edges do not require free-text prompts.
      continue;
    }
    if (!edge.prompt?.trim()) {
      issues.push({
        path: `edges.${edge.id}.prompt`,
        message: `Edge ${edge.source} → ${edge.target} needs a description`,
      });
    }
    if (!edge.kind) {
      issues.push({
        path: `edges.${edge.id}.kind`,
        message: `Edge ${edge.source} → ${edge.target} needs a kind`,
      });
    }
  }
  return issues;
}

export function isIntentGraphReadyForCompile(draft: IntentGraph): boolean {
  return getIntentGraphCompileIssues(draft).length === 0;
}

/** Lightweight role hint for Draw-mode edge kind suggestion (no LLM). */
export function suggestIntentNodeRole(node: IntentGraphNode): IntentNodeRole {
  if (isConfigNode(node)) return "unknown";
  if (node.type) {
    return withArchitectureDefaults(node).role;
  }
  if (node.role && node.role !== "unknown") return node.role;
  const text = `${node.title}\n${node.prompt}`.toLowerCase();
  if (/planner|devplan|规划/.test(text)) return "implement";
  if (/reviewer|code review|审查/.test(text)) return "implement";
  if (/verify|test|验收|验证|check/.test(text)) return "verify";
  if (/fix|repair|修复|重试/.test(text)) return "fix";
  if (/approv|decide|choose|确认|选择|human/.test(text)) return "decide";
  if (/condition|branch|if\b/.test(text)) return "unknown";
  if (/implement|build|coder|实现|开发|add|做/.test(text)) return "implement";
  return "implement";
}

export function suggestIntentEdgeKind(
  edge: Pick<
    IntentGraphEdge,
    "kind" | "source" | "target" | "branchKey" | "configPort"
  >,
  nodes: IntentGraphNode[],
): IntentEdgeKind {
  if (edge.kind) return edge.kind;
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  if (!source || !target) return "depends";
  if (isConfigNode(source) && (target.type ?? "agent") === "agent") {
    return "provides";
  }
  if (isConfigNode(target) || isConfigNode(source)) {
    return "provides";
  }
  if (isConditionNode(source) || edge.branchKey) {
    return "conditional";
  }
  const sourceRole = suggestIntentNodeRole(source);
  const targetRole = suggestIntentNodeRole(target);
  if (
    (sourceRole === "verify" || sourceRole === "decide") &&
    (targetRole === "implement" || targetRole === "fix")
  ) {
    return "feedback";
  }
  const sourceArch = withArchitectureDefaults(source);
  const targetArch = withArchitectureDefaults(target);
  if (
    (sourceArch.type === "action" && sourceArch.actionIntegration === "test") ||
    sourceArch.type === "human"
  ) {
    if (targetArch.type === "agent" && targetArch.agentRole === "coder") {
      return "feedback";
    }
  }
  return "depends";
}

export function headFromLoopDocument(doc: LoopGraphDocument): LoopGraphHead {
  const latestSpec = doc.approvedSpecs[doc.approvedSpecs.length - 1];
  const activeInstance = [...doc.instances]
    .reverse()
    .find((item) =>
      item.status === "queued" ||
      item.status === "running" ||
      item.status === "paused" ||
      item.status === "awaiting_hitl",
    );
  let status: LoopDocumentStatus = "draft";
  if (activeInstance) {
    status =
      activeInstance.status === "paused" || activeInstance.status === "awaiting_hitl"
        ? "paused"
        : "running";
  } else if (doc.instances.some((item) => item.status === "error")) {
    status = "error";
  } else if (
    doc.instances.some(
      (item) => item.status === "complete" || item.status === "cancelled",
    )
  ) {
    status =
      doc.instances.some((item) => item.status === "complete") ? "complete" : "draft";
  } else if (latestSpec) {
    status = "approved";
  } else if (doc.pendingCompile) {
    status = "compiled";
  }

  return LoopGraphHeadSchema.parse({
    id: doc.id,
    title: doc.title,
    status,
    linkedSessionIds: doc.linkedSessionIds,
    draftRevision: doc.draft.revision,
    approvedSpecVersion: latestSpec?.version,
    activeInstanceId: activeInstance?.id,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  });
}

export interface LoopTopologyIssue {
  path: string;
  message: string;
}

/**
 * Approve topology (GC-1): depends may fan out (Parallel); Condition fans out via
 * `conditional`; Merge may fan in; multiple feedback allowed (≤ LOOP_FEEDBACK_EDGE_MAX);
 * `fallback` edges for Recovery; Loop nodes require maxIterations.
 */
export function validateLoopSpecTopology(spec: LoopSpec): LoopTopologyIssue[] {
  const issues: LoopTopologyIssue[] = [];
  const nodeIds = new Set(spec.nodes.map((node) => node.id));
  const nodesById = new Map(spec.nodes.map((node) => [node.id, node]));

  if (!spec.stopPolicy?.maxRounds || spec.stopPolicy.maxRounds < 1) {
    issues.push({ path: "stopPolicy.maxRounds", message: "stop_policy.maxRounds is required" });
  }

  for (const edge of spec.edges) {
    if (!nodeIds.has(edge.from)) {
      issues.push({ path: `edges.${edge.id}`, message: `Unknown from node ${edge.from}` });
    }
    if (!nodeIds.has(edge.to)) {
      issues.push({ path: `edges.${edge.id}`, message: `Unknown to node ${edge.to}` });
    }
  }

  const depends = spec.edges.filter((edge) => edge.kind === "depends");
  const feedback = spec.edges.filter((edge) => edge.kind === "feedback");
  const conditional = spec.edges.filter((edge) => edge.kind === "conditional");
  const fallback = spec.edges.filter((edge) => edge.kind === "fallback");

  if (feedback.length > LOOP_FEEDBACK_EDGE_MAX) {
    issues.push({
      path: "edges",
      message: `At most ${LOOP_FEEDBACK_EDGE_MAX} feedback edges are allowed`,
    });
  }

  for (const node of spec.nodes) {
    if (isLoopLogicNode(node) && !(node.maxIterations && node.maxIterations >= 1)) {
      issues.push({
        path: `nodes.${node.id}.maxIterations`,
        message: `Loop node "${node.id}" requires maxIterations ≥ 1`,
      });
    }
  }

  for (const edge of conditional) {
    const fromNode = nodesById.get(edge.from);
    if (fromNode && !isConditionNode(fromNode)) {
      issues.push({
        path: `edges.${edge.id}`,
        message: "Conditional edges must start from a Condition logic node",
      });
    }
    if (!edge.branchKey?.trim()) {
      issues.push({
        path: `edges.${edge.id}.branchKey`,
        message: "Conditional edges require a branchKey",
      });
    }
  }

  for (const edge of fallback) {
    const fromNode = nodesById.get(edge.from);
    if (!fromNode) continue;
    const fromArch = withArchitectureDefaults(fromNode);
    const okFrom =
      fromArch.type === "agent" ||
      fromArch.type === "action" ||
      fromArch.type === "logic" ||
      fromNode.role === "implement" ||
      fromNode.role === "fix" ||
      fromNode.role === "verify";
    if (!okFrom) {
      issues.push({
        path: `edges.${edge.id}`,
        message: "Fallback edges must start from an agent, action, or logic node",
      });
    }
  }

  const conditionOut = new Map<string, number>();
  for (const edge of conditional) {
    conditionOut.set(edge.from, (conditionOut.get(edge.from) ?? 0) + 1);
  }
  for (const node of spec.nodes) {
    if (!isConditionNode(node)) continue;
    const outs = conditionOut.get(node.id) ?? 0;
    if (outs < 2) {
      issues.push({
        path: `nodes.${node.id}`,
        message: "Condition node requires at least two conditional outgoing edges",
      });
    }
  }

  const incoming = new Map<string, number>();
  for (const node of spec.nodes) {
    incoming.set(node.id, 0);
  }
  for (const edge of depends) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }

  // Parallel fork allowed (outdegree > 1). Fan-in only onto Merge nodes.
  for (const [id, count] of incoming) {
    if (count > 1) {
      const node = nodesById.get(id);
      if (node && isMergeNode(node)) continue;
      issues.push({
        path: `nodes.${id}`,
        message:
          "Depends fan-in (indegree > 1) is only allowed on Merge logic nodes",
      });
    }
  }

  // Entry = no depends/conditional/fallback inbound (fallback targets are not entries).
  const inboundAny = new Map<string, number>();
  for (const node of spec.nodes) inboundAny.set(node.id, 0);
  for (const edge of [...depends, ...conditional, ...fallback]) {
    inboundAny.set(edge.to, (inboundAny.get(edge.to) ?? 0) + 1);
  }
  const entries = spec.nodes.filter((node) => (inboundAny.get(node.id) ?? 0) === 0);
  if (spec.nodes.length > 0 && entries.length !== 1) {
    issues.push({
      path: "nodes",
      message: "Graph must have exactly one entry node",
    });
  }

  for (const edge of feedback) {
    const fromNode = spec.nodes.find((node) => node.id === edge.from);
    const toNode = spec.nodes.find((node) => node.id === edge.to);
    if (fromNode) {
      const fromArch = withArchitectureDefaults(fromNode);
      const okFrom =
        fromNode.role === "verify" ||
        fromNode.role === "decide" ||
        (fromArch.type === "action" && fromArch.actionIntegration === "test") ||
        fromArch.type === "human" ||
        (fromArch.type === "agent" && fromArch.agentRole === "reviewer");
      if (!okFrom) {
        issues.push({
          path: `edges.${edge.id}`,
          message:
            "Feedback edge should start from verify/test, human, reviewer, or decide",
        });
      }
    }
    if (toNode) {
      const toArch = withArchitectureDefaults(toNode);
      const okTo =
        toNode.role === "implement" ||
        toNode.role === "fix" ||
        (toArch.type === "agent" &&
          (toArch.agentRole === "coder" || toArch.agentRole === "planner"));
      if (!okTo) {
        issues.push({
          path: `edges.${edge.id}`,
          message: "Feedback edge should target an implement/fix/coder/planner node",
        });
      }
    }
  }

  return issues;
}

export function createEmptyLoopDocument(input: {
  id: string;
  projectId: string;
  title?: string;
  now?: string;
}): LoopGraphDocument {
  const now = input.now ?? new Date().toISOString();
  return LoopGraphDocumentSchema.parse({
    version: LOOP_GRAPH_VERSION,
    id: input.id,
    projectId: input.projectId,
    title: input.title?.trim() || "Untitled loop",
    draft: emptyIntentGraph(0),
    approvedSpecs: [],
    instances: [],
    linkedSessionIds: [],
    composerMode: "ask",
    authoringThread: [],
    authoringTrace: emptyAuthoringTrace(),
    draftHistory: [],
    createdAt: now,
    updatedAt: now,
  });
}
