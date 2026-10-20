import { describe, expect, it } from "vitest";

import type { AgentRunEvent } from "../../contracts/events.js";
import { summarizeRunUsage } from "./run-usage.js";

function modelRequest(input: number, output: number, usage: "reported" | "missing"): AgentRunEvent {
  return {
    eventId: `evt_${input}_${usage}`,
    runId: "run-1",
    timestamp: "2026-10-20T00:00:00.000Z",
    type: "model_request",
    payload: {
      stage: "edit",
      requestId: `req_${input}`,
      requestKind: "change_generation",
      provider: "test",
      model: "test-model",
      durationMs: 1,
      status: "ok",
      backend: "model",
      usage,
      tokenUsage: { input, output },
    },
  };
}

describe("summarizeRunUsage", () => {
  it("adds model calls and leaves child runs out of the total", () => {
    expect(summarizeRunUsage({
      backend: "model",
      childRunIds: ["child-1", "child-1"],
      events: [modelRequest(2, 3, "reported"), modelRequest(4, 5, "reported")],
    })).toEqual({
      backend: "model",
      usage: "reported",
      inputTokens: 6,
      outputTokens: 8,
      childRunIds: ["child-1"],
    });
  });

  it("keeps a missing provider usage as missing instead of an estimate", () => {
    expect(summarizeRunUsage({
      backend: "model",
      events: [modelRequest(0, 0, "missing"), modelRequest(1, 1, "reported")],
    }).usage).toBe("missing");
  });

  it("leaves fixture calls out of a model run total", () => {
    const fixture = modelRequest(9, 9, "reported");
    if (fixture.type !== "model_request") throw new Error("expected model_request");
    fixture.payload = { ...fixture.payload, backend: "fixture" };
    expect(summarizeRunUsage({
      backend: "model",
      events: [modelRequest(2, 3, "reported"), fixture],
    })).toMatchObject({
      backend: "model",
      inputTokens: 2,
      outputTokens: 3,
    });
  });

  it("records a fixture run as not a model", () => {
    expect(summarizeRunUsage({
      backend: "fixture",
      events: [modelRequest(9, 9, "reported")],
    })).toMatchObject({
      backend: "fixture",
      usage: "not_model",
      inputTokens: 0,
      outputTokens: 0,
    });
  });
});
