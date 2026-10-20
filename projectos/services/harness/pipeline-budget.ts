/**
 * Hardcoded limits for one leaf run (Harness H7).
 * These are not user settings. Tests may pass a tighter copy into the orchestrator.
 * The repair generation in H5 counts toward `maxModelCalls`.
 */
export const LEAF_PIPELINE_BUDGET = {
  maxModelCalls: 16,
  maxVerificationRuns: 2,
  maxWallClockMs: 10 * 60 * 1000,
} as const;

export interface LeafPipelineBudget {
  maxModelCalls: number;
  maxVerificationRuns: number;
  maxWallClockMs: number;
}

export function resolveLeafPipelineBudget(
  override?: Partial<LeafPipelineBudget>,
): LeafPipelineBudget {
  return {
    maxModelCalls: override?.maxModelCalls ?? LEAF_PIPELINE_BUDGET.maxModelCalls,
    maxVerificationRuns: override?.maxVerificationRuns ?? LEAF_PIPELINE_BUDGET.maxVerificationRuns,
    maxWallClockMs: override?.maxWallClockMs ?? LEAF_PIPELINE_BUDGET.maxWallClockMs,
  };
}
