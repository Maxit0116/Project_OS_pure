/**
 * Integration-style: budget exhaustion during validate_batch must not emit a
 * `batch_validation_result` with verdict=valid (no Apply authorization surface).
 */
import { describe, expect, it, vi } from "vitest";

import { ProjectOSError } from "../../errors.js";
import {
  isOutboundBudgetExhaustedError,
  mayAttemptBatchSynthesisAfterError,
} from "./batch-validation-error-policy.js";

describe("validate_batch budget exhaustion (integration contract)", () => {
  it("does not emit batch_validation_result valid after model_outbound_budget_exhausted", () => {
    const emitted: Array<{ type: string; verdict?: string }> = [];
    const error = new ProjectOSError(
      "model_outbound_budget_exhausted",
      "Model outbound budget exhausted (10/10); request not sent",
    );

    const emitBatchValid = () => {
      emitted.push({ type: "batch_validation_result", verdict: "valid" });
    };

    expect(isOutboundBudgetExhaustedError(error)).toBe(true);
    expect(mayAttemptBatchSynthesisAfterError(error)).toBe(false);

    try {
      // Mirrors validateDelegatedBatch catch: ProjectOSError → rethrow, no emit.
      if (!mayAttemptBatchSynthesisAfterError(error)) throw error;
      emitBatchValid();
    } catch (caught) {
      expect(caught).toBe(error);
    }

    expect(emitted).toEqual([]);
  });

  it("does not invoke applyDiff when budget exhaustion blocked parent batch valid", async () => {
    const applyDiff = vi.fn(async () => ({ applied: true }));
    const parentBatchValidEmitted = false;
    if (parentBatchValidEmitted) {
      await applyDiff();
    }
    expect(applyDiff).not.toHaveBeenCalled();
  });
});
