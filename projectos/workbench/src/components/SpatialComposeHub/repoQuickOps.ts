/**
 * Pure helpers for GitHub card quick-ops (contextual Sync buttons, remote URL).
 */

export type RepoSyncPrimary = 'pull' | 'push' | 'none'

export interface RepoSyncButtons {
  /** Primary sync action when ahead XOR behind. */
  primary: RepoSyncPrimary
  /** When both ahead and behind, show Pull + Push. */
  showPull: boolean
  showPush: boolean
}

export function resolveRepoSyncButtons(input: {
  ahead?: number
  behind?: number
  dirty?: boolean
}): RepoSyncButtons {
  const ahead = input.ahead ?? 0
  const behind = input.behind ?? 0
  if (behind > 0 && ahead === 0) {
    return { primary: 'pull', showPull: true, showPush: false }
  }
  if (ahead > 0 && behind === 0) {
    return { primary: 'push', showPull: false, showPush: true }
  }
  if (ahead > 0 && behind > 0) {
    return { primary: 'none', showPull: true, showPush: true }
  }
  return { primary: 'none', showPull: false, showPush: false }
}

/** Convert git@ / .git remote URLs to an https GitHub browse URL. */
export function remoteUrlToHttps(remoteUrl: string): string {
  return remoteUrl
    .replace(/^git@github\.com:/i, 'https://github.com/')
    .replace(/\.git$/i, '')
}

export function branchNodeId(branch: string): string {
  return `branch:${branch}`
}
