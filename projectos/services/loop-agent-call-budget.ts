/**
 * Agent↔agent / loop-started AgentRun call budget (六目标互调).
 * Depth + count caps prevent unbounded nested starts.
 */
import type { LoopInstance, LoopSpec } from "../contracts/loop-graph.js";
import { LOOP_WORK_GROUP_LIMITS } from "../contracts/loop-work-group.js";

export const DEFAULT_MAX_AGENT_CALLS = 8;
export const DEFAULT_MAX_AGENT_CALL_DEPTH = 3;
export const DEFAULT_MAX_AGENT_CALLS_PER_WORK_GROUP =
  LOOP_WORK_GROUP_LIMITS.maxAgentCallsPerWorkGroup;

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

export function assertWorkGroupAgentCallBudget(
  instance: LoopInstance,
  workGroupId: string,
  maxPerGroup: number = DEFAULT_MAX_AGENT_CALLS_PER_WORK_GROUP,
): { ok: true } | { ok: false; reason: string } {
  const used = instance.budgetUsage?.workGroupAgentCalls?.[workGroupId] ?? 0;
  if (used >= maxPerGroup) {
    return {
      ok: false,
      reason: `Work group agent call budget exhausted (${used}/${maxPerGroup}) [${workGroupId}]`,
    };
  }
  return { ok: true };
}

export function recordWorkGroupAgentCall(
  instance: LoopInstance,
  workGroupId: string,
): LoopInstance {
  const prior = instance.budgetUsage?.workGroupAgentCalls ?? {};
  const nextCount = (prior[workGroupId] ?? 0) + 1;
  const records = [...(instance.workGroupRecords ?? [])];
  const idx = records.findIndex((record) => record.workGroupId === workGroupId);
  const now = new Date().toISOString();
  if (idx >= 0) {
    records[idx] = {
      ...records[idx]!,
      status: "running",
      updatedAt: now,
      agentCalls: nextCount,
    };
  }
  return {
    ...instance,
    budgetUsage: {
      ...instance.budgetUsage,
      workGroupAgentCalls: {
        ...prior,
        [workGroupId]: nextCount,
      },
    },
    workGroupRecords: records,
  };
}
