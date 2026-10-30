import type { FunctionalEdge, FunctionalNode } from '@contracts/index'

export interface HubSkillOption {
  id: string
  name: string
  description?: string
}

export interface HubDirectoryOption {
  name: string
  path: string
}

export interface HubRepoCandidate {
  projectId: string
  displayName: string
}

export interface HubGitStatus {
  branch: string | null
  dirty: boolean
  ahead?: number
  behind?: number
  remoteUrl?: string
  defaultBranch?: string
}

export interface HubGitBranch {
  id: string
  name: string
  current: boolean
  remote: boolean
  upstream?: string
  ahead?: number
  behind?: number
}

export interface HubGitBranchList {
  defaultBranch: string | null
  currentBranch: string | null
  branches: HubGitBranch[]
}

export interface HubGitMutationResult {
  ok: boolean
  branch?: string | null
  message: string
}

/**
 * Host-provided data/actions so Overlay (IPC invoke) and Canvas (API client)
 * can both drive the same satellite interactions.
 */
export interface HubPickedReferenceFile {
  path: string
  name: string
  ext: string
}

export interface HubMcpServerOption {
  id: string
  name: string
  enabled: boolean
  transport: 'stdio' | 'http'
  toolCount?: number
}

/** Project graph slice for the centered Scope → Map C4 picker. */
export type HubProjectGraphSlice = {
  nodes: FunctionalNode[]
  edges: FunctionalEdge[]
}

export interface ComposeHubDataSource {
  listSkills?: () => Promise<HubSkillOption[]>
  listDirectories?: (relativePath: string) => Promise<HubDirectoryOption[]>
  listMentionFiles?: (query: string) => Promise<string[]>
  /** Open native Finder / file dialog for reference library imports. */
  pickReferenceFiles?: (options?: {
    extensions?: string[]
  }) => Promise<HubPickedReferenceFile[]>
  listMcpServers?: () => Promise<HubMcpServerOption[]>
  /** Toggle or update a project MCP server (enabled flag for hub v1). */
  setMcpServerEnabled?: (
    serverId: string,
    enabled: boolean,
  ) => Promise<HubMcpServerOption | null>
  /** Open Settings → MCP (Capture/Workbench). Overlay may omit. */
  openMcpSettings?: () => void
  /** Open Marketplace overlay to install into the project skill/MCP library. */
  openMarketplace?: (tab?: 'mcp' | 'skills') => void
  /** Project function graph for Scope → Map picker. */
  getProjectGraph?: () => Promise<HubProjectGraphSlice | null>
  getGitStatus?: () => Promise<HubGitStatus>
  listGitBranches?: () => Promise<HubGitBranchList>
  checkoutBranch?: (branch: string) => Promise<HubGitMutationResult>
  createBranch?: (input: {
    name: string
    from?: string
    checkout?: boolean
  }) => Promise<HubGitMutationResult>
  fetchGit?: () => Promise<HubGitMutationResult>
  listPullRequests?: () => Promise<{
    available: boolean
    pullRequests: Array<{
      number: number
      title: string
      url: string
      headRef: string
      baseRef: string
    }>
    message?: string
  }>
  createPullRequest?: (input: {
    title: string
    head?: string
    base?: string
  }) => Promise<{ ok: boolean; url?: string; message: string }>
  /** Open full GitHub Graph overlay (Workbench only). */
  openGithubGraph?: () => void
  openExternalUrl?: (url: string) => void
  listRepoCandidates?: () => Promise<HubRepoCandidate[]>
  onSelectRepo?: (projectId: string) => void | Promise<void>
  resolveAssetUrl?: (assetPath: string) => string | undefined
}
