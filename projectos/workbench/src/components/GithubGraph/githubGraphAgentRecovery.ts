/**
 * Detect GitHub Graph blockers that an agent can clear without a typed user prompt,
 * and build the recovery instruction sent through change-mode `sendPrompt`.
 */

export type GithubGraphRecoveryKind =
  | 'working-tree-dirty'
  | 'merge-conflict'
  | 'generic-git'

export type PendingGithubGraphAction =
  | { type: 'none' }
  | { type: 'checkout'; branch: string; nodeId: string }
  | { type: 'push'; branch: string }
  | { type: 'pull'; branch: string }
  | { type: 'rollback'; branch: string }
  | { type: 'revert'; sha: string }

export function classifyGithubGraphBlocker(
  message: string | null | undefined,
): GithubGraphRecoveryKind | null {
  if (!message) return null
  const m = message.toLowerCase()
  if (
    m.includes('working tree is dirty') ||
    m.includes('commit or stash') ||
    (m.includes('dirty') &&
      (m.includes('before') || m.includes('stash') || m.includes('commit')))
  ) {
    return 'working-tree-dirty'
  }
  if (
    m.includes('conflict') ||
    m.includes('merge failed') ||
    m.includes('revert failed')
  ) {
    return 'merge-conflict'
  }
  return null
}

export function isGithubGraphAgentRecoverable(
  message: string | null | undefined,
): boolean {
  return classifyGithubGraphBlocker(message) !== null
}

function pendingHint(pending: PendingGithubGraphAction): string {
  switch (pending.type) {
    case 'checkout':
      return `After the tree is clean, the user intends to check out branch "${pending.branch}".`
    case 'push':
      return `After the tree is clean, the user intends to push branch "${pending.branch}".`
    case 'pull':
      return `After the tree is clean, the user intends to pull branch "${pending.branch}" (ff-only).`
    case 'rollback':
      return `After the tree is clean, the user intends to hard-reset branch "${pending.branch}".`
    case 'revert':
      return `After the tree is clean, the user intends to safely revert commit ${pending.sha.slice(0, 12)}.`
    case 'none':
      return 'After the tree is clean, stop — the user will continue in the GitHub Graph.'
  }
}

/** Prompt sent automatically — do not require the user to type this. */
export function buildGithubGraphRecoveryPrompt(input: {
  kind: GithubGraphRecoveryKind
  blockerMessage: string
  pending: PendingGithubGraphAction
  defaultBranch?: string | null
}): string {
  const defaultBranch = input.defaultBranch?.trim() || 'main'
  const intent = pendingHint(input.pending)

  if (input.kind === 'working-tree-dirty') {
    return [
      'GitHub Graph is blocked by a dirty working tree.',
      `Error: ${input.blockerMessage}`,
      '',
      'Fix this so branch operations can continue. Prefer the least-destructive option that restores a clean tree:',
      '1. If changes are meaningful work-in-progress: create a short commit on the current branch (or stash with a clear message if committing is wrong).',
      '2. If changes are accidental/noise: stash or discard only clearly safe junk — do not delete real work without checking.',
      '3. Do not force-push. Do not switch away from the current branch unless required to finish the cleanup.',
      `4. Default branch for context: ${defaultBranch}.`,
      '',
      intent,
      '',
      'When done, leave the working tree clean (`git status` should show no uncommitted changes).',
    ].join('\n')
  }

  if (input.kind === 'merge-conflict') {
    return [
      'GitHub Graph hit a git conflict while mutating the repository.',
      `Error: ${input.blockerMessage}`,
      '',
      'Resolve or abort the conflict safely so the user can continue graph operations.',
      'Prefer aborting an in-progress revert/merge if the user did not intentionally start a conflicted edit, then restore a clean tree.',
      'Do not force-push.',
      '',
      intent,
    ].join('\n')
  }

  return [
    'GitHub Graph is blocked by a git error.',
    `Error: ${input.blockerMessage}`,
    '',
    'Inspect git status and fix the blocker with the smallest safe change so the graph can continue.',
    'Do not force-push unless the user already started a confirmed destructive reset.',
    '',
    intent,
  ].join('\n')
}
