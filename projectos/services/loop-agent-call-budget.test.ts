import { describe, expect, it } from "vitest";

import type { LoopInstance } from "../contracts/loop-graph.js";
import {
  assertAgentCallBudget,
  DEFAULT_MAX_AGENT_CALLS,
  DEFAULT_MAX_AGENT_CALL_DEPTH,
  recordAgentCallEnd,
  recordAgentCallStart,
  resolveAgentCallBudgetLimits,
} from "./loop-agent-call-budget.js";

function baseInstance(overrides?: Partial<LoopInstance>): LoopInstance {
  return {
    id: "inst_1",
    specVersion: "v1",
    status: "running",
    cursorNodeId: "n1",
    round: 0,
    attemptCounts: {},
    events: [],
    startedAt: "2026-11-10T00:00:00.000Z",
    updatedAt: "2026-11-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("loop-agent-call-budget", () => {
  it("allows first calls and records depth/count", () => {
    let inst = baseInstance();
    expect(assertAgentCallBudget(inst).ok).toBe(true);
    inst = recordAgentCallStart(inst);
    expect(inst.budgetUsage).toEqual({ agentCalls: 1, agentCallDepth: 1 });
    inst = recordAgentCallEnd(inst);
    expect(inst.budgetUsage?.agentCallDepth).toBe(0);
    expect(inst.budgetUsage?.agentCalls).toBe(1);
  });

  it("blocks when call count or depth is exhausted", () => {
    const atCap = baseInstance({
      budgetUsage: {
        agentCalls: DEFAULT_MAX_AGENT_CALLS,
        agentCallDepth: 0,
      },
    });
    expect(assertAgentCallBudget(atCap).ok).toBe(false);
    const deep = baseInstance({
      budgetUsage: {
        agentCalls: 1,
        agentCallDepth: DEFAULT_MAX_AGENT_CALL_DEPTH,
      },
    });
    expect(assertAgentCallBudget(deep).ok).toBe(false);
  });

  it("derives limits from stopPolicy without exceeding defaults", () => {
    const limits = resolveAgentCallBudgetLimits({
      stopPolicy: { maxRounds: 2 },
    });
    expect(limits.maxAgentCalls).toBeLessThanOrEqual(DEFAULT_MAX_AGENT_CALLS);
    expect(limits.maxAgentCallDepth).toBe(DEFAULT_MAX_AGENT_CALL_DEPTH);
  });
});
