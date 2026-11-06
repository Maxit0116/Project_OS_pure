import type { GithubDomainModel, GithubRelation } from '../../../../contracts/github-domain.js'
import { GITHUB_HISTORY_COMMIT_CAP } from '../../../../contracts/github-domain.js'
import type { GithubGraphActiveMode } from '../../../../contracts/github-graph-nav.js'
import type { GithubGraphNode } from '../../../../contracts/github-graph.js'
import {
  createDefaultHistoryScope,
  type GithubHistoryScope,
} from '../../../../contracts/github-history-scope.js'

function implementedBranches(
  featureId: string,
  relations: readonly GithubRelation[],
): string[] {
  return relations
    .filter(
      (rel) =>
        rel.kind === 'feature-implemented-by' &&
        rel.fromType === 'feature' &&
        rel.fromKey === featureId &&
        rel.toType === 'branch' &&
        !rel.stale,
    )
    .map((rel) => rel.toKey)
}

function unique(refs: string[]): string[] {
  return [...new Set(refs.filter(Boolean))]
}

function activeBranchNames(model: GithubDomainModel): string[] {
  return model.branches
    .filter((branch) => !branch.deleted)
    .map((branch) => branch.name)
}

function branchesUnderGroupPath(
  model: GithubDomainModel,
  path: string,
): string[] {
  const prefix = path.endsWith('/') ? path : `${path}/`
  return activeBranchNames(model).filter(
    (name) => name === path || name.startsWith(prefix),
  )
}

export interface ResolveHistoryScopeInput {
  node: GithubGraphNode
  model: GithubDomainModel
  returnMode: Extract<GithubGraphActiveMode, 'partition' | 'feature-tree'>
  /** Worktree node → branch name when known. */
  worktreeBranch?: string | null
  dirty?: boolean
}

/**
 * Map an overview node double-click into an L2 history scope.
 * Never invents git edges; empty association → emptyReason.
 */
export function resolveGithubHistoryScope(
  input: ResolveHistoryScopeInput,
): GithubHistoryScope {
  const { node, model, returnMode } = input
  const baseWindow = {
    kind: 'commit-cap' as const,
    commitCap: GITHUB_HISTORY_COMMIT_CAP,
  }

  if (node.kind === 'branch' || node.kind === 'default') {
    return createDefaultHistoryScope({
      sourceKind: node.kind === 'default' ? 'default' : 'branch',
      sourceId: node.id,
      branchRefs: [node.name],
      window: baseWindow,
      firstParentOnly: false,
      returnMode,
    })
  }

  if (node.kind === 'group') {
    const path = node.id.startsWith('group:')
      ? node.id.slice('group:'.length)
      : node.name
    const refs = branchesUnderGroupPath(model, path)
    if (refs.length === 0) {
      return createDefaultHistoryScope({
        sourceKind: 'group',
        sourceId: node.id,
        branchRefs: [],
        window: baseWindow,
        returnMode,
        emptyReason: 'no-commits',
        emptyMessage: `No branches under group “${path}”.`,
      })
    }
    return createDefaultHistoryScope({
      sourceKind: 'group',
      sourceId: node.id,
      branchRefs: refs,
      window: baseWindow,
      returnMode,
    })
  }

  if (node.kind === 'pr') {
    const prNumber = node.prNumber
    const pr = model.pullRequests.find((item) => item.number === prNumber)
    if (!pr || !prNumber) {
      return createDefaultHistoryScope({
        sourceKind: 'pr',
        sourceId: node.id,
        branchRefs: [],
        window: baseWindow,
        returnMode,
        emptyReason: 'not-found',
        emptyMessage: 'Pull request not found in domain model.',
      })
    }
    return createDefaultHistoryScope({
      sourceKind: 'pr',
      sourceId: node.id,
      branchRefs: [pr.headRef],
      prNumber,
      prBaseRef: pr.baseRef,
      prHeadRef: pr.headRef,
      window: baseWindow,
      returnMode,
    })
  }

  if (node.kind === 'worktree') {
    const branch = input.worktreeBranch?.trim() || null
    if (!branch) {
      return createDefaultHistoryScope({
        sourceKind: 'worktree',
        sourceId: node.id,
        branchRefs: [],
        window: baseWindow,
        returnMode,
        emptyReason: 'no-association',
        emptyMessage: 'This worktree has no checkout branch to show history for.',
      })
    }
    return createDefaultHistoryScope({
      sourceKind: 'worktree',
      sourceId: node.id,
      branchRefs: [branch],
      window: baseWindow,
      returnMode,
    })
  }

  if (node.kind === 'feature') {
    const featureId = node.id.startsWith('feature:')
      ? node.id.slice('feature:'.length)
      : node.id
    const feature = model.features.find((item) => item.id === featureId)
    if (!feature) {
      return createDefaultHistoryScope({
        sourceKind: 'feature',
        sourceId: node.id,
        branchRefs: [],
        window: baseWindow,
        highlightFeatureId: featureId,
        returnMode,
        emptyReason: 'not-found',
        emptyMessage: 'Feature not found in domain model.',
      })
    }
    const branches = unique(implementedBranches(featureId, model.relations))
    const prBranches = model.relations
      .filter(
        (rel) =>
          rel.kind === 'feature-reviewed-by' &&
          rel.fromType === 'feature' &&
          rel.fromKey === featureId &&
          rel.toType === 'pr' &&
          !rel.stale,
      )
      .map((rel) => Number.parseInt(rel.toKey, 10))
      .filter((n) => Number.isFinite(n))
      .flatMap((number) => {
        const pr = model.pullRequests.find((item) => item.number === number)
        return pr ? [pr.headRef] : []
      })
    const refs = unique([...branches, ...prBranches])
    if (refs.length === 0) {
      return createDefaultHistoryScope({
        sourceKind: 'feature',
        sourceId: node.id,
        branchRefs: [],
        window: baseWindow,
        highlightFeatureId: featureId,
        returnMode,
        emptyReason: 'no-association',
        emptyMessage:
          'No branch or PR is associated with this feature. Associate one to view its timeline.',
      })
    }
    return createDefaultHistoryScope({
      sourceKind: 'feature',
      sourceId: node.id,
      branchRefs: refs,
      window: baseWindow,
      highlightFeatureId: featureId,
      highlightBranchRefs: branches,
      returnMode,
    })
  }

  return createDefaultHistoryScope({
    sourceKind: 'default',
    sourceId: node.id,
    branchRefs: [],
    window: baseWindow,
    returnMode,
    emptyReason: 'unsupported',
    emptyMessage: `Cannot open history for node kind “${node.kind}”.`,
  })
}

/** Repo-root / default overview: active refs development window (not full archaeology). */
export function resolveDefaultRepoHistoryScope(
  model: GithubDomainModel,
  returnMode: Extract<GithubGraphActiveMode, 'partition' | 'feature-tree'>,
): GithubHistoryScope {
  const current =
    model.branches.find((branch) => !branch.deleted && branch.headSha)?.name ??
    model.repo.defaultBranch
  const refs = unique(
    [
      model.repo.defaultBranch,
      current,
      ...model.pullRequests
        .filter((pr) => pr.state === 'open')
        .map((pr) => pr.headRef),
    ].filter(Boolean),
  )
  return createDefaultHistoryScope({
    sourceKind: 'default',
    sourceId: `default:${model.repo.defaultBranch}`,
    branchRefs: refs.length > 0 ? refs : [model.repo.defaultBranch],
    window: {
      kind: 'commit-cap',
      commitCap: GITHUB_HISTORY_COMMIT_CAP,
    },
    returnMode,
  })
}
