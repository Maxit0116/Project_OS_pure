import { describe, expect, it } from "vitest";
import {
  batchValidationNeedsHumanReview,
  isEvidenceFullySatisfiedBatchValidation,
  isEvidenceReviewableBatchValidation,
  isEvidenceValidBatchValidation,
  isEvidenceValidProposalValidation,
  proposalValidationNeedsHumanReview,
} from "./batch-validation-evidence.js";

describe("batch-validation-evidence", () => {
  it("treats uncertain-only criteria as reviewable valid, not hard-fail", () => {
    const parsed = {
      tasks: [
        {
          status: "consistent",
          criteria: [
            { status: "satisfied" },
            { status: "uncertain" },
            { status: "uncertain" },
          ],
        },
      ],
    };
    expect(isEvidenceFullySatisfiedBatchValidation(parsed)).toBe(false);
    expect(isEvidenceReviewableBatchValidation(parsed)).toBe(true);
    expect(isEvidenceValidBatchValidation(parsed)).toBe(true);
    expect(batchValidationNeedsHumanReview(parsed)).toBe(true);
  });

  it("still rejects unsatisfied criteria", () => {
    const parsed = {
      tasks: [
        {
          status: "consistent",
          criteria: [{ status: "satisfied" }, { status: "unsatisfied" }],
        },
      ],
    };
    expect(isEvidenceValidBatchValidation(parsed)).toBe(false);
  });

  it("rejects inconsistent task status even if criteria look soft", () => {
    const parsed = {
      tasks: [
        {
          status: "inconsistent",
          criteria: [{ status: "uncertain" }],
        },
      ],
    };
    expect(isEvidenceReviewableBatchValidation(parsed)).toBe(false);
    expect(isEvidenceValidBatchValidation(parsed)).toBe(false);
  });

  it("allows proposal review when scope is compliant with uncertain criteria", () => {
    const parsed = {
      scopeAssessment: { status: "compliant" },
      criteria: [{ status: "satisfied" }, { status: "uncertain" }],
    };
    expect(isEvidenceValidProposalValidation(parsed)).toBe(true);
    expect(proposalValidationNeedsHumanReview(parsed)).toBe(true);
  });
});
