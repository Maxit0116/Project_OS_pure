import type { AgentProfileKind } from '@contracts/index'

export const DEFAULT_AGENT_PROFILE_TOOLS = [
  'readFile',
  'listFiles',
  'getContext',
  'features_scan',
  'features_sync',
] as const

export interface AgentProfileDraft {
  name: string
  kind: AgentProfileKind
  systemPrompt: string
  modelProfileId: string
  enabledTools: string[]
}

export function emptyAgentProfileDraft(): AgentProfileDraft {
  return {
    name: '',
    kind: 'feature_change',
    systemPrompt: '',
    modelProfileId: '',
    enabledTools: [...DEFAULT_AGENT_PROFILE_TOOLS],
  }
}

export function isAgentProfileDraftValid(draft: AgentProfileDraft): boolean {
  return Boolean(
    draft.name.trim() &&
    draft.systemPrompt.trim() &&
    draft.modelProfileId,
  )
}
