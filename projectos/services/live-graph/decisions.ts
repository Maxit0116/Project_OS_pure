import type { RunDecision } from "../../contracts/run-state.js";
import type { ExecutionOverlay, LiveNodeSummary } from "../../contracts/live-graph.js";
import { summarizeNodeLiveActivity } from "./overlay.js";

/** Fold canonical pending decisions into a node badge without changing the architecture graph. */
export function summarizeNodeLiveActivityWithDecisions(
  overlay: ExecutionOverlay | null | undefined,
  nodeId: string,
  decisions: readonly RunDecision[],
): LiveNodeSummary | null {
  const waiting = decisions.filter((decision) =>
    decision.status === "pending" && decision.nodeId === nodeId,
  );
  const current = summarizeNodeLiveActivity(overlay, nodeId);
  if (waiting.length === 0) return current;
  const oldest = [...waiting].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  )[0]!;
  return {
    nodeId,
    primaryKind: "waiting",
    primaryStatus: "running",
    activeCount: current?.activeCount ?? 0,
    totalCount: (current?.totalCount ?? 0) + waiting.length,
    label: oldest.question.slice(0, 120),
    agentLabels: current?.agentLabels ?? [],
  };
}
