import type {
  GithubBranchRef,
  GithubCommit,
  GithubDomainModel,
  GithubFeature,
  GithubPullRequestRef,
  GithubRelation,
  GithubRepoRef,
} from '@contracts/github-domain'
import { GITHUB_HISTORY_COMMIT_CAP } from '@contracts/github-domain'
import type {
  WorkspaceGitBranch,
  WorkspaceGitCommit,
  WorkspaceGitPullRequest,
} from '@contracts/workspace-git'

export interface AssembleGithubDomainInput {
  repoLabel: string
  defaultBranch: string | null
  remoteUrl?: string
  branches: readonly WorkspaceGitBranch[]
  commits?: readonly WorkspaceGitCommit[]
  pullRequests?: readonly WorkspaceGitPullRequest[]
  features?: readonly GithubFeature[]
  associations?: readonly GithubRelation[]
  lastSyncedAt?: string
}

function repoPosId(fullName: string): string {
  return `repo:${fullName}`
}

/** Normalize workspace git + optional features into one domain snapshot. */
export function assembleGithubDomainModel(
  input: AssembleGithubDomainInput,
): GithubDomainModel {
  const fullName = input.repoLabel.trim() || 'workspace'
  const defaultBranch = input.defaultBranch ?? 'main'
  const repo: GithubRepoRef = {
    posId: repoPosId(fullName),
    fullName,
    defaultBranch,
    ...(input.remoteUrl ? { remoteUrl: input.remoteUrl } : {}),
    ...(input.lastSyncedAt ? { lastSyncedAt: input.lastSyncedAt } : {}),
  }

  const branches: GithubBranchRef[] = input.branches.map((branch) => ({
    name: branch.name,
    remote: branch.remote,
    ...(branch.upstream ? { upstream: branch.upstream } : {}),
    deleted: false,
  }))

  const commits: GithubCommit[] = (input.commits ?? [])
    .slice(0, GITHUB_HISTORY_COMMIT_CAP)
    .map((commit) => ({
      sha: commit.sha,
      parentShas: commit.parentShas,
      message: commit.message,
      ...(commit.authorName ? { authorName: commit.authorName } : {}),
      ...(commit.authoredAt ? { authoredAt: commit.authoredAt } : {}),
    }))

  const pullRequests: GithubPullRequestRef[] = (input.pullRequests ?? []).map(
    (pr) => ({
      number: pr.number,
      title: pr.title,
      url: pr.url,
      headRef: pr.headRef,
      baseRef: pr.baseRef,
      state: pr.state,
    }),
  )

  const features = [...(input.features ?? [])]
  const relations: GithubRelation[] = [...(input.associations ?? [])]

  // Authoritative git parent edges.
  for (const commit of commits) {
    for (const parent of commit.parentShas) {
      relations.push({
        id: `rel:cp:${commit.sha}:${parent}`,
        kind: 'commit-parent',
        fromType: 'commit',
        fromKey: commit.sha,
        toType: 'commit',
        toKey: parent,
        source: 'git',
        stale: false,
      })
    }
  }

  return {
    repo,
    features,
    branches,
    commits,
    pullRequests,
    relations,
  }
}
