import { describe, expect, it } from "vitest";

import type { LoopInstance } from "../contracts/loop-graph.js";
import {
  assertWorkGroupAgentCallBudget,
  recordWorkGroupAgentCall,
  DEFAULT_MAX_AGENT_CALLS_PER_WORK_GROUP,
} from "./loop-agent-call-budget.js";

function baseInstance(): LoopInstance {
  return {
    id: "inst_1",
    specVersion: "spec_1",
    status: "running",
    cursorNodeId: "n1",
    round: 0,
    attemptCounts: {},
    workGroupRecords: [
      {
        workGroupId: "wg1",
        status: "pending",
        updatedAt: "2026-11-13T00:00:00.000Z",
        memberNodeIds: ["n1"],
        agentCalls: 0,
      },
    ],
    events: [],
    startedAt: "2026-11-13T00:00:00.000Z",
    updatedAt: "2026-11-13T00:00:00.000Z",
  };
}

describe("work group agent call budget", () => {
  it("records and enforces per-group limit", () => {
    let instance = baseInstance();
    for (let i = 0; i < DEFAULT_MAX_AGENT_CALLS_PER_WORK_GROUP; i += 1) {
      expect(assertWorkGroupAgentCallBudget(instance, "wg1").ok).toBe(true);
      instance = recordWorkGroupAgentCall(instance, "wg1");
    }
    expect(assertWorkGroupAgentCallBudget(instance, "wg1").ok).toBe(false);
    expect(instance.budgetUsage?.workGroupAgentCalls?.wg1).toBe(
      DEFAULT_MAX_AGENT_CALLS_PER_WORK_GROUP,
    );
    expect(instance.workGroupRecords?.[0]?.status).toBe("running");
  });
});
