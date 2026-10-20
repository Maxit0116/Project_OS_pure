/**
 * Offline eval notes (V-3). These numbers compare harness changes.
 * They are never a user task's verification status.
 */
export interface OfflineEvalTask {
  id: string;
  expectedPaths: readonly string[];
  requiredCommand: string;
}

export const OFFLINE_EVAL_TASKS: readonly OfflineEvalTask[] = [
  {
    id: "leaf-login-marker",
    expectedPaths: ["app/login/page.tsx"],
    requiredCommand: "npm test",
  },
];

export interface OfflineEvalObservation {
  taskId: string;
  completed: boolean;
  firstVerificationPassed: boolean;
  repairRounds: number;
  inputTokens: number;
  outputTokens: number;
  humanIntervened: boolean;
}

export interface OfflineEvalScore {
  taskId: string;
  completed: boolean;
  firstVerificationPassed: boolean;
  repairRounds: number;
  inputTokens: number;
  outputTokens: number;
  humanIntervened: boolean;
  /** Always false. User acceptance stays on VerificationEvidence. */
  countsAsUserAcceptance: false;
}

export function scoreOfflineEval(observation: OfflineEvalObservation): OfflineEvalScore {
  const task = OFFLINE_EVAL_TASKS.find((item) => item.id === observation.taskId);
  if (!task) {
    throw new Error(`Unknown offline eval task '${observation.taskId}'`);
  }
  return {
    taskId: task.id,
    completed: observation.completed,
    firstVerificationPassed: observation.firstVerificationPassed,
    repairRounds: observation.repairRounds,
    inputTokens: observation.inputTokens,
    outputTokens: observation.outputTokens,
    humanIntervened: observation.humanIntervened,
    countsAsUserAcceptance: false,
  };
}
