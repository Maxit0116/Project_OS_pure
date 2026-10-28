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
}

/**
 * Host-provided data/actions so Overlay (IPC invoke) and Canvas (API client)
 * can both drive the same satellite interactions.
 */
export interface ComposeHubDataSource {
  listSkills?: () => Promise<HubSkillOption[]>
  listDirectories?: (relativePath: string) => Promise<HubDirectoryOption[]>
  listMentionFiles?: (query: string) => Promise<string[]>
  getGitStatus?: () => Promise<HubGitStatus>
  listRepoCandidates?: () => Promise<HubRepoCandidate[]>
  onSelectRepo?: (projectId: string) => void | Promise<void>
  resolveAssetUrl?: (assetPath: string) => string | undefined
}
