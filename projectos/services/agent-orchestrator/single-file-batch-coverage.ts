/**
 * Parent acceptance-criteria coverage for single-file batch synthesis.
 * Missing / duplicate / unrelated / partial child criteria must reject.
 */
export function childValidationCoversParentAcceptance(input: {
  parentAcceptanceCriteria: readonly string[];
  childCriteria: readonly { criterion: string; status: string }[];
  childVerdict: string;
  childPath: string;
  parentPath: string;
  scopeStatus: string;
}): boolean {
  if (input.childVerdict !== "valid") return false;
  if (input.childPath !== input.parentPath) return false;
  if (input.scopeStatus !== "compliant") return false;
  if (input.childCriteria.length !== input.parentAcceptanceCriteria.length) return false;
  if (!input.childCriteria.every((criterion) => criterion.status === "satisfied")) {
    return false;
  }
  const childTexts = input.childCriteria.map((criterion) => criterion.criterion);
  if (new Set(childTexts).size !== childTexts.length) return false;
  for (const parentCriterion of input.parentAcceptanceCriteria) {
    if (
      !input.childCriteria.some(
        (criterion) =>
          criterion.criterion === parentCriterion && criterion.status === "satisfied",
      )
    ) {
      return false;
    }
  }
  return true;
}
