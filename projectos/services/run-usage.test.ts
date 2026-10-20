import { describe, expect, it } from "vitest";

import { summarizeRunUsage } from "./run-usage.js";

describe("run usage (GW-0)", () => {
  it("adds reported model tokens and keeps child runs separate", () => {
    const summary = summarizeRunUsage({
      runId: "run-1",
      childRunIds: ["child-1"],
      events: [
        modelEvent({ input: 10, output: 4 }),
        modelEvent({ input: 3, output: 2, usage: "missing" }),
        modelEvent({ input: 100, output: 100, backend: "fixture" }),
      ],
    });
    expect(summary).toEqual({
      runId: "run-1",
      inputTokens: 13,
      outputTokens: 6,
      usage: "missing",
      backend: "model",
      childRunIds: ["child-1"],
    });
  });

  it("records a fixture run as zero model usage", () => {
    const summary = summarizeRunUsage({
      runId: "run-fixture",
      events: [modelEvent({ input: 9, output: 9, backend: "fixture" })],
    });
    expect(summary).toMatchObject({
      inputTokens: 0,
      outputTokens: 0,
      backend: "fixture",
      usage: "not_model",
    });
  });
});

function modelEvent(input: {
  input: number;
  output: number;
  usage?: "reported" | "missing";
  backend?: "model" | "fixture";
}) {
  return {
    type: "model_request",
    payload: {
      backend: input.backend ?? "model",
      usage: input.usage ?? "reported",
      tokenUsage: { input: input.input, output: input.output },
    },
  };
}
