import { z } from "zod";

import { DelegationPlanSchema } from "./delegation-plan.js";
import { HierarchyDelegationPlanSchema } from "./hierarchy-delegation.js";
import { NodeScaffoldPlanSchema } from "./node-scaffold-plan.js";
import { NodeDeletionPlanSchema } from "./node-deletion-plan.js";
import {
  GreenfieldInitializationPlanSchema,
  type GreenfieldInitializationPlan,
} from "./greenfield-initialization-plan.js";

// Events persist the server-normalized plan output, where schema defaults have
// already been materialized. Keep the event input/output contract identical.
const GreenfieldInitializationPlanEventSchema =
  GreenfieldInitializationPlanSchema as z.ZodType<GreenfieldInitializationPlan>;

export const AgentFlowStepKindSchema = z.enum([
  "context_prepared",
  "locate_plan",
  "generate_proposal",
  "validate_proposal",
  "apply_change",
  "verify_change",
  "plan_delegation",
  "delegate_tasks",
  "validate_batch",
  "commit_group",
  "verify_group",
  "understand",
  "retrieve_context",
  "inspect_files",
  "plan",
  "generate_diff",
  "apply",
  "verify",
  "debug",
]);

export const AgentFlowStepStatusSchema = z.enum([
  "pending",
  "running",
  "complete",
  "warning",
  "error",
  "skipped",
]);

export const AgentFlowStepSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    kind: AgentFlowStepKindSchema,
    status: AgentFlowStepStatusSchema,
    inputSummary: z.string().optional(),
    outputSummary: z.string().optional(),
    relatedNodeIds: z.array(z.string()),
    relatedFiles: z.array(z.string()),
  })
  .strict();

export const AgentLifecycleEventTypeSchema = z.enum([
  "run_started",
  "prompt_refined",
  "step_started",
  "step_completed",
  "step_failed",
  "correction_added",
  "diff_ready",
  "verification_completed",
  "run_completed",
]);

export const AgentActionEventTypeSchema = z.enum([
  "context_assembled",
  "context_attached",
  "file_read",
  "model_request",
  "mcp_tool_call",
  "tool_policy_decision",
  "edit_plan_created",
  "proposal_validation_result",
  "batch_validation_result",
  "decision_summary",
  "diff_proposed",
  "apply_result",
  "verification_result",
  "initialization_tranche_progress",
  "memory_index_bound",
]);

export const AgentRunEventTypeSchema = z.union([
  AgentLifecycleEventTypeSchema,
  AgentActionEventTypeSchema,
  z.enum([
    "plan_created",
    "task_delegated",
    "child_run_started",
    "child_run_completed",
    "plan_completed",
    "plan_partially_completed",
    "child_run_outcome",
  ]),
]);

const EventIdentitySchema = z.object({
  eventId: z.string(),
  runId: z.string(),
  timestamp: z.string(),
});

const DelegationEventIdentitySchema = EventIdentitySchema.extend({
  step: z.never().optional(),
});

export const AgentLifecycleEventSchema = EventIdentitySchema.extend({
  type: AgentLifecycleEventTypeSchema,
  step: AgentFlowStepSchema.optional(),
  payload: z.record(z.unknown()).optional(),
}).strict();

export const ContextFileTraceSchema = z.object({
  path: z.string().min(1),
  disposition: z.enum(["exact", "truncated", "omitted"]),
  byteLength: z.number().int().nonnegative().optional(),
  includedByteLength: z.number().int().nonnegative().optional(),
  omissionReason: z.string().min(1).optional(),
}).strict();

export const ContextAssembledPayloadSchema = z.object({
  files: z.array(ContextFileTraceSchema),
  synopsisPresent: z.boolean(),
  childrenCoverage: z.object({
    totalCount: z.number().int().nonnegative(),
    includedCount: z.number().int().nonnegative(),
    omittedCount: z.number().int().nonnegative(),
  }).strict().optional(),
  bundleHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
}).strict();

export const ContextAttachedPayloadSchema = z.object({
  autoFiles: z.array(ContextFileTraceSchema),
  explicitAttachments: z.array(
    z.object({
      label: z.string().min(1),
      kind: z.string().min(1),
      disposition: z.enum(["exact", "truncated", "omitted"]),
      byteLength: z.number().int().nonnegative().optional(),
      includedByteLength: z.number().int().nonnegative().optional(),
      omissionReason: z.string().min(1).optional(),
    }).strict(),
  ),
  invokedSkillId: z.string().min(1).optional(),
  bundleHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
}).strict();

export const FileReadPayloadSchema = z.object({
  path: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
  status: z.enum(["ok", "failed"]),
}).strict();

export const McpToolCallPayloadSchema = z.object({
  serverId: z.string().min(1),
  toolName: z.string().min(1),
  callId: z.string().min(1),
  status: z.enum(["completed", "failed", "rejected"]),
  durationMs: z.number().int().nonnegative(),
  resultBytes: z.number().int().nonnegative().optional(),
  error: z.string().max(2_048).optional(),
}).strict();

/** Harness ToolPolicy allow/ask/deny decision (H3.A polish). */
export const ToolPolicyDecisionPayloadSchema = z.object({
  tool: z.string().min(1),
  decision: z.enum(["allow", "ask", "deny"]),
  reason: z.string().min(1).max(2_048),
  match: z.string().min(1).max(500).optional(),
}).strict();

export const ModelRequestPayloadSchema = z.object({
  stage: z.enum([
    "refine",
    "generate",
    "answer",
    "locate",
    "edit",
    "validate",
    "plan",
    "validate_batch",
  ]),
  provider: z.string().min(1),
  model: z.string().min(1),
  durationMs: z.number().finite().int().nonnegative(),
  status: z.enum(["ok", "failed"]),
  tokenUsage: z.object({
    input: z.number().finite().int().nonnegative(),
    output: z.number().finite().int().nonnegative(),
  }).strict(),
}).strict();

export const EditPlanCreatedPayloadSchema = z.object({
  path: z.string().min(1),
  objective: z.string().trim().min(1).max(500),
  anchors: z.array(z.string().trim().min(1).max(120)).max(12),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(300)).max(12),
  rationale: z.string().trim().min(1).max(500),
  changeRequired: z.boolean().optional(),
}).strict();

export const ProposalValidationResultPayloadSchema = z.object({
  path: z.string().min(1),
  verdict: z.enum(["valid", "invalid"]),
  criteria: z.array(z.object({
    criterion: z.string().trim().min(1).max(300),
    status: z.enum(["satisfied", "unsatisfied", "uncertain"]),
  }).strict()).min(1).max(20),
  scopeStatus: z.enum(["compliant", "violation"]),
  summary: z.string().trim().min(1).max(500),
  rationale: z.string().trim().min(1).max(500),
}).strict();

export const BatchValidationResultPayloadSchema = z.object({
  planId: z.string().min(1),
  verdict: z.enum(["valid", "invalid"]),
  tasks: z.array(z.object({
    taskId: z.string().min(1),
    childRunId: z.string().min(1),
    path: z.string().min(1),
    status: z.enum(["consistent", "inconsistent", "uncertain"]),
    criteria: z.array(z.object({
      criterion: z.string().trim().min(1).max(300),
      status: z.enum(["satisfied", "unsatisfied", "uncertain"]),
    }).strict()).min(1).max(48),
  }).strict()).min(1).max(32),
  crossFileStatus: z.enum(["consistent", "inconsistent", "uncertain"]),
  summary: z.string().trim().min(1).max(500),
  rationale: z.string().trim().min(1).max(500),
}).strict();

export const DecisionSummaryPayloadSchema = z.object({
  summary: z.string().trim().min(1).max(500),
}).strict();

export const DiffProposedPayloadSchema = z.object({
  files: z.array(z.object({
    path: z.string().min(1),
    operation: z.enum(["modify", "create", "delete"]),
  }).strict()),
}).strict();

export const ApplyResultTracePayloadSchema = z.object({
  filesWritten: z.array(z.string().min(1)),
  backupId: z.string().min(1).optional(),
  outcome: z.enum(["applied", "recovery_required", "rejected"]),
}).strict();

export const VerificationResultPayloadSchema = z.object({
  command: z.string().min(1).optional(),
  status: z.enum(["passed", "failed", "not_run"]),
}).strict();

/** Hash and budget flag only. Never the note text. */
export const MemoryIndexBoundPayloadSchema = z.object({
  hash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  truncated: z.boolean(),
  entryCount: z.number().int().nonnegative(),
}).strict();

export const InitializationTrancheProgressPayloadSchema = z.object({
  planId: z.string().min(1),
  trancheId: z.string().min(1),
  order: z.number().int().positive(),
  totalTranches: z.number().int().positive(),
  status: z.enum(["preparing", "validated", "committed", "failed"]),
  nodesCreated: z.number().int().nonnegative(),
  filesCreated: z.number().int().nonnegative(),
  committedTrancheIds: z.array(z.string().min(1)),
  backupId: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
}).strict();

function actionEventSchema<
  TType extends z.ZodLiteral<string>,
  TPayload extends z.ZodTypeAny,
>(type: TType, payload: TPayload) {
  return EventIdentitySchema.extend({
    type,
    phaseId: z.string().min(1).optional(),
    step: z.never().optional(),
    payload,
  }).strict();
}

export const AgentActionEventSchema = z.discriminatedUnion("type", [
  actionEventSchema(z.literal("context_assembled"), ContextAssembledPayloadSchema),
  actionEventSchema(z.literal("context_attached"), ContextAttachedPayloadSchema),
  actionEventSchema(z.literal("file_read"), FileReadPayloadSchema),
  actionEventSchema(z.literal("model_request"), ModelRequestPayloadSchema),
  actionEventSchema(z.literal("mcp_tool_call"), McpToolCallPayloadSchema),
  actionEventSchema(
    z.literal("tool_policy_decision"),
    ToolPolicyDecisionPayloadSchema,
  ),
  actionEventSchema(z.literal("edit_plan_created"), EditPlanCreatedPayloadSchema),
  actionEventSchema(
    z.literal("proposal_validation_result"),
    ProposalValidationResultPayloadSchema,
  ),
  actionEventSchema(
    z.literal("batch_validation_result"),
    BatchValidationResultPayloadSchema,
  ),
  actionEventSchema(z.literal("decision_summary"), DecisionSummaryPayloadSchema),
  actionEventSchema(z.literal("diff_proposed"), DiffProposedPayloadSchema),
  actionEventSchema(z.literal("apply_result"), ApplyResultTracePayloadSchema),
  actionEventSchema(z.literal("verification_result"), VerificationResultPayloadSchema),
  actionEventSchema(
    z.literal("initialization_tranche_progress"),
    InitializationTrancheProgressPayloadSchema,
  ),
  actionEventSchema(
    z.literal("memory_index_bound"),
    MemoryIndexBoundPayloadSchema,
  ),
]);

export const AgentDelegationEventSchema = z.discriminatedUnion("type", [
  DelegationEventIdentitySchema.extend({
    type: z.literal("plan_created"),
    payload: z.object({
      plan: z.union([
        DelegationPlanSchema,
        HierarchyDelegationPlanSchema,
        NodeScaffoldPlanSchema,
        NodeDeletionPlanSchema,
        GreenfieldInitializationPlanEventSchema,
      ]),
    }).strict(),
  }).strict(),
  DelegationEventIdentitySchema.extend({
    type: z.literal("task_delegated"),
    payload: z.union([
      z.object({
        planId: z.string().min(1),
        taskId: z.string().min(1),
        childRunId: z.string().min(1),
        nodeId: z.string().min(1),
        filePath: z.string().min(1),
        operation: z.enum(["modify", "create", "delete"]).optional(),
      }).strict(),
      z.discriminatedUnion("targetKind", [
        z.object({
          planId: z.string().min(1),
          taskId: z.string().min(1),
          childRunId: z.string().min(1),
          targetKind: z.literal("planner"),
          nodeId: z.string().min(1),
          level: z.enum(["context", "container", "component"]),
        }).strict(),
        z.object({
          planId: z.string().min(1),
          taskId: z.string().min(1),
          childRunId: z.string().min(1),
          targetKind: z.literal("leaf-file"),
          nodeId: z.string().min(1),
          filePath: z.string().min(1),
        }).strict(),
      ]),
    ]),
  }).strict(),
  DelegationEventIdentitySchema.extend({
    type: z.literal("child_run_started"),
    payload: z.object({
      planId: z.string().min(1),
      taskId: z.string().min(1),
      childRunId: z.string().min(1),
    }).strict(),
  }).strict(),
  DelegationEventIdentitySchema.extend({
    type: z.literal("child_run_completed"),
    payload: z.object({
      planId: z.string().min(1),
      taskId: z.string().min(1),
      childRunId: z.string().min(1),
      status: z.enum(["awaiting_review", "complete", "error"]),
      failureCategory: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u).optional(),
    }).strict(),
  }).strict(),
  DelegationEventIdentitySchema.extend({
    type: z.literal("plan_completed"),
    payload: z.object({
      planId: z.string().min(1),
      childRunIds: z.array(z.string().min(1)).min(1),
    }).strict(),
  }).strict(),
  DelegationEventIdentitySchema.extend({
    type: z.literal("plan_partially_completed"),
    payload: z.object({
      planId: z.string().min(1),
      completedChildRunIds: z.array(z.string().min(1)),
      failedChildRunIds: z.array(z.string().min(1)),
      reason: z.enum([
        "child_failure",
        "batch_validation_failed",
        "group_apply_failed",
        "recovery_required",
      ]),
    }).strict(),
  }).strict(),
  DelegationEventIdentitySchema.extend({
    type: z.literal("child_run_outcome"),
    payload: z.object({
      planId: z.string().min(1),
      taskId: z.string().min(1),
      childRunId: z.string().min(1),
      status: z.enum(["applied", "not_applied", "recovery_required"]),
      backupId: z.string().min(1).optional(),
    }).strict(),
  }).strict(),
]);

export const AgentTransientTraceSchema = z.object({
  traceId: z.string().min(1),
  runId: z.string().min(1),
  timestamp: z.string().min(1),
  type: z.literal("provider_reasoning"),
  phaseId: z.string().min(1),
  content: z.string().trim().min(1),
  source: z.literal("provider_supplied"),
  truncated: z.boolean(),
}).strict();

export const AgentRunEventSchema = z.union([
  AgentLifecycleEventSchema,
  AgentActionEventSchema,
  AgentDelegationEventSchema,
]);

export type AgentFlowStepKind = z.infer<typeof AgentFlowStepKindSchema>;
export type AgentFlowStepStatus = z.infer<typeof AgentFlowStepStatusSchema>;
export type AgentFlowStep = z.infer<typeof AgentFlowStepSchema>;
export type AgentLifecycleEventType = z.infer<typeof AgentLifecycleEventTypeSchema>;
export type AgentActionEventType = z.infer<typeof AgentActionEventTypeSchema>;
export type AgentRunEventType = z.infer<typeof AgentRunEventTypeSchema>;
export type ContextFileTrace = z.infer<typeof ContextFileTraceSchema>;
export type McpToolCallPayload = z.infer<typeof McpToolCallPayloadSchema>;
export type ToolPolicyDecisionPayload = z.infer<
  typeof ToolPolicyDecisionPayloadSchema
>;
export type ContextAssembledPayload = z.infer<
  typeof ContextAssembledPayloadSchema
>;
export type AgentLifecycleEvent = z.infer<typeof AgentLifecycleEventSchema>;
export type AgentActionEvent = z.infer<typeof AgentActionEventSchema>;
export type AgentDelegationEvent = z.infer<typeof AgentDelegationEventSchema>;
export type AgentRunEvent = z.infer<typeof AgentRunEventSchema>;
export type AgentTransientTrace = z.infer<typeof AgentTransientTraceSchema>;
