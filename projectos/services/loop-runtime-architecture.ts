import { randomUUID } from "node:crypto";

import {
  LoopTestReportSchema,
  type LoopTestReport,
} from "../contracts/loop-artifacts.js";
import {
  withArchitectureDefaults,
  type LoopInstance,
  type LoopInstanceArtifact,
  type LoopSpec,
  type LoopSpecEdge,
  type LoopSpecNode,
} from "../contracts/loop-graph.js";
import type { LoopEvidenceView, LoopExecutionHooks } from "./loop-execution.js";
import {
  invalidatePendingApproval,
  shouldInvalidateApprovalOnArtifactKind,
} from "./loop-approval-binding.js";

export function architectureOf(node: LoopSpecNode) {
  return withArchitectureDefaults(node);
}

export function isLogicNode(node: LoopSpecNode): boolean {
  return architectureOf(node).type === "logic";
}

export function isHumanNode(node: LoopSpecNode): boolean {
  const arch = architectureOf(node);
  // Explicit non-human types win over legacy role=decide (GitHub/Terminal Actions
  // bridge to decide for P-0–P-3, but must not skip Action steppers on HITL).
  if (arch.type === "action" || arch.type === "logic" || arch.type === "agent") {
    return false;
  }
  return arch.type === "human" || node.role === "decide";
}

export function isActionNode(node: LoopSpecNode): boolean {
  return architectureOf(node).type === "action";
}

export function isTestActionNode(node: LoopSpecNode): boolean {
  const arch = architectureOf(node);
  return (
    (arch.type === "action" && arch.actionIntegration === "test") ||
    node.role === "verify"
  );
}

export function isAgentNode(node: LoopSpecNode): boolean {
  const arch = architectureOf(node);
  return (
    arch.type === "agent" ||
    node.role === "implement" ||
    node.role === "fix"
  );
}

export function controlIncomingIds(spec: LoopSpec): Set<string> {
  return new Set(
    spec.edges
      .filter((edge) => edge.kind === "depends" || edge.kind === "conditional")
      .map((edge) => edge.to),
  );
}

/** @deprecated Prefer dependsOutgoingIds — last-edge-wins map breaks Parallel fan-out. */
export function dependsOutgoingMap(spec: LoopSpec): Map<string, string | undefined> {
  const map = new Map<string, string | undefined>();
  for (const node of spec.nodes) map.set(node.id, undefined);
  for (const edge of spec.edges.filter((item) => item.kind === "depends")) {
    map.set(edge.from, edge.to);
  }
  return map;
}

/** All depends successors (Parallel fork may return multiple). */
export function dependsOutgoingIds(spec: LoopSpec, fromId: string): string[] {
  return spec.edges
    .filter((edge) => edge.kind === "depends" && edge.from === fromId)
    .map((edge) => edge.to);
}

export function fallbackOutgoing(spec: LoopSpec, fromId: string): LoopSpecEdge | undefined {
  return spec.edges.find((edge) => edge.kind === "fallback" && edge.from === fromId);
}

export function feedbackEdges(spec: LoopSpec): LoopSpecEdge[] {
  return spec.edges.filter((edge) => edge.kind === "feedback");
}

export function conditionalOutgoing(spec: LoopSpec, fromId: string): LoopSpecEdge[] {
  return spec.edges.filter(
    (edge) => edge.kind === "conditional" && edge.from === fromId,
  );
}

export function dependsIncoming(spec: LoopSpec, toId: string): string[] {
  return spec.edges
    .filter((edge) => edge.kind === "depends" && edge.to === toId)
    .map((edge) => edge.from);
}

export function feedbackEdge(spec: LoopSpec): LoopSpecEdge | undefined {
  return spec.edges.find((item) => item.kind === "feedback");
}

export function pushArtifact(
  instance: LoopInstance,
  artifact: Omit<LoopInstanceArtifact, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  },
): LoopInstance {
  const next: LoopInstanceArtifact = {
    id: artifact.id ?? `art_${randomUUID()}`,
    nodeId: artifact.nodeId,
    kind: artifact.kind,
    createdAt: artifact.createdAt ?? new Date().toISOString(),
    data: artifact.data,
  };
  let withArtifact: LoopInstance = {
    ...instance,
    artifacts: [...(instance.artifacts ?? []), next].slice(-100),
  };
  // Engineering evidence mutation invalidates a delivery-gate approval so
  // side-effect Actions cannot run against a stale ChangeSet/TestReport/Review.
  if (shouldInvalidateApprovalOnArtifactKind(next.kind)) {
    withArtifact = invalidatePendingApproval(
      withArtifact,
      `Engineering artifact updated (${next.kind}); prior approval invalidated`,
    );
  }
  return withArtifact;
}

export function latestArtifact(
  instance: LoopInstance,
  kind: LoopInstanceArtifact["kind"],
  nodeId?: string,
): LoopInstanceArtifact | undefined {
  const list = instance.artifacts ?? [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i]!;
    if (item.kind !== kind) continue;
    if (nodeId && item.nodeId !== nodeId) continue;
    return item;
  }
  return undefined;
}

export function evidenceToTestReport(
  evidence: LoopEvidenceView | null | undefined,
  command?: string,
  validatedCodeDigest?: string,
): LoopTestReport | null {
  if (!evidence) return null;
  const status =
    evidence.status === "passed"
      ? "passed"
      : evidence.status === "failed"
        ? "failed"
        : "not_run";
  return LoopTestReportSchema.parse({
    status,
    evidenceId: evidence.id,
    ...(command ? { command } : {}),
    ...(validatedCodeDigest ? { validatedCodeDigest } : {}),
  });
}

export function resolveTestStatus(
  instance: LoopInstance,
  execution: LoopExecutionHooks | undefined,
): string | null {
  const artifact = latestArtifact(instance, "test_report");
  if (artifact) {
    const parsed = LoopTestReportSchema.safeParse(artifact.data);
    if (parsed.success) return parsed.data.status;
  }
  if (instance.activeRunId && execution) {
    const evidence = execution.readEvidence(instance.activeRunId);
    const report = evidenceToTestReport(evidence);
    if (report) return report.status;
  }
  return null;
}

const PASS_KEYS = new Set(["pass", "passed", "true", "yes", "ok", "success"]);
const FAIL_KEYS = new Set(["fail", "failed", "false", "no", "error"]);

export function matchConditionBranch(
  status: string,
  edges: LoopSpecEdge[],
): LoopSpecEdge | null {
  const normalized = status.trim().toLowerCase();
  const withKeys = edges.filter((edge) => edge.branchKey?.trim());
  const exact = withKeys.find(
    (edge) => edge.branchKey!.trim().toLowerCase() === normalized,
  );
  if (exact) return exact;

  if (PASS_KEYS.has(normalized)) {
    return (
      withKeys.find((edge) => PASS_KEYS.has(edge.branchKey!.trim().toLowerCase())) ??
      null
    );
  }
  if (FAIL_KEYS.has(normalized) || normalized === "not_run") {
    return (
      withKeys.find((edge) => FAIL_KEYS.has(edge.branchKey!.trim().toLowerCase())) ??
      null
    );
  }
  return null;
}

export function effectiveMaxIterations(
  spec: LoopSpec,
  // Call sites pass the branch/node id for a future per-node cap; loop nodes
  // currently contribute via spec-wide maxIterations aggregation only.
  _targetNodeId: string,
): number {
  const loopNodes = spec.nodes.filter((node) => {
    const arch = architectureOf(node);
    return arch.type === "logic" && arch.logicKind === "loop";
  });
  const loopCap = loopNodes.reduce((min, node) => {
    const value = node.maxIterations ?? Number.POSITIVE_INFINITY;
    return Math.min(min, value);
  }, Number.POSITIVE_INFINITY);
  const retryCap = spec.retryPolicy.maxAutoRetries;
  const stopCap = spec.stopPolicy.maxRounds;
  const caps = [stopCap, retryCap, loopCap].filter((value) =>
    Number.isFinite(value),
  );
  // attemptCounts are 0-based retries; allow maxIterations attempts total.
  const raw = caps.length > 0 ? Math.min(...caps) : stopCap;
  return Math.max(1, raw);
}

export function nodeCompleted(instance: LoopInstance, nodeId: string): boolean {
  return instance.events.some(
    (event) => event.type === "node_completed" && event.nodeId === nodeId,
  );
}

export function findRequestChangesTarget(
  spec: LoopSpec,
  fromNodeId: string,
): string | null {
  const fb = feedbackEdge(spec);
  if (fb && fb.from === fromNodeId) return fb.to;

  const failBranch = conditionalOutgoing(spec, fromNodeId).find((edge) =>
    FAIL_KEYS.has((edge.branchKey ?? "").toLowerCase()),
  );
  if (failBranch) return failBranch.to;

  const agents = spec.nodes.filter((node) => {
    const arch = architectureOf(node);
    return (
      arch.type === "agent" &&
      (arch.agentRole === "coder" || arch.agentRole === "planner")
    );
  });
  const coder = agents.find((node) => architectureOf(node).agentRole === "coder");
  if (coder) return coder.id;
  return agents[0]?.id ?? null;
}

export function humanQuestionId(node: LoopSpecNode): string {
  const arch = architectureOf(node);
  const mode = arch.humanMode ?? "approval";
  return `human_${mode}_${node.id}`;
}

export function parseHumanModeFromQuestionId(
  questionId: string,
): "approval" | "review" | "input" | "decision" | "legacy" {
  if (questionId.startsWith("human_approval_")) return "approval";
  if (questionId.startsWith("human_review_")) return "review";
  if (questionId.startsWith("human_input_")) return "input";
  if (questionId.startsWith("human_decision_")) return "decision";
  if (questionId.startsWith("decide_")) return "legacy";
  return "legacy";
}
