import { describe, expect, it } from "vitest";

import type { AgentRunEvent } from "../../contracts/events.js";
import { classifyRunOutcome } from "./run-outcome.js";

function event(partial: Pick<AgentRunEvent, "type"> & { payload?: AgentRunEvent extends infer E ? E extends { payload?: infer P } ? P : never : never }): AgentRunEvent {
  return {
    eventId: `evt_${partial.type}`,
    runId: "run-1",
    timestamp: "2026-10-20T00:00:00.000Z",
    ...partial,
  } as AgentRunEvent;
}

describe("classifyRunOutcome", () => {
  it("calls a failed command verification_failed even when a model call also failed", () => {
    expect(classifyRunOutcome([
      event({
        type: "model_request",
        payload: {
          stage: "edit",
          requestId: "req_1",
          requestKind: "change_generation",
          provider: "test",
          model: "test-model",
          durationMs: 1,
          status: "failed",
          backend: "model",
          usage: "missing",
          tokenUsage: { input: 0, output: 0 },
        },
      }),
      event({
        type: "verification_completed",
        payload: { status: "failed", reason: "command_failed" },
      }),
    ])).toBe("verification_failed");
  });

  it("keeps a user cancel as cancelled", () => {
    expect(classifyRunOutcome([
      event({
        type: "model_request",
        payload: {
          stage: "edit",
          requestId: "req_1",
          requestKind: "change_generation",
          provider: "test",
          model: "test-model",
          durationMs: 1,
          status: "failed",
          backend: "model",
          usage: "missing",
          tokenUsage: { input: 0, output: 0 },
        },
      }),
      event({ type: "run_cancelled" }),
    ])).toBe("cancelled");
  });

  it("keeps policy denial when the completion event omits the evidence reason", () => {
    expect(classifyRunOutcome([
      event({
        type: "verification_result",
        payload: {
          status: "not_run",
          reason: "policy_denied",
          evidenceId: "evidence_run_1",
          ok: false,
          summary: "Verification command was denied.",
        },
      }),
      event({
        type: "verification_completed",
        payload: { status: "not_run" },
      }),
      event({ type: "run_completed", payload: { verificationStatus: "not_run" } }),
    ])).toBe("policy_denied");
  });

  it("marks a timed-out model call as model_error when verification never ran", () => {
    expect(classifyRunOutcome([
      event({
        type: "model_request",
        payload: {
          stage: "edit",
          requestId: "req_timeout",
          requestKind: "change_generation",
          provider: "test",
          model: "test-model",
          durationMs: 120_000,
          status: "failed",
          backend: "model",
          usage: "missing",
          tokenUsage: { input: 0, output: 0 },
        },
      }),
    ])).toBe("model_error");
  });
});
