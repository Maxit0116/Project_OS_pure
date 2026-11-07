import { ProjectOSError } from "../../errors.js";

/**
 * Budget exhaustion and other hard ProjectOSError failures must never fall through
 * to synthesize/`valid` batch emission — parent acceptance coverage is not proven.
 */
export function mayAttemptBatchSynthesisAfterError(error: unknown): boolean {
  if (error instanceof ProjectOSError) return false;
  return true;
}

export function isOutboundBudgetExhaustedError(error: unknown): boolean {
  return (
    error instanceof ProjectOSError &&
    error.code === "model_outbound_budget_exhausted"
  );
}
