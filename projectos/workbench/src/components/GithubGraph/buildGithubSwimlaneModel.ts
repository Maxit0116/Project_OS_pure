import type { GithubDomainModel } from '../../../../contracts/github-domain.js'
import type { GithubHistoryScope } from '../../../../contracts/github-history-scope.js'
import type { WorkspaceGitCommit } from '../../../../contracts/workspace-git.js'
import {
  filterFirstParentCommits,
  layoutGithubCommitSwimlane,
  type GithubCommitSwimlaneLayout,
  type LaidOutSwimlaneRow,
} from './layoutGithubCommitSwimlane'

export type GithubSwimlaneRowKind = 'commit' | 'wip'

export interface GithubSwimlaneRow {
  id: string
  kind: GithubSwimlaneRowKind
  sha?: string
  parentShas: string[]
  subject: string
  authorName?: string
  authoredAt?: string
  isMerge: boolean
  refLabels: string[]
  prBadges: number[]
  /** True when this commit's lane branch is in highlightBranchRefs. */
  highlighted: boolean
  layout: LaidOutSwimlaneRow
}

export interface GithubSwimlaneModel {
  rows: GithubSwimlaneRow[]
  layout: GithubCommitSwimlaneLayout
  emptyReason?: GithubHistoryScope['emptyReason']
  emptyMessage?: string
  truncated: boolean
}

function shortSubject(message: string): string {
  const line = message.split('\n')[0] ?? message
  return line.trim() || '(empty)'
}

function refsPointingAt(
  model: GithubDomainModel,
  sha: string,
): string[] {
  return model.branches
    .filter((branch) => !branch.deleted && branch.headSha === sha)
    .map((branch) => branch.name)
}

function prsTouchingCommit(
  model: GithubDomainModel,
  sha: string,
  scope: GithubHistoryScope,
): number[] {
  const badges: number[] = []
  for (const pr of model.pullRequests) {
    if (scope.prNumber && pr.number === scope.prNumber) {
      badges.push(pr.number)
      continue
    }
    if (pr.headSha && pr.headSha === sha) badges.push(pr.number)
  }
  return [...new Set(badges)]
}

/**
 * Build display rows + lane geometry from commits already fetched for the scope.
 */
export function buildGithubSwimlaneModel(input: {
  scope: GithubHistoryScope
  domainModel: GithubDomainModel
  commits: readonly WorkspaceGitCommit[]
  truncated: boolean
  dirty: boolean
}): GithubSwimlaneModel {
  const { scope, domainModel, truncated, dirty } = input

  if (scope.emptyReason) {
    return {
      rows: [],
      layout: { rows: [], laneCount: 0 },
      emptyReason: scope.emptyReason,
      emptyMessage: scope.emptyMessage,
      truncated: false,
    }
  }

  let commits = [...input.commits]
  if (scope.firstParentOnly) {
    const tipShas = new Set<string>()
    for (const ref of scope.branchRefs) {
      const head = domainModel.branches.find((branch) => branch.name === ref)
        ?.headSha
      if (head) tipShas.add(head)
    }
    if (scope.prHeadRef) {
      const pr = domainModel.pullRequests.find(
        (item) => item.number === scope.prNumber,
      )
      if (pr?.headSha) tipShas.add(pr.headSha)
    }
    if (commits[0]) tipShas.add(commits[0].sha)
    const filtered = filterFirstParentCommits(
      commits.map((commit) => ({
        id: commit.sha,
        parentIds: commit.parentShas,
        commit,
      })),
      [...tipShas],
    )
    commits = filtered.map((item) => ({
      ...item.commit,
      parentShas: item.parentIds,
    }))
  }

  const highlightSet = new Set(scope.highlightBranchRefs ?? [])

  const layoutInputs = [
    ...(dirty
      ? [{ id: 'wip', parentIds: [] as string[], wip: true as const }]
      : []),
    ...commits.map((commit) => ({
      id: commit.sha,
      parentIds: commit.parentShas,
    })),
  ]

  const layout = layoutGithubCommitSwimlane(layoutInputs)
  const layoutById = new Map(layout.rows.map((row) => [row.id, row]))

  const rows: GithubSwimlaneRow[] = []
  if (dirty) {
    const wipLayout = layoutById.get('wip')
    if (wipLayout) {
      rows.push({
        id: 'wip',
        kind: 'wip',
        parentShas: [],
        subject: 'Uncommitted changes',
        isMerge: false,
        refLabels: [],
        prBadges: [],
        highlighted: false,
        layout: wipLayout,
      })
    }
  }

  for (const commit of commits) {
    const laid = layoutById.get(commit.sha)
    if (!laid) continue
    const refLabels = refsPointingAt(domainModel, commit.sha)
    const highlighted =
      highlightSet.size === 0
        ? false
        : refLabels.some((label) => highlightSet.has(label)) ||
          (scope.highlightBranchRefs?.some((ref) =>
            scope.branchRefs.includes(ref),
          ) &&
            laid.lane >= 0)
    rows.push({
      id: commit.sha,
      kind: 'commit',
      sha: commit.sha,
      parentShas: commit.parentShas,
      subject: shortSubject(commit.message),
      authorName: commit.authorName,
      authoredAt: commit.authoredAt,
      isMerge: laid.isMerge,
      refLabels,
      prBadges: prsTouchingCommit(domainModel, commit.sha, scope),
      highlighted:
        highlighted ||
        (scope.highlightFeatureId
          ? scope.highlightBranchRefs?.length
            ? refLabels.some((label) => highlightSet.has(label))
            : false
          : false),
      layout: laid,
    })
  }

  if (rows.length === 0) {
    return {
      rows: [],
      layout,
      emptyReason: 'no-commits',
      emptyMessage: scope.emptyMessage ?? 'No commits in this history window.',
      truncated,
    }
  }

  return { rows, layout, truncated }
}
