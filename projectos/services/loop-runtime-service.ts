import { randomUUID } from "node:crypto";

import {
  trimLoopInstanceEvents,
  type LoopGraphDocument,
  type LoopHitlAnswer,
  type LoopInstance,
  type LoopInstanceEvent,
  type LoopSpec,
  type LoopSpecNode,
  validateLoopSpecTopology,
} from "../contracts/loop-graph.js";
import {
  LOOP_FILES_NOT_ATTACHED,
  LOOP_VERIFICATION_NOT_RUN,
  type LoopExecutionHooks,
  type LoopGithubOperationResult,
} from "./loop-execution.js";
import { getLoopGraph, upsertLoopGraph } from "./loop-graph-service.js";
import {
  buildChangeSetFromRun,
  buildCoderGoal,
  buildHeuristicDevPlan,
  buildHeuristicReviewResult,
  isPlannerAgent,
  isReviewerAgent,
} from "./loop-agent-roles.js";
import {
  isHighRiskTerminalCommand,
  parseTerminalExecCommand,
} from "./loop-terminal-action.js";
import {
  architectureOf,
  conditionalOutgoing,
  controlIncomingIds,
  dependsIncoming,
  dependsOutgoingMap,
  effectiveMaxIterations,
  evidenceToTestReport,
  feedbackEdge,
  findRequestChangesTarget,
  humanQuestionId,
  isActionNode,
  isAgentNode,
  isHumanNode,
  isLogicNode,
  isTestActionNode,
  latestArtifact,
  matchConditionBranch,
  nodeCompleted,
  parseHumanModeFromQuestionId,
  pushArtifact,
  resolveTestStatus,
} from "./loop-runtime-architecture.js";

export type { LoopExecutionHooks } from "./loop-execution.js";

function nowIso(): string {
  return new Date().toISOString();
}

function pushEvent(
  instance: LoopInstance,
  event: Omit<LoopInstanceEvent, "id" | "at"> & { at?: string },
): LoopInstance {
  const nextEvent: LoopInstanceEvent = {
    id: `evt_${randomUUID()}`,
    at: event.at ?? nowIso(),
    type: event.type,
    nodeId: event.nodeId,
    message: event.message,
    ...(event.agentRunId ? { agentRunId: event.agentRunId } : {}),
    ...(event.evidenceId ? { evidenceId: event.evidenceId } : {}),
  };
  return {
    ...instance,
    events: trimLoopInstanceEvents([...instance.events, nextEvent]),
    updatedAt: nextEvent.at,
  };
}

function cloneSpecAsPendingDraft(spec: LoopSpec, reason: string): LoopSpec {
  const copy = structuredClone(spec);
  const assumptions = [
    ...(copy.assumptions ?? []),
    {
      id: `assume_${randomUUID()}`,
      text: reason.slice(0, 500),
    },
  ].slice(-30);
  return {
    ...copy,
    version: `draft_${randomUUID()}`,
    createdAt: nowIso(),
    assumptions,
  };
}

/**
 * Record a spec revision that still needs approval.
 * The running instance keeps `specVersion` and its current node set.
 */
function attachPendingSpecDraft(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  reason: string,
): { doc: LoopGraphDocument; instance: LoopInstance } {
  const specDraft = cloneSpecAsPendingDraft(spec, reason);
  const compiledAt = specDraft.createdAt;
  const nextInstance = pushEvent(
    {
      ...instance,
      status: "awaiting_hitl",
      hitlQuestionIds: ["spec_revision"],
    },
    {
      type: "awaiting_hitl",
      nodeId: instance.cursorNodeId ?? undefined,
      message: `Proposed spec draft ${specDraft.version}; running spec remains ${instance.specVersion}`,
    },
  );
  return {
    instance: nextInstance,
    doc: {
      ...doc,
      pendingCompile: {
        specDraft,
        assumptions: specDraft.assumptions ?? [],
        cycleGates: specDraft.cycleGates ?? [],
        compiledAt,
      },
    },
  };
}

function entryNodeId(spec: LoopSpec): string {
  const incoming = controlIncomingIds(spec);
  const entry = spec.nodes.find((node) => !incoming.has(node.id));
  return entry?.id ?? spec.nodes[0]!.id;
}

function feedbackTarget(spec: LoopSpec): { from: string; to: string } | null {
  const edge = feedbackEdge(spec);
  return edge ? { from: edge.from, to: edge.to } : null;
}

function findSpec(doc: LoopGraphDocument, specVersion: string): LoopSpec | undefined {
  return doc.approvedSpecs.find((spec) => spec.version === specVersion);
}

function replaceInstance(doc: LoopGraphDocument, instance: LoopInstance): LoopGraphDocument {
  return {
    ...doc,
    instances: doc.instances.map((item) => (item.id === instance.id ? instance : item)),
  };
}

const STEPPABLE = new Set(["queued", "running", "awaiting_review"]);

function failNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  nodeId: string,
  message: string,
): LoopGraphDocument {
  const next = pushEvent(
    {
      ...instance,
      status: "error",
      errorMessage: message.slice(0, 1000),
      completedAt: nowIso(),
    },
    { type: "node_failed", nodeId, message },
  );
  return replaceInstance(doc, next);
}

function isImplementRole(role: string): role is "implement" | "fix" {
  return role === "implement" || role === "fix";
}

/**
 * One scheduler tick. Updates only the instance (cursor, round, events, status).
 * Approved specs stay frozen. A replan writes `pendingCompile` and waits;
 * it does not switch `specVersion`.
 * Dispatch prefers architecture `type`, then legacy roles.
 */
export function stepLoopInstance(
  doc: LoopGraphDocument,
  instanceId: string,
  options?: { execution?: LoopExecutionHooks },
): LoopGraphDocument {
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance) throw new Error(`Instance not found: ${instanceId}`);
  if (!STEPPABLE.has(instance.status)) {
    return doc;
  }
  // Async GitHub settle owns the cursor until completePendingGithubOp advances.
  if (instance.pendingGithubOp) {
    return doc;
  }

  const spec = findSpec(doc, instance.specVersion);
  if (!spec) throw new Error(`Spec not found: ${instance.specVersion}`);
  const execution = options?.execution;

  let next = instance.status === "queued"
    ? pushEvent({ ...instance, status: "running" }, { type: "started" })
    : instance;

  const cursor = next.cursorNodeId ?? entryNodeId(spec);
  const node = spec.nodes.find((item) => item.id === cursor);
  if (!node) {
    next = pushEvent(
      { ...next, status: "error", errorMessage: `Missing node ${cursor}`, completedAt: nowIso() },
      { type: "errored", message: `Missing node ${cursor}` },
    );
    return replaceInstance(doc, next);
  }

  // After HITL resolve on human/decide, advance (unless resolveLoopHitl already redirected).
  if (
    isHumanNode(node) &&
    next.events.at(-1)?.type === "hitl_resolved" &&
    !next.hitlQuestionIds?.length
  ) {
    return advanceCursor(doc, { ...next, cursorNodeId: cursor }, spec, cursor);
  }

  if (isLogicNode(node)) {
    return stepLogicNode(doc, next, spec, node, execution);
  }

  if (isActionNode(node) || isTestActionNode(node)) {
    if (isTestActionNode(node)) {
      return stepVerifyNode(doc, next, spec, node, execution);
    }
    return stepActionNode(doc, next, spec, node, execution);
  }

  if (isHumanNode(node) && !isImplementRole(node.role) && !isAgentNode(node)) {
    return stepHumanNode(doc, next, node);
  }

  if (isAgentNode(node) || isImplementRole(node.role)) {
    if (isPlannerAgent(node)) {
      return stepPlannerNode(doc, next, spec, node);
    }
    if (isReviewerAgent(node)) {
      return stepReviewerNode(doc, next, spec, node);
    }
    return stepImplementNode(doc, next, spec, node, execution);
  }

  if (node.role === "verify") {
    return stepVerifyNode(doc, next, spec, node, execution);
  }

  return failNode(doc, next, cursor, `Unsupported loop node ${node.id}`);
}

function stepPlannerNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
): LoopGraphDocument {
  let next = pushEvent(
    { ...instance, cursorNodeId: node.id, status: "running" },
    { type: "node_entered", nodeId: node.id, message: node.goal },
  );

  const plan = buildHeuristicDevPlan({
    goal: spec.goal,
    nodeGoal: node.goal,
    constraints: node.constraints,
  });

  next = pushArtifact(next, {
    nodeId: node.id,
    kind: "dev_plan",
    data: plan,
  });
  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: `Planner emitted DevPlan with ${plan.tasks.length} tasks`,
  });
  return advanceCursor(doc, next, spec, node.id);
}

function stepReviewerNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
): LoopGraphDocument {
  let next = pushEvent(
    { ...instance, cursorNodeId: node.id, status: "running" },
    { type: "node_entered", nodeId: node.id, message: node.goal },
  );

  const result = buildHeuristicReviewResult(next);
  next = pushArtifact(next, {
    nodeId: node.id,
    kind: "review_result",
    data: result,
  });

  if (result.verdict === "blocked") {
    next = pushEvent(
      {
        ...next,
        status: "awaiting_hitl",
        hitlQuestionIds: [`human_review_${node.id}`],
      },
      {
        type: "awaiting_hitl",
        nodeId: node.id,
        message: result.summary ?? "Review blocked",
      },
    );
    return replaceInstance(doc, next);
  }

  if (result.verdict === "needs_changes") {
    const target = findRequestChangesTarget(spec, node.id);
    if (!target) {
      return failNode(
        doc,
        next,
        node.id,
        "Reviewer needs_changes but no coder/planner target",
      );
    }
    const attempts = (next.attemptCounts[target] ?? 0) + 1;
    const max = effectiveMaxIterations(spec, target);
    if (attempts > max) {
      next = pushEvent(
        {
          ...next,
          status: "awaiting_hitl",
          attemptCounts: { ...next.attemptCounts, [target]: attempts },
          hitlQuestionIds: ["stop_policy"],
        },
        {
          type: "awaiting_hitl",
          nodeId: node.id,
          message: `Reviewer retries exhausted (${max})`,
        },
      );
      return replaceInstance(doc, next);
    }
    next = pushEvent(next, {
      type: "node_completed",
      nodeId: node.id,
      message: `Reviewer needs_changes → ${target}`,
    });
    return replaceInstance(doc, {
      ...next,
      cursorNodeId: target,
      round: next.round + 1,
      attemptCounts: { ...next.attemptCounts, [target]: attempts },
      activeRunId: undefined,
      activeRunNodeId: undefined,
      status: "running",
      updatedAt: nowIso(),
    });
  }

  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: result.summary ?? "Reviewer passed",
  });
  return advanceCursor(doc, next, spec, node.id);
}

function stepLogicNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
  execution: LoopExecutionHooks | undefined,
): LoopGraphDocument {
  const arch = architectureOf(node);
  const kind = arch.logicKind ?? "condition";

  if (kind === "condition") {
    return stepConditionNode(doc, instance, spec, node, execution);
  }
  if (kind === "exit") {
    return stepExitNode(doc, instance, node);
  }
  if (kind === "merge") {
    return stepMergeNode(doc, instance, spec, node);
  }
  if (kind === "loop") {
    return stepLoopLogicNode(doc, instance, spec, node);
  }

  return failNode(
    doc,
    instance,
    node.id,
    `Unsupported logic kind ${kind}`,
  );
}

function stepConditionNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
  execution: LoopExecutionHooks | undefined,
): LoopGraphDocument {
  let next = pushEvent(
    { ...instance, cursorNodeId: node.id, status: "running" },
    { type: "node_entered", nodeId: node.id, message: node.goal },
  );

  const status = resolveTestStatus(next, execution);
  if (!status) {
    return failNode(
      doc,
      next,
      node.id,
      "Condition has no TestReport/evidence to branch on",
    );
  }

  const edges = conditionalOutgoing(spec, node.id);
  const matched = matchConditionBranch(status, edges);
  if (!matched) {
    return failNode(
      doc,
      next,
      node.id,
      `Condition status "${status}" matched no conditional branch`,
    );
  }

  const branchKey = (matched.branchKey ?? "").toLowerCase();
  const isFailBranch = ["fail", "failed", "false", "no", "error"].includes(branchKey);
  const attempts = isFailBranch
    ? (next.attemptCounts[matched.to] ?? 0) + 1
    : (next.attemptCounts[matched.to] ?? 0);
  const max = effectiveMaxIterations(spec, matched.to);
  if (isFailBranch && attempts > max) {
    next = pushEvent(
      {
        ...next,
        status: "awaiting_hitl",
        attemptCounts: {
          ...next.attemptCounts,
          [matched.to]: attempts,
        },
        hitlQuestionIds: ["stop_policy"],
      },
      {
        type: "awaiting_hitl",
        nodeId: node.id,
        message: `Condition fail retries exhausted (${max})`,
      },
    );
    return replaceInstance(doc, next);
  }

  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: `Condition branched ${matched.branchKey} (${status})`,
  });
  return replaceInstance(doc, {
    ...next,
    cursorNodeId: matched.to,
    round: isFailBranch ? next.round + 1 : next.round,
    attemptCounts: isFailBranch
      ? { ...next.attemptCounts, [matched.to]: attempts }
      : next.attemptCounts,
    activeRunId: isFailBranch ? undefined : next.activeRunId,
    activeRunNodeId: isFailBranch ? undefined : next.activeRunNodeId,
    updatedAt: nowIso(),
  });
}

function stepLoopLogicNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
): LoopGraphDocument {
  const max = node.maxIterations ?? effectiveMaxIterations(spec, node.id);
  const current = (instance.loopIterations?.[node.id] ?? 0) + 1;
  let next: LoopInstance = {
    ...instance,
    cursorNodeId: node.id,
    loopIterations: {
      ...(instance.loopIterations ?? {}),
      [node.id]: current,
    },
  };
  next = pushEvent(next, {
    type: "node_entered",
    nodeId: node.id,
    message: `Loop iteration ${current}/${max}`,
  });

  if (current > max) {
    next = pushEvent(
      {
        ...next,
        status: "awaiting_hitl",
        hitlQuestionIds: ["loop_max_iterations"],
      },
      {
        type: "awaiting_hitl",
        nodeId: node.id,
        message: `Loop maxIterations (${max}) reached`,
      },
    );
    return replaceInstance(doc, next);
  }

  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: `Loop continue iteration ${current}`,
  });
  return advanceCursor(doc, next, spec, node.id);
}

function stepExitNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  node: LoopSpecNode,
): LoopGraphDocument {
  const artifactKinds = (instance.artifacts ?? [])
    .map((item) => item.kind)
    .join(", ");
  let next = pushEvent(
    { ...instance, cursorNodeId: node.id },
    { type: "node_entered", nodeId: node.id, message: node.goal },
  );
  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: artifactKinds
      ? `Exit with artifacts: ${artifactKinds}`
      : "Exit workflow",
  });
  next = pushEvent(
    {
      ...next,
      status: "complete",
      completedAt: nowIso(),
      cursorNodeId: node.id,
    },
    { type: "completed", message: "Loop complete via Exit node" },
  );
  return replaceInstance(doc, next);
}

function stepMergeNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
): LoopGraphDocument {
  let next = pushEvent(
    { ...instance, cursorNodeId: node.id, status: "running" },
    { type: "node_entered", nodeId: node.id, message: node.goal },
  );
  const parents = dependsIncoming(spec, node.id);
  const missing = parents.filter((parentId) => !nodeCompleted(next, parentId));
  if (missing.length > 0) {
    next = pushEvent(next, {
      type: "message",
      nodeId: node.id,
      message: `Merge waiting for: ${missing.join(", ")}`,
    });
    // Single-active-run MVP: cannot complete missing parents later in parallel.
    // Stay running so advance can re-check; if still missing after parents should
    // have finished, treat as blocked HITL.
    if (parents.length > 0 && missing.length === parents.length) {
      next = pushEvent(
        {
          ...next,
          status: "awaiting_hitl",
          hitlQuestionIds: ["merge_blocked"],
        },
        {
          type: "awaiting_hitl",
          nodeId: node.id,
          message: "Merge has no completed inbound branches",
        },
      );
    }
    return replaceInstance(doc, next);
  }

  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: `Merge joined ${parents.length || 0} branches`,
  });
  return advanceCursor(doc, next, spec, node.id);
}

function stepHumanNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  node: LoopSpecNode,
): LoopGraphDocument {
  const arch = architectureOf(node);
  const mode = arch.humanMode ?? "approval";
  const questionId = humanQuestionId(node);
  const next = pushEvent(
    {
      ...instance,
      cursorNodeId: node.id,
      status: "awaiting_hitl",
      hitlQuestionIds: [questionId],
    },
    {
      type: "node_entered",
      nodeId: node.id,
      message: node.goal,
    },
  );
  return replaceInstance(
    doc,
    pushEvent(next, {
      type: "awaiting_hitl",
      nodeId: node.id,
      message: `Waiting for human ${mode}`,
    }),
  );
}

function stepActionNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
  execution: LoopExecutionHooks | undefined,
): LoopGraphDocument {
  const arch = architectureOf(node);
  let next = pushEvent(
    { ...instance, cursorNodeId: node.id, status: "running" },
    { type: "node_entered", nodeId: node.id, message: node.goal },
  );

  const requiresApproval =
    arch.actionIntegration === "github" ||
    arch.actionIntegration === "terminal" ||
    spec.permissions.some(
      (perm) =>
        perm.requiresApproval &&
        (perm.action.includes(arch.actionOperation ?? "") ||
          perm.action.includes(arch.actionIntegration ?? "")),
    );

  const approvedPayload = next.pendingActionPayload;
  const approvedDecision = latestArtifact(next, "human_decision");
  const hasApproval =
    Boolean(approvedPayload) ||
    (approvedDecision &&
      typeof approvedDecision.data === "object" &&
      approvedDecision.data !== null &&
      /approve/i.test(String((approvedDecision.data as { choice?: string }).choice ?? "")));

  if (requiresApproval && !hasApproval) {
    next = pushEvent(
      {
        ...next,
        status: "awaiting_hitl",
        hitlQuestionIds: [`human_approval_${node.id}`],
      },
      {
        type: "awaiting_hitl",
        nodeId: node.id,
        message: `Action ${arch.actionOperation ?? arch.actionIntegration} requires approval`,
      },
    );
    return replaceInstance(doc, next);
  }

  const payload = approvedPayload ?? {
    operation: arch.actionOperation ?? "run",
    integration: arch.actionIntegration,
  };

  if (arch.actionIntegration === "github") {
    return stepGithubAction(doc, next, spec, node, execution, payload);
  }
  if (arch.actionIntegration === "terminal") {
    return stepTerminalAction(doc, next, spec, node, execution, payload, hasApproval);
  }

  next = pushArtifact(next, {
    nodeId: node.id,
    kind: "change_set",
    data: {
      files: [],
      summary: `Executed ${arch.actionIntegration}.${arch.actionOperation}`,
    },
  });
  next = {
    ...next,
    pendingActionPayload: undefined,
  };
  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: `Action ${arch.actionIntegration}.${arch.actionOperation} completed`,
  });
  return advanceCursor(doc, next, spec, node.id);
}

function stepGithubAction(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
  execution: LoopExecutionHooks | undefined,
  payload: Record<string, unknown>,
): LoopGraphDocument {
  const arch = architectureOf(node);
  const operation = arch.actionOperation ?? "create_pr";
  let githubResult: LoopGithubOperationResult = {
    ok: true,
    simulated: true,
    message: "Simulated GitHub action (MVP)",
    refs: Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [key, String(value)]),
    ),
  };

  if (execution?.executeGithubOperation) {
    try {
      githubResult = execution.executeGithubOperation({ operation, payload });
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitHub operation failed";
      return failNode(doc, instance, node.id, message);
    }
  }

  if (githubResult.deferred) {
    let next = {
      ...instance,
      pendingActionPayload: undefined,
      pendingGithubOp: {
        nodeId: node.id,
        operation,
        payload,
        queuedAt: nowIso(),
      },
      status: "running" as const,
    };
    next = pushEvent(next, {
      type: "message",
      nodeId: node.id,
      message: githubResult.message ?? `GitHub ${operation} queued for settle`,
    });
    return replaceInstance(doc, next);
  }

  if (!githubResult.ok) {
    return failNode(
      doc,
      instance,
      node.id,
      githubResult.message || "GitHub operation failed",
    );
  }

  let next = pushArtifact(instance, {
    nodeId: node.id,
    kind: "github_op_result",
    data: {
      operation,
      ok: true,
      ...(githubResult.url ? { url: githubResult.url } : {}),
      ...(typeof githubResult.number === "number" ? { number: githubResult.number } : {}),
      ...(githubResult.refs ? { refs: githubResult.refs } : {}),
      message: githubResult.message,
    },
  });
  next = {
    ...next,
    pendingActionPayload: undefined,
    pendingGithubOp: undefined,
  };
  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: `Action github.${operation} completed`,
  });
  return advanceCursor(doc, next, spec, node.id);
}

function stepTerminalAction(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode,
  execution: LoopExecutionHooks | undefined,
  payload: Record<string, unknown>,
  hasApproval: boolean,
): LoopGraphDocument {
  const parsed = parseTerminalExecCommand({
    payload,
    nodeGoal: node.goal,
  });
  const commandLine = [parsed.command, ...parsed.args].join(" ");

  if (isHighRiskTerminalCommand(commandLine) && !hasApproval) {
    return replaceInstance(
      doc,
      pushEvent(
        {
          ...instance,
          status: "awaiting_hitl",
          hitlQuestionIds: [`human_approval_${node.id}`],
        },
        {
          type: "awaiting_hitl",
          nodeId: node.id,
          message: `High-risk terminal command requires approval: ${commandLine.slice(0, 160)}`,
        },
      ),
    );
  }

  if (!execution?.executeTerminalCommand) {
    let next = pushArtifact(instance, {
      nodeId: node.id,
      kind: "change_set",
      data: {
        files: [],
        summary: `Terminal policy-gated (no executor): ${commandLine.slice(0, 240)}`,
      },
    });
    next = { ...next, pendingActionPayload: undefined };
    next = pushEvent(next, {
      type: "node_completed",
      nodeId: node.id,
      message: `Action terminal.exec completed (dry)`,
    });
    return advanceCursor(doc, next, spec, node.id);
  }

  let result;
  try {
    result = execution.executeTerminalCommand({
      command: parsed.command,
      args: parsed.args,
      timeoutMs: parsed.timeoutMs,
      ...(typeof payload.cwd === "string" ? { cwd: payload.cwd } : {}),
      approved: hasApproval,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terminal execution failed";
    return failNode(doc, instance, node.id, message);
  }

  if (result.policyDenied) {
    return failNode(doc, instance, node.id, result.message || "Terminal policy_denied");
  }
  if (result.blocked || result.timedOut) {
    let next = pushEvent(
      {
        ...instance,
        status: "awaiting_hitl",
        hitlQuestionIds: ["terminal_blocked"],
      },
      {
        type: "awaiting_hitl",
        nodeId: node.id,
        message: result.message || "Terminal blocked / timed out",
      },
    );
    next = pushArtifact(next, {
      nodeId: node.id,
      kind: "change_set",
      data: {
        files: [],
        summary: result.message,
        problems: [result.message],
      },
    });
    return replaceInstance(doc, next);
  }
  if (!result.ok) {
    return failNode(doc, instance, node.id, result.message || "Terminal command failed");
  }

  let next = pushArtifact(instance, {
    nodeId: node.id,
    kind: "change_set",
    data: {
      files: [],
      summary: result.message.slice(0, 500),
    },
  });
  next = { ...next, pendingActionPayload: undefined };
  next = pushEvent(next, {
    type: "node_completed",
    nodeId: node.id,
    message: `Action terminal.exec completed (exit ${result.exitCode ?? 0})`,
  });
  return advanceCursor(doc, next, spec, node.id);
}

/**
 * Finish a deferred GitHub Action after async settle (REST / gh).
 * Clears `pendingGithubOp`, writes GitHubOpResult, and advances.
 */
export function completePendingGithubOp(
  doc: LoopGraphDocument,
  instanceId: string,
  result: LoopGithubOperationResult,
): LoopGraphDocument {
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance?.pendingGithubOp) return doc;
  const spec = findSpec(doc, instance.specVersion);
  if (!spec) throw new Error(`Spec not found: ${instance.specVersion}`);

  const pending = instance.pendingGithubOp;
  if (!result.ok) {
    return failNode(
      doc,
      {
        ...instance,
        pendingGithubOp: undefined,
      },
      pending.nodeId,
      result.message || "GitHub operation failed",
    );
  }

  let next = pushArtifact(
    { ...instance, pendingGithubOp: undefined },
    {
      nodeId: pending.nodeId,
      kind: "github_op_result",
      data: {
        operation: pending.operation,
        ok: true,
        ...(result.url ? { url: result.url } : {}),
        ...(typeof result.number === "number" ? { number: result.number } : {}),
        ...(result.refs ? { refs: result.refs } : {}),
        message: result.message,
      },
    },
  );
  next = pushEvent(next, {
    type: "node_completed",
    nodeId: pending.nodeId,
    message: `Action github.${pending.operation} completed`,
  });
  return advanceCursor(doc, next, spec, pending.nodeId);
}

function stepImplementNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpec["nodes"][number],
  execution: LoopExecutionHooks | undefined,
): LoopGraphDocument {
  const polling = instance.activeRunId && instance.activeRunNodeId === node.id;
  const bound = buildCoderGoal({ node, instance, specGoal: spec.goal });
  let next = polling
    ? { ...instance, cursorNodeId: node.id }
    : pushEvent({ ...instance, cursorNodeId: node.id }, {
        type: "node_entered",
        nodeId: node.id,
        message: bound.task
          ? `Coder task ${bound.task.id}: ${bound.task.title}`
          : node.goal,
      });

  let run = polling && next.activeRunId
    ? execution?.readRun(next.activeRunId) ?? null
    : null;

  if (!polling) {
    const leaf = execution?.leaf ?? null;
    if (!leaf || !execution) {
      return failNode(doc, next, node.id, LOOP_FILES_NOT_ATTACHED);
    }
    const implementRole: "implement" | "fix" =
      node.role === "fix" || node.repairMode ? "fix" : "implement";
    try {
      run = execution.startAgentRun({
        specNodeId: node.id,
        role: implementRole,
        featureNodeId: leaf.featureNodeId,
        filePath: leaf.filePath,
        goal: bound.goal,
        ...(bound.task ? { taskId: bound.task.id } : {}),
        agentRole: "coder",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : LOOP_FILES_NOT_ATTACHED;
      return failNode(doc, next, node.id, message);
    }
    next = {
      ...next,
      activeRunId: run.runId,
      activeRunNodeId: node.id,
      featureNodeId: leaf.featureNodeId,
    };
  }

  if (!run || !next.activeRunId) {
    return failNode(doc, next, node.id, LOOP_FILES_NOT_ATTACHED);
  }

  if (run.status === "queued" || run.status === "running") {
    return replaceInstance(doc, { ...next, status: "running" });
  }
  if (run.status === "interrupted") {
    return replaceInstance(doc, pushEvent(
      { ...next, status: "paused" },
      {
        type: "paused",
        nodeId: node.id,
        message: `Agent run ${run.runId} interrupted`,
        agentRunId: run.runId,
      },
    ));
  }
  if (run.status === "awaiting_review") {
    return replaceInstance(doc, { ...next, status: "awaiting_review" });
  }
  if (run.status === "complete" && run.applySucceeded) {
    const leafPath = execution?.leaf?.filePath ?? "unknown";
    const changeSet = buildChangeSetFromRun({
      filePath: leafPath,
      goal: bound.goal,
      agentRunId: run.runId,
      task: bound.task,
    });
    next = pushArtifact(next, {
      nodeId: node.id,
      kind: "change_set",
      data: changeSet,
    });
    if (bound.task) {
      next = {
        ...next,
        attemptCounts: {
          ...next.attemptCounts,
          [bound.task.id]: (next.attemptCounts[bound.task.id] ?? 0) + 1,
        },
      };
    }
    next = pushEvent(next, {
      type: "node_completed",
      nodeId: node.id,
      message: bound.task
        ? `Coder applied ${bound.task.id} via ${run.runId}`
        : `Agent run ${run.runId} applied`,
      agentRunId: run.runId,
    });
    return advanceCursor(doc, next, spec, node.id);
  }

  return failNode(
    doc,
    next,
    node.id,
    run.status === "cancelled"
      ? `Agent run ${run.runId} cancelled`
      : `Agent run ${run.runId} did not apply`,
  );
}

function stepVerifyNode(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  node: LoopSpecNode | string,
  execution: LoopExecutionHooks | undefined,
): LoopGraphDocument {
  const nodeId = typeof node === "string" ? node : node.id;
  const specNode =
    typeof node === "string"
      ? spec.nodes.find((item) => item.id === node)
      : node;

  const last = instance.events.at(-1);
  let working =
    last?.type === "node_entered" && last.nodeId === nodeId
      ? { ...instance, cursorNodeId: nodeId }
      : pushEvent(
          { ...instance, cursorNodeId: nodeId },
          { type: "node_entered", nodeId, message: specNode?.goal ?? "Verify" },
        );

  const evidence = working.activeRunId
    ? execution?.readEvidence(working.activeRunId) ?? null
    : null;
  if (!evidence || evidence.status === "not_run" || evidence.runId !== working.activeRunId) {
    const next = pushEvent(
      {
        ...working,
        status: "awaiting_hitl",
        hitlQuestionIds: ["verification_not_run"],
      },
      {
        type: "awaiting_hitl",
        nodeId,
        message: LOOP_VERIFICATION_NOT_RUN,
        ...(evidence ? { evidenceId: evidence.id } : {}),
      },
    );
    return replaceInstance(doc, next);
  }

  const report = evidenceToTestReport(evidence, "configured-test");
  if (report) {
    working = pushArtifact(working, {
      nodeId,
      kind: "test_report",
      data: report,
    });
  }

  if (evidence.status === "failed" && spec.retryPolicy.onFailure === "replan") {
    const proposed = attachPendingSpecDraft(
      doc,
      working,
      spec,
      "Verification failed and retry policy is replan. Approve a new spec version before the instance can follow different steps.",
    );
    return replaceInstance(proposed.doc, proposed.instance);
  }

  if (evidence.status === "failed") {
    // Feature Dev style: Test → Condition. Complete with failed report and let Condition branch.
    const nextDependsId = dependsOutgoingMap(spec).get(nodeId);
    const nextDependsNode = nextDependsId
      ? spec.nodes.find((item) => item.id === nextDependsId)
      : undefined;
    if (
      nextDependsNode &&
      architectureOf(nextDependsNode).type === "logic" &&
      architectureOf(nextDependsNode).logicKind === "condition"
    ) {
      const next = pushEvent(working, {
        type: "node_completed",
        nodeId,
        message: "Verification failed (handed to Condition)",
        evidenceId: evidence.id,
        ...(working.activeRunId ? { agentRunId: working.activeRunId } : {}),
      });
      return advanceCursor(doc, next, spec, nodeId);
    }

    // Direct conditional fail edges from this node (rare).
    const failBranch = matchConditionBranch(
      "failed",
      conditionalOutgoing(spec, nodeId),
    );
    if (failBranch) {
      const attempts = (working.attemptCounts[failBranch.to] ?? 0) + 1;
      const max = effectiveMaxIterations(spec, failBranch.to);
      if (attempts > max) {
        const next = pushEvent(
          {
            ...working,
            status: "awaiting_hitl",
            round: working.round + 1,
            attemptCounts: {
              ...working.attemptCounts,
              [failBranch.to]: attempts,
            },
            hitlQuestionIds: ["stop_policy"],
          },
          {
            type: "awaiting_hitl",
            nodeId,
            message: `Retry budget reached (${max})`,
            evidenceId: evidence.id,
          },
        );
        return replaceInstance(doc, next);
      }
      const next = pushEvent(
        {
          ...working,
          round: working.round + 1,
          cursorNodeId: failBranch.to,
          activeRunId: undefined,
          activeRunNodeId: undefined,
          attemptCounts: {
            ...working.attemptCounts,
            [failBranch.to]: attempts,
          },
        },
        {
          type: "feedback_taken",
          nodeId,
          message: `Retry via condition fail → ${failBranch.to} (attempt ${attempts})`,
          evidenceId: evidence.id,
        },
      );
      return replaceInstance(doc, next);
    }

    const fb = feedbackTarget(spec);
    const round = working.round + 1;
    if (!fb || fb.from !== nodeId) {
      return failNode(doc, working, nodeId, "Verification failed without feedback edge");
    }
    const target = spec.nodes.find((item) => item.id === fb.to);
    if (!target || !isImplementRole(target.role)) {
      return failNode(doc, working, nodeId, "Feedback target is not an implement node");
    }
    const attempts = (working.attemptCounts[fb.to] ?? 0) + 1;
    const max = effectiveMaxIterations(spec, fb.to);
    if (round > spec.stopPolicy.maxRounds || attempts > max) {
      const next = pushEvent(
        {
          ...working,
          status: "awaiting_hitl",
          round,
          attemptCounts: {
            ...working.attemptCounts,
            [fb.to]: attempts,
          },
          hitlQuestionIds: ["stop_policy"],
        },
        {
          type: "awaiting_hitl",
          nodeId,
          message: `Stop policy reached (${Math.min(spec.stopPolicy.maxRounds, max)} rounds)`,
          evidenceId: evidence.id,
        },
      );
      return replaceInstance(doc, next);
    }
    const next = pushEvent(
      {
        ...working,
        round,
        cursorNodeId: fb.to,
        activeRunId: undefined,
        activeRunNodeId: undefined,
        attemptCounts: {
          ...working.attemptCounts,
          [fb.to]: attempts,
        },
      },
      {
        type: "feedback_taken",
        nodeId,
        message: `Retry via feedback to ${fb.to} (round ${round})`,
        evidenceId: evidence.id,
      },
    );
    return replaceInstance(doc, next);
  }

  const next = pushEvent(working, {
    type: "node_completed",
    nodeId,
    message: "Verification passed",
    evidenceId: evidence.id,
    ...(working.activeRunId ? { agentRunId: working.activeRunId } : {}),
  });
  return advanceCursor(doc, next, spec, nodeId);
}

function advanceCursor(
  doc: LoopGraphDocument,
  instance: LoopInstance,
  spec: LoopSpec,
  cursor: string,
): LoopGraphDocument {
  const nextId = dependsOutgoingMap(spec).get(cursor);
  if (!nextId) {
    const next = pushEvent(
      { ...instance, status: "complete", completedAt: nowIso(), cursorNodeId: cursor },
      { type: "completed", message: "Loop complete" },
    );
    return replaceInstance(doc, next);
  }
  return replaceInstance(doc, { ...instance, cursorNodeId: nextId, updatedAt: nowIso() });
}

function upsertable(doc: LoopGraphDocument, instance: LoopInstance): LoopGraphDocument {
  return replaceInstance(doc, instance);
}

export function startLoopInstance(
  workspaceRoot: string,
  loopId: string,
  specVersion?: string,
  execution?: LoopExecutionHooks,
): LoopGraphDocument {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const spec =
    (specVersion
      ? doc.approvedSpecs.find((item) => item.version === specVersion)
      : doc.approvedSpecs[doc.approvedSpecs.length - 1]) ?? undefined;
  if (!spec) throw new Error("No approved Loop Spec to run");
  const issues = validateLoopSpecTopology(spec);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join("; "));
  }

  const active = doc.instances.find((item) =>
    item.status === "queued" ||
    item.status === "running" ||
    item.status === "paused" ||
    item.status === "awaiting_hitl" ||
    item.status === "awaiting_review",
  );
  if (active) {
    throw new Error("A loop instance is already active");
  }

  const startedAt = nowIso();
  const instance: LoopInstance = {
    id: `inst_${randomUUID()}`,
    specVersion: spec.version,
    status: "queued",
    cursorNodeId: entryNodeId(spec),
    round: 0,
    attemptCounts: {},
    events: [],
    startedAt,
    updatedAt: startedAt,
  };

  let nextDoc: LoopGraphDocument = {
    ...doc,
    instances: [...doc.instances, instance],
  };
  nextDoc = stepLoopInstance(nextDoc, instance.id, { execution });
  return upsertLoopGraph(workspaceRoot, nextDoc);
}

export function pauseLoopInstance(
  workspaceRoot: string,
  loopId: string,
  instanceId: string,
): LoopGraphDocument {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance) throw new Error(`Instance not found: ${instanceId}`);
  if (
    instance.status !== "running" &&
    instance.status !== "queued" &&
    instance.status !== "awaiting_review"
  ) {
    return doc;
  }
  const next = pushEvent({ ...instance, status: "paused" }, {
    type: "paused",
    message: "Paused by user",
  });
  return upsertLoopGraph(workspaceRoot, replaceInstance(doc, next));
}

export function resumeLoopInstance(
  workspaceRoot: string,
  loopId: string,
  instanceId: string,
  execution?: LoopExecutionHooks,
): LoopGraphDocument {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance) throw new Error(`Instance not found: ${instanceId}`);
  if (instance.status !== "paused") return doc;
  let next = pushEvent({ ...instance, status: "running" }, {
    type: "resumed",
    message: "Resumed by user",
  });
  let nextDoc = replaceInstance(doc, next);
  nextDoc = stepLoopInstance(nextDoc, instanceId, { execution });
  return upsertLoopGraph(workspaceRoot, nextDoc);
}

export function resolveLoopHitl(
  workspaceRoot: string,
  loopId: string,
  instanceId: string,
  answers: LoopHitlAnswer[],
  execution?: LoopExecutionHooks,
): LoopGraphDocument {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const instance = doc.instances.find((item) => item.id === instanceId);
  if (!instance) throw new Error(`Instance not found: ${instanceId}`);
  if (instance.status !== "awaiting_hitl") return doc;

  const spec = findSpec(doc, instance.specVersion);
  if (!spec) throw new Error(`Spec not found: ${instance.specVersion}`);

  const summary = answers.map((item) => `${item.questionId}=${item.answer}`).join("; ");
  let next = pushEvent(
    {
      ...instance,
      status: "running",
      hitlQuestionIds: [],
    },
    {
      type: "hitl_resolved",
      nodeId: instance.cursorNodeId ?? undefined,
      message: summary || "HITL resolved",
    },
  );

  // stop_policy / loop_max_iterations HITL: end unless continue
  if (
    instance.hitlQuestionIds?.includes("stop_policy") ||
    instance.hitlQuestionIds?.includes("loop_max_iterations")
  ) {
    const continueAnswer = answers.find((item) =>
      /continue|继续/i.test(item.answer),
    );
    if (!continueAnswer) {
      next = pushEvent(
        {
          ...next,
          status: "error",
          errorMessage: "Stopped after HITL at stop policy",
          completedAt: nowIso(),
        },
        { type: "errored", message: "Stop policy HITL declined continue" },
      );
      return upsertLoopGraph(workspaceRoot, replaceInstance(doc, next));
    }
  }

  if (instance.hitlQuestionIds?.includes("merge_blocked")) {
    const continueAnswer = answers.find((item) =>
      /continue|继续|force/i.test(item.answer),
    );
    if (!continueAnswer) {
      next = pushEvent(
        {
          ...next,
          status: "error",
          errorMessage: "Merge blocked without completed inbound branches",
          completedAt: nowIso(),
        },
        { type: "errored", message: "Merge HITL declined continue" },
      );
      return upsertLoopGraph(workspaceRoot, replaceInstance(doc, next));
    }
  }

  const cursorId = instance.cursorNodeId;
  const cursorNode = cursorId
    ? spec.nodes.find((item) => item.id === cursorId)
    : undefined;
  const humanQuestions = (instance.hitlQuestionIds ?? []).filter(
    (id) => id.startsWith("human_") || id.startsWith("decide_"),
  );

  for (const questionId of humanQuestions) {
    const answer = answers.find((item) => item.questionId === questionId) ?? answers[0];
    if (!answer || !cursorNode) continue;
    const mode = parseHumanModeFromQuestionId(questionId);
    const choice = answer.answer.trim();
    const choiceLower = choice.toLowerCase();

    next = pushArtifact(next, {
      nodeId: cursorNode.id,
      kind: "human_decision",
      data: {
        mode:
          mode === "legacy"
            ? (architectureOf(cursorNode).humanMode ?? "approval")
            : mode,
        choice,
        ...(answer.editedPayload ? { editedPayload: answer.editedPayload } : {}),
        at: nowIso(),
        nodeId: cursorNode.id,
      },
    });

    // Legacy decide_* keeps prior semantics: stepper advances on hitl_resolved only.
    if (mode === "legacy") {
      let nextDoc = replaceInstance(doc, next);
      nextDoc = stepLoopInstance(nextDoc, instanceId, { execution });
      return upsertLoopGraph(workspaceRoot, nextDoc);
    }

    if (mode === "approval") {
      if (/reject|deny|拒绝|驳回/i.test(choiceLower)) {
        next = pushEvent(
          {
            ...next,
            status: "error",
            errorMessage: "Human rejected the action",
            completedAt: nowIso(),
          },
          {
            type: "errored",
            nodeId: cursorNode.id,
            message: "Approval rejected",
          },
        );
        return upsertLoopGraph(workspaceRoot, replaceInstance(doc, next));
      }
      if (answer.editedPayload) {
        next = { ...next, pendingActionPayload: answer.editedPayload };
      } else if (/approve|edit|批准|同意/i.test(choiceLower)) {
        next = {
          ...next,
          pendingActionPayload: next.pendingActionPayload ?? {
            approved: true,
            nodeId: cursorNode.id,
          },
        };
      }

      // Action node self-gated: re-enter Action stepper with approved payload.
      if (isActionNode(cursorNode) && !isTestActionNode(cursorNode)) {
        let nextDoc = replaceInstance(doc, next);
        nextDoc = stepLoopInstance(nextDoc, instanceId, { execution });
        return upsertLoopGraph(workspaceRoot, nextDoc);
      }

      next = pushEvent(next, {
        type: "node_completed",
        nodeId: cursorNode.id,
        message: `Human approval: ${choice}`,
      });
      // Advance now so the following step does not re-enter HITL.
      const advanced = advanceCursor(doc, next, spec, cursorNode.id);
      const advancedInstance = advanced.instances.find((item) => item.id === instanceId);
      if (!advancedInstance) {
        return upsertLoopGraph(workspaceRoot, advanced);
      }
      let nextDoc = replaceInstance(doc, advancedInstance);
      if (STEPPABLE.has(advancedInstance.status)) {
        nextDoc = stepLoopInstance(nextDoc, instanceId, { execution });
      }
      return upsertLoopGraph(workspaceRoot, nextDoc);
    }

    if (mode === "review") {
      if (/reject|拒绝/i.test(choiceLower)) {
        next = pushEvent(
          {
            ...next,
            status: "error",
            errorMessage: "Human review rejected",
            completedAt: nowIso(),
          },
          {
            type: "errored",
            nodeId: cursorNode.id,
            message: "Review rejected",
          },
        );
        return upsertLoopGraph(workspaceRoot, replaceInstance(doc, next));
      }
      if (/request.?changes|changes|修改|返工/i.test(choiceLower)) {
        const target = findRequestChangesTarget(spec, cursorNode.id);
        if (!target) {
          return upsertLoopGraph(
            workspaceRoot,
            failNode(doc, next, cursorNode.id, "Review requested changes but no target"),
          );
        }
        next = pushEvent(next, {
          type: "node_completed",
          nodeId: cursorNode.id,
          message: `Review requested changes → ${target}`,
        });
        next = {
          ...next,
          cursorNodeId: target,
          activeRunId: undefined,
          activeRunNodeId: undefined,
          status: "running",
        };
        let nextDoc = replaceInstance(doc, next);
        nextDoc = stepLoopInstance(nextDoc, instanceId, { execution });
        return upsertLoopGraph(workspaceRoot, nextDoc);
      }
      // accept
      next = pushEvent(next, {
        type: "node_completed",
        nodeId: cursorNode.id,
        message: `Human review accepted: ${choice}`,
      });
      const advanced = advanceCursor(doc, next, spec, cursorNode.id);
      const advancedInstance = advanced.instances.find((item) => item.id === instanceId)!;
      let nextDoc = replaceInstance(doc, advancedInstance);
      if (STEPPABLE.has(advancedInstance.status)) {
        nextDoc = stepLoopInstance(nextDoc, instanceId, { execution });
      }
      return upsertLoopGraph(workspaceRoot, nextDoc);
    }

    if (mode === "input" || mode === "decision") {
      next = {
        ...next,
        pendingActionPayload: {
          ...(next.pendingActionPayload ?? {}),
          input: choice,
          ...(answer.editedPayload ?? {}),
        },
      };
      next = pushEvent(next, {
        type: "node_completed",
        nodeId: cursorNode.id,
        message: `Human input received`,
      });
      const advanced = advanceCursor(doc, next, spec, cursorNode.id);
      const advancedInstance = advanced.instances.find((item) => item.id === instanceId)!;
      let nextDoc = replaceInstance(doc, advancedInstance);
      if (STEPPABLE.has(advancedInstance.status)) {
        nextDoc = stepLoopInstance(nextDoc, instanceId, { execution });
      }
      return upsertLoopGraph(workspaceRoot, nextDoc);
    }
  }

  let nextDoc = replaceInstance(doc, next);
  nextDoc = stepLoopInstance(nextDoc, instanceId, { execution });
  return upsertLoopGraph(workspaceRoot, nextDoc);
}

export function getLoopInstanceEvents(
  workspaceRoot: string,
  loopId: string,
  instanceId: string,
): LoopInstanceEvent[] {
  const doc = getLoopGraph(workspaceRoot, loopId);
  const instance = doc?.instances.find((item) => item.id === instanceId);
  return instance?.events ?? [];
}

export function advanceLoopInstance(
  workspaceRoot: string,
  loopId: string,
  instanceId: string,
  execution?: LoopExecutionHooks,
): LoopGraphDocument {
  const doc = getLoopGraph(workspaceRoot, loopId);
  if (!doc) throw new Error(`Loop graph not found: ${loopId}`);
  const next = stepLoopInstance(doc, instanceId, { execution });
  return upsertLoopGraph(workspaceRoot, next);
}
