/** Criterion evidence gates for batch / proposal validation (no model I/O). */

export function isEvidenceFullySatisfiedBatchValidation(parsed: {
  tasks: Array<{ criteria: Array<{ status: string }> }>;
}): boolean {
  return parsed.tasks.every((task) =>
    task.criteria.every((criterion) => criterion.status === "satisfied"),
  );
}

/** No unsatisfied criteria; uncertain allowed → review, not hard-fail. */
export function isEvidenceReviewableBatchValidation(parsed: {
  tasks: Array<{ status?: string; criteria: Array<{ status: string }> }>;
}): boolean {
  return parsed.tasks.every(
    (task) =>
      task.status !== "inconsistent" &&
      task.criteria.length > 0 &&
      task.criteria.every(
        (criterion) =>
          criterion.status === "satisfied" || criterion.status === "uncertain",
      ),
  );
}

export function isEvidenceValidBatchValidation(parsed: {
  tasks: Array<{ status?: string; criteria: Array<{ status: string }> }>;
}): boolean {
  return (
    isEvidenceFullySatisfiedBatchValidation(parsed) ||
    isEvidenceReviewableBatchValidation(parsed)
  );
}

export function batchValidationNeedsHumanReview(validation: {
  tasks: Array<{ criteria: Array<{ status: string }> }>;
}): boolean {
  return validation.tasks.some((task) =>
    task.criteria.some((criterion) => criterion.status === "uncertain"),
  );
}

export function isEvidenceValidProposalValidation(parsed: {
  scopeAssessment: { status: string };
  criteria: Array<{ status: string }>;
}): boolean {
  return (
    parsed.scopeAssessment.status === "compliant" &&
    parsed.criteria.length > 0 &&
    parsed.criteria.every(
      (criterion) =>
        criterion.status === "satisfied" || criterion.status === "uncertain",
    )
  );
}

export function proposalValidationNeedsHumanReview(validation: {
  criteria: Array<{ status: string }>;
}): boolean {
  return validation.criteria.some((criterion) => criterion.status === "uncertain");
}
