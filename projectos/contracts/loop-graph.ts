import { z } from "zod";

export const LOOP_GRAPH_VERSION = "0.1.0" as const;

export const LoopGraphVersionSchema = z.literal(LOOP_GRAPH_VERSION);

export const IntentNodeRoleSchema = z.enum([
  "implement",
  "verify",
  "fix",
  "decide",
  "unknown",
]);

export const IntentEdgeKindSchema = z.enum(["depends", "feedback"]);

export const IntentEdgePortSchema = z.enum(["n", "e", "s", "w"]);

export const AcceptanceKindSchema = z.enum(["machine", "human"]);

export const LoopInstanceStatusSchema = z.enum([
  "queued",
  "running",
  "paused",
  "awaiting_hitl",
  "awaiting_review",
  "complete",
  "error",
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

export const IntentGraphNodeSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(120),
    prompt: z.string().trim().max(4000),
    role: IntentNodeRoleSchema.optional(),
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
    sourcePort: IntentEdgePortSchema.optional(),
    targetPort: IntentEdgePortSchema.optional(),
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
    kind: IntentEdgeKindSchema,
    when: z.string().trim().max(500).optional(),
    carry: z.array(z.string().trim().min(1).max(240)).max(10).optional(),
  })
  .strict();

export const LoopRetryPolicySchema = z
  .object({
    onFailure: z.enum(["retry", "replan", "pause_hitl"]),
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
      "paused",
      "resumed",
      "awaiting_hitl",
      "hitl_resolved",
      "completed",
      "errored",
      "message",
    ]),
    nodeId: z.string().min(1).optional(),
    message: z.string().trim().max(2000).optional(),
    agentRunId: z.string().min(1).optional(),
    evidenceId: z.string().min(1).optional(),
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
    hitlQuestionIds: z.array(z.string().min(1)).optional(),
    /** Functional-graph node that owns the leaf file. Loop copy cannot set this. */
    featureNodeId: z.string().min(1).optional(),
    /** Run attached to the current implement or fix node. */
    activeRunId: z.string().min(1).optional(),
    activeRunNodeId: z.string().min(1).optional(),
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

export const LoopComposerModeSchema = z.enum(["ask", "edit"]);

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

export const LoopPendingGraphEditOfferSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    createdAt: z.string().min(1),
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
  })
  .strict();

export const LoopAuthoringTurnRequestSchema = z
  .object({
    mode: LoopComposerModeSchema,
    text: z.string().trim().min(1).max(4000),
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
export type LoopSpec = z.infer<typeof LoopSpecSchema>;
export type LoopSpecNode = z.infer<typeof LoopSpecNodeSchema>;
export type LoopSpecEdge = z.infer<typeof LoopSpecEdgeSchema>;
export type LoopInstance = z.infer<typeof LoopInstanceSchema>;
export type LoopInstanceEvent = z.infer<typeof LoopInstanceEventSchema>;
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

/** Fill authoring fields missing on older on-disk documents before strict parse. */
export function normalizeLoopGraphDocument(raw: unknown): LoopGraphDocument {
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return LoopGraphDocumentSchema.parse({
    ...base,
    composerMode: base.composerMode ?? "ask",
    authoringThread: Array.isArray(base.authoringThread) ? base.authoringThread : [],
    authoringTrace:
      base.authoringTrace && typeof base.authoringTrace === "object"
        ? base.authoringTrace
        : emptyAuthoringTrace(),
    draftHistory: Array.isArray(base.draftHistory)
      ? base.draftHistory.slice(0, LOOP_DRAFT_HISTORY_MAX)
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
  if (draft.nodes.length === 0) {
    issues.push({ path: "nodes", message: "At least one node is required" });
    return issues;
  }
  for (const node of draft.nodes) {
    if (!node.prompt.trim()) {
      issues.push({
        path: `nodes.${node.id}.prompt`,
        message: `Node "${node.title}" needs a description`,
      });
    }
  }
  for (const edge of draft.edges) {
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
  if (node.role && node.role !== "unknown") return node.role;
  const text = `${node.title}\n${node.prompt}`.toLowerCase();
  if (/verify|test|验收|验证|check/.test(text)) return "verify";
  if (/fix|repair|修复|重试/.test(text)) return "fix";
  if (/decide|choose|确认|选择/.test(text)) return "decide";
  if (/implement|build|实现|开发|add|做/.test(text)) return "implement";
  return "implement";
}

export function suggestIntentEdgeKind(
  edge: Pick<IntentGraphEdge, "kind" | "source" | "target">,
  nodes: IntentGraphNode[],
): IntentEdgeKind {
  if (edge.kind) return edge.kind;
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  if (!source || !target) return "depends";
  const sourceRole = suggestIntentNodeRole(source);
  const targetRole = suggestIntentNodeRole(target);
  if (
    (sourceRole === "verify" || sourceRole === "decide") &&
    (targetRole === "implement" || targetRole === "fix")
  ) {
    return "feedback";
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
  } else if (doc.instances.some((item) => item.status === "complete")) {
    status = "complete";
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

/** Approve only linear depends-chain + at most one feedback edge + stop_policy. */
export function validateLoopSpecTopology(spec: LoopSpec): LoopTopologyIssue[] {
  const issues: LoopTopologyIssue[] = [];
  const nodeIds = new Set(spec.nodes.map((node) => node.id));

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

  if (feedback.length > 1) {
    issues.push({
      path: "edges",
      message: "At most one feedback edge is allowed in MVP",
    });
  }

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  for (const node of spec.nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, 0);
  }
  for (const edge of depends) {
    outgoing.get(edge.from)?.push(edge.to);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }

  for (const [id, outs] of outgoing) {
    if (outs.length > 1) {
      issues.push({
        path: `nodes.${id}`,
        message: "Depends edges must form a single linear chain (outdegree ≤ 1)",
      });
    }
  }
  for (const [id, count] of incoming) {
    if (count > 1) {
      issues.push({
        path: `nodes.${id}`,
        message: "Depends edges must form a single linear chain (indegree ≤ 1)",
      });
    }
  }

  const entries = spec.nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0);
  if (spec.nodes.length > 0 && entries.length !== 1) {
    issues.push({
      path: "nodes",
      message: "Depends chain must have exactly one entry node",
    });
  }

  if (feedback.length === 1) {
    const edge = feedback[0]!;
    const fromNode = spec.nodes.find((node) => node.id === edge.from);
    const toNode = spec.nodes.find((node) => node.id === edge.to);
    if (fromNode && fromNode.role !== "verify" && fromNode.role !== "decide") {
      issues.push({
        path: `edges.${edge.id}`,
        message: "Feedback edge should start from a verify or decide node",
      });
    }
    if (toNode && toNode.role !== "implement" && toNode.role !== "fix") {
      issues.push({
        path: `edges.${edge.id}`,
        message: "Feedback edge should target an implement or fix node",
      });
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
