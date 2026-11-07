/**
 * validate_batch budget / cancel contracts.
 *
 * Real ProjectOSLocalApi + AgentOrchestrator paths (SYNTHETIC gateway; no HTTP):
 * - `services/project-os-local-api.test.ts`
 *   - "automatic path: budget exhaustion on validate_batch emits no valid batch and writes nothing"
 *   - "automatic path: successful apply backup restores via product restoreApplyBackup"
 *   - "automatic path: cancel during parent batch validation writes nothing"
 *   - "fails malformed batch validation closed before creating a backup or writing files"
 *
 * This file keeps the non-synthesizable policy unit next to orchestrator modules so
 * the contract stays discoverable without duplicating the heavy workspace harness.
 */
import { describe, expect, it } from "vitest";

import { ProjectOSError } from "../../errors.js";
import {
  isOutboundBudgetExhaustedError,
  mayAttemptBatchSynthesisAfterError,
} from "./batch-validation-error-policy.js";

describe("validate_batch budget exhaustion policy (unit; API integration in project-os-local-api.test.ts)", () => {
  it("keeps ProjectOSError budget exhaustion non-synthesizable", () => {
    const error = new ProjectOSError(
      "model_outbound_budget_exhausted",
      "budget exhausted",
    );
    expect(isOutboundBudgetExhaustedError(error)).toBe(true);
    expect(mayAttemptBatchSynthesisAfterError(error)).toBe(false);
  });
});
