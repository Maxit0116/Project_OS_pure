import { describe, expect, it, vi } from "vitest";

import type { AgentContextBundle } from "../contracts/local-context.js";
import type { DebugSession } from "../contracts/debug-session.js";
import type { ModelProfile } from "../contracts/settings.js";
import { DebugHypothesisService } from "./debug-hypothesis-service.js";

const profile = {
  id: "model-1",
  label: "Test",
  provider: "openai",
  model: "gpt-test",
} as ModelProfile;

const localContext = {
  bundleHash: `sha256:${"a".repeat(64)}`,
  synopsis: "test",
  files: [],
} as unknown as AgentContextBundle;

describe("DebugHypothesisService", () => {
  it("falls back to seedManualHypotheses when the model fails", async () => {
    const gateway = {
      complete: vi.fn(async () => {
        throw new Error("model down");
      }),
    };
    const service = new DebugHypothesisService(gateway as never);
    const hypotheses = await service.generateHypotheses({
      projectId: "proj",
      bugDescription: "Login redirect loops forever",
      localContext,
      profile,
      thinkingDepth: "standard",
    });
    expect(hypotheses.length).toBeGreaterThan(0);
    expect(hypotheses[0]?.summary).toContain("Login redirect");
  });

  it("falls back to first hypothesis when log analysis JSON is invalid", async () => {
    const gateway = {
      complete: vi.fn(async () => ({
        output: "not-json",
        reasoning: undefined,
      })),
    };
    const service = new DebugHypothesisService(gateway as never);
    const session = {
      hypotheses: [
        {
          id: "hyp_a",
          summary: "Null owner",
          confidence: 0.7,
          evidence: [],
        },
      ],
      instrumentation: [{ filePath: "app.ts" }],
      bugDescription: "boom",
    } as unknown as DebugSession;
    const result = await service.chooseRootCauseFromLogs({
      projectId: "proj",
      session,
      logs: [
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          sessionId: "dbg",
          location: "app.ts:1",
          payload: "error",
        },
      ],
      profile,
      thinkingDepth: "standard",
    });
    expect(result.chosenRootCauseId).toBe("hyp_a");
    expect(result.proposedFix.summary).toContain("Null owner");
  });
});
