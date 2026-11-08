/**
 * The name of a step in the Agent flow: a plain-language name for its kind in the interface language
 * ("Finding what to change"), not the technical label the run reports ("Locate Plan"). A kind that has no
 * plain name keeps the label it came with.
 */
export function agentFlowStepLabel(
  step: { kind: string; label: string },
  names: Readonly<Record<string, string>> | undefined,
): string {
  return names?.[step.kind] ?? step.label
}
