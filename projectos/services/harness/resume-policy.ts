/**
 * Harness H6. Cancel stays cancel. An interrupted run with a backup
 * must not be applied again. Without a backup, continuation regenerates.
 */
export type HarnessResumeDecision =
  | { action: "regenerate" }
  | { action: "verify_or_undo"; backupId?: string }
  | { action: "reject"; reason: string };

export function decideHarnessResume(input: {
  status: string;
  hasBackup: boolean;
  backupId?: string;
}): HarnessResumeDecision {
  if (input.status === "cancelled") {
    return {
      action: "reject",
      reason: "Cancelled runs stay cancelled and are not resumed as interrupted",
    };
  }
  if (input.status !== "interrupted") {
    return {
      action: "reject",
      reason: "Only an interrupted run can be continued",
    };
  }
  if (input.hasBackup) {
    return {
      action: "verify_or_undo",
      ...(input.backupId ? { backupId: input.backupId } : {}),
    };
  }
  return { action: "regenerate" };
}
