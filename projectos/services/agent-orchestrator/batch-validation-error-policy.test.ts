import { describe, expect, it } from "vitest";

import { ProjectOSError } from "../../errors.js";
import {
  isOutboundBudgetExhaustedError,
  mayAttemptBatchSynthesisAfterError,
} from "./batch-validation-error-policy.js";

describe("batch-validation-error-policy", () => {
  it("forbids synthesis after model_outbound_budget_exhausted", () => {
    const error = new ProjectOSError(
      "model_outbound_budget_exhausted",
      "budget exhausted",
    );
    expect(isOutboundBudgetExhaustedError(error)).toBe(true);
    expect(mayAttemptBatchSynthesisAfterError(error)).toBe(false);
  });

  it("forbids synthesis after any ProjectOSError (no valid emit / no apply path)", () => {
    expect(
      mayAttemptBatchSynthesisAfterError(
        new ProjectOSError("proposal_validation_failed", "rejected"),
      ),
    ).toBe(false);
  });

  it("allows non-ProjectOSError paths to continue into existing shape/retry handling", () => {
    expect(mayAttemptBatchSynthesisAfterError(new Error("bad json"))).toBe(true);
  });
});
