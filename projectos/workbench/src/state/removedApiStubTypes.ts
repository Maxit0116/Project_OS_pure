/** Local stand-ins for team/features/MCP types removed from pure contracts. */

export type FeaturesFile = {
  manifest: { generated_at?: string }
  epics: Array<{ id: string; name: string }>
  features: Array<{
    id: string
    epicId: string
    name: string
    summary?: string
    nodeId?: string
    workUnitId?: string
    steps: Array<{
      name: string
      role: string
      refs?: Array<{ file: string; lines?: [number, number] }>
    }>
  }>
}

export type FeaturesLayout = Record<string, unknown>
export type FeaturesStaleness = Record<string, unknown>

export type ExternalAgentConfig = { id: string; authRef?: string }
export type McpServerConfig = { id: string; transport: string; authRef?: string }
export type McpToolDescriptor = { name: string }

export type TeamSnapshot = {
  collab: Array<{ nodeId: string; ownerPersonId?: string; collabStatus?: string }>
  roster: Array<{ id: string; name?: string; displayName?: string }>
  handoffs: Array<{ id: string; currentSummary: string }>
  acceptances: Array<{ id: string; nodeId: string; status: string }>
  decisions: Array<{ id: string }>
  dailyBrief?: DailyBrief | null
  dailyBriefNarratives?: DailyBriefNarrative[]
}

export type RelatedKnowledge = Record<string, unknown>
export type DailyBrief = Record<string, unknown>
export type DailyBriefNarrative = {
  id: string
  published?: { prNumber?: number }
}

export type AnchorRef = { kind: 'node'; id: string } | { kind: string; id: string }
export type TeamBrainAnswer = { answer: string; recorded?: boolean }
export type TeamMeeting = { id: string }

export type GitHubAuthStatus = { connected: boolean; login?: string; authMode?: string }
export type GitSyncStatus = { lastError?: string | null }

export type GitSyncSettingsPatch = Record<string, unknown>
export type GitCommitInput = { message: string }

export type CreateIdeaInput =
  | string
  | { rawText: string; relatedNodeIds?: string[] }

export type EndWorkInput = Record<string, unknown>
export type CreateDecisionInput = {
  title: string
  date: string
  participantPersonIds: string[]
  choice: string
  reasons: string[]
  alternativesConsidered: string[]
  relatedNodeIds: string[]
}
export type UpdateDecisionInput = Record<string, unknown>
export type UpsertTeamPersonInput = Record<string, unknown>
