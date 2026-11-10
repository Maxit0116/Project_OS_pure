/**
 * Agent↔agent / loop-started AgentRun call budget (六目标互调).
 * Depth + count caps prevent unbounded nested starts.
 */
import type { LoopInstance, LoopSpec } from "../contracts/loop-graph.js";

export const DEFAULT_MAX_AGENT_CALLS = 8;
export const DEFAULT_MAX_AGENT_CALL_DEPTH = 3;

export type AgentCallBudgetLimits = {
  maxAgentCalls: number;
  maxAgentCallDepth: number;
};

export function resolveAgentCallBudgetLimits(
  spec?: Pick<LoopSpec, "stopPolicy"> | null,
): AgentCallBudgetLimits {
  const maxRounds = spec?.stopPolicy?.maxRounds;
  return {
    maxAgentCalls:
      typeof maxRounds === "number" && maxRounds > 0
        ? Math.min(DEFAULT_MAX_AGENT_CALLS, maxRounds * 2)
        : DEFAULT_MAX_AGENT_CALLS,
    maxAgentCallDepth: DEFAULT_MAX_AGENT_CALL_DEPTH,
  };
}

export function assertAgentCallBudget(
  instance: LoopInstance,
  limits: AgentCallBudgetLimits = {
    maxAgentCalls: DEFAULT_MAX_AGENT_CALLS,
    maxAgentCallDepth: DEFAULT_MAX_AGENT_CALL_DEPTH,
  },
): { ok: true } | { ok: false; reason: string } {
  const calls = instance.budgetUsage?.agentCalls ?? 0;
  const depth = instance.budgetUsage?.agentCallDepth ?? 0;
  if (calls >= limits.maxAgentCalls) {
    return {
      ok: false,
      reason: `Agent call budget exhausted (${calls}/${limits.maxAgentCalls})`,
    };
  }
  if (depth >= limits.maxAgentCallDepth) {
    return {
      ok: false,
      reason: `Agent call depth exhausted (${depth}/${limits.maxAgentCallDepth})`,
    };
  }
  return { ok: true };
}

export function recordAgentCallStart(instance: LoopInstance): LoopInstance {
  const calls = (instance.budgetUsage?.agentCalls ?? 0) + 1;
  const depth = (instance.budgetUsage?.agentCallDepth ?? 0) + 1;
  return {
    ...instance,
    budgetUsage: {
      ...instance.budgetUsage,
      agentCalls: calls,
      agentCallDepth: depth,
    },
  };
}

export function recordAgentCallEnd(instance: LoopInstance): LoopInstance {
  const depth = Math.max(0, (instance.budgetUsage?.agentCallDepth ?? 1) - 1);
  return {
    ...instance,
    budgetUsage: {
      ...instance.budgetUsage,
      agentCallDepth: depth,
      ...(instance.budgetUsage?.agentCalls !== undefined
        ? { agentCalls: instance.budgetUsage.agentCalls }
        : {}),
    },
  };
}
