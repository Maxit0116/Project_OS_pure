import type { AgentRunEvent } from "../../contracts/events.js";

/**
 * Where a run stopped (O-1). Taken from events, not from the model's summary.
 * The reasons are mutually exclusive. Verification outranks a model error.
 */
export const RUN_OUTCOME_REASONS = [
  "model_error",
  "policy_denied",
  "apply_failed",
  "verification_failed",
  "verification_not_run",
  "interrupted",
  "cancelled",
] as const;

export type RunOutcomeReason = (typeof RUN_OUTCOME_REASONS)[number];

export function classifyRunOutcome(
  events: readonly AgentRunEvent[],
): RunOutcomeReason | undefined {
  if (events.some((event) => event.type === "run_cancelled")) return "cancelled";
  if (events.some((event) => event.type === "run_interrupted")) return "interrupted";

  const verification = readVerificationFacts(events);
  if (verification.status === "failed") return "verification_failed";
  if (
    verification.reason === "policy_denied" ||
    events.some((event) =>
      event.type === "tool_policy_decision" && event.payload.decision === "deny",
    )
  ) {
    return "policy_denied";
  }
  if (events.some((event) =>
    event.type === "apply_result" && event.payload.outcome !== "applied",
  )) {
    return "apply_failed";
  }
  if (verification.status === "not_run") return "verification_not_run";
  if (events.some((event) =>
    event.type === "model_request" && event.payload.status === "failed",
  ) || events.some((event) => event.type === "step_failed")) {
    return "model_error";
  }
  return undefined;
}

/**
 * `verification_completed` is the status of record. A later completion that
 * omits `reason` must not hide `policy_denied` already stored on the result.
 */
function readVerificationFacts(events: readonly AgentRunEvent[]): {
  status?: string;
  reason?: string;
} {
  let completedStatus: string | undefined;
  let resultStatus: string | undefined;
  for (const event of events) {
    if (event.type !== "verification_completed" && event.type !== "verification_result") continue;
    const status = event.payload?.status;
    if (status !== "passed" && status !== "failed" && status !== "not_run") continue;
    if (event.type === "verification_completed") completedStatus = status;
    else resultStatus = status;
  }
  const status = completedStatus ?? resultStatus;
  let reason: string | undefined;
  for (const event of events) {
    if (event.type !== "verification_completed" && event.type !== "verification_result") continue;
    const candidate = event.payload?.reason;
    if (typeof candidate !== "string") continue;
    const eventStatus = event.payload?.status;
    if (eventStatus === undefined || eventStatus === status) reason = candidate;
  }
  return {
    ...(status ? { status } : {}),
    ...(reason ? { reason } : {}),
  };
}
