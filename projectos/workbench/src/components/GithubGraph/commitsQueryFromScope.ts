import { GITHUB_HISTORY_COMMIT_CAP } from '../../../../contracts/github-domain.js'
import type { GithubHistoryScope } from '../../../../contracts/github-history-scope.js'

/** Map history scope → listWorkspaceGitCommits input. */
export function commitsQueryFromScope(
  scope: GithubHistoryScope,
  defaultBranch: string | null,
): {
  limit: number
  tips?: string[]
  sinceDays?: number
  range?: { base: string; head: string }
  sinceForkBase?: string
  firstParentOnly?: boolean
} {
  const limit = scope.window.commitCap || GITHUB_HISTORY_COMMIT_CAP
  const firstParentOnly = scope.firstParentOnly || undefined

  if (scope.sourceKind === 'pr' && scope.prBaseRef && scope.prHeadRef) {
    return {
      limit,
      range: { base: scope.prBaseRef, head: scope.prHeadRef },
      firstParentOnly,
      ...(scope.window.kind === 'since-days' && scope.window.sinceDays
        ? { sinceDays: scope.window.sinceDays }
        : {}),
    }
  }

  const tips =
    scope.branchRefs.length > 0
      ? scope.branchRefs
      : defaultBranch
        ? [defaultBranch]
        : undefined

  if (scope.window.kind === 'since-days' && scope.window.sinceDays) {
    return {
      limit,
      tips,
      sinceDays: scope.window.sinceDays,
      firstParentOnly,
    }
  }

  if (scope.window.kind === 'since-fork' && defaultBranch) {
    return {
      limit,
      tips,
      sinceForkBase: defaultBranch,
      firstParentOnly,
    }
  }

  return {
    limit,
    tips,
    firstParentOnly,
  }
}
