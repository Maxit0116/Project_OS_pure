import { describe, expect, it } from "vitest";
import type { RunDecision } from "../../contracts/run-state.js";
import { summarizeNodeLiveActivityWithDecisions } from "./decisions.js";

const decision: RunDecision = {
  version: "0.1.0",
  id: "decision_1",
  projectId: "project",
  rootRunId: "run",
  runId: "run",
  nodeId: "feat_checkout",
  kind: "scope_change",
  question: "Approve the additional settings file?",
  options: [{ id: "approve", label: "Approve" }],
  status: "pending",
  revision: 1,
  createdAt: "2026-10-27T00:00:00.000Z",
};

describe("decision map projection", () => {
  it("shows a waiting badge on the affected node and removes it after resolution", () => {
    expect(summarizeNodeLiveActivityWithDecisions(null, "feat_checkout", [decision])).toMatchObject({
      nodeId: "feat_checkout",
      primaryKind: "waiting",
      primaryStatus: "running",
      label: decision.question,
    });
    expect(summarizeNodeLiveActivityWithDecisions(null, "feat_notifications", [decision])).toBeNull();
    expect(summarizeNodeLiveActivityWithDecisions(null, "feat_checkout", [{
      ...decision,
      status: "resolved",
      revision: 2,
      answer: { optionId: "approve" },
    }])).toBeNull();
  });
});
