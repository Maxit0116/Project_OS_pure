import { describe, expect, it } from "vitest";

import { scoreOfflineEval } from "./offline-eval.js";

describe("scoreOfflineEval", () => {
  it("records the task without turning the score into user acceptance", () => {
    expect(scoreOfflineEval({
      taskId: "leaf-login-marker",
      completed: true,
      firstVerificationPassed: false,
      repairRounds: 1,
      inputTokens: 12,
      outputTokens: 8,
      humanIntervened: false,
    })).toEqual({
      taskId: "leaf-login-marker",
      completed: true,
      firstVerificationPassed: false,
      repairRounds: 1,
      inputTokens: 12,
      outputTokens: 8,
      humanIntervened: false,
      countsAsUserAcceptance: false,
    });
  });
});
