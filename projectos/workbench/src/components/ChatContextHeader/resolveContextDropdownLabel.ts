export const CONTEXT_DROPDOWN_SUMMARY_MAX = 60

export function truncateContextSummary(
  summary: string,
  max = CONTEXT_DROPDOWN_SUMMARY_MAX,
): string {
  const trimmed = summary.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

export interface ResolveContextDropdownLabelInput {
  globalAgentActive: boolean
  selectedNodeId: string | null
  selectedFilePath?: string | null
  nodeName: string | null | undefined
  contextSummary: string | null | undefined
  globalScopeLabel: string
  emptyLabel: string
}

export function resolveContextDropdownLabel(input: ResolveContextDropdownLabelInput): string {
  if (input.globalAgentActive) return input.globalScopeLabel

  if (input.selectedNodeId) {
    const name = input.nodeName?.trim() || input.selectedNodeId
    const summary = input.contextSummary?.trim()
    if (summary) return `${name} · ${truncateContextSummary(summary)}`
    return name
  }

  // Pending file ownership / unmapped file — not whole-project scope yet.
  if (input.selectedFilePath) return input.emptyLabel

  // No node selected ⇒ default to global / whole project.
  return input.globalScopeLabel
}
