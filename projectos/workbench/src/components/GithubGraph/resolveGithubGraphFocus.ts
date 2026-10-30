import type {
  GithubDomainModel,
  GithubFeature,
  GithubRelation,
} from '@contracts/github-domain'

export type FocusResolution =
  | { kind: 'none'; reason: string }
  | { kind: 'one'; featureId?: string; branchRef?: string; commitSha?: string; prNumber?: number }
  | {
      kind: 'many'
      options: Array<{
        id: string
        label: string
        branchRef?: string
        commitSha?: string
        featureId?: string
        prNumber?: number
      }>
    }

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

function reviewedPrs(
  featureId: string,
  relations: readonly GithubRelation[],
): number[] {
  return relations
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
}

function featuresForBranch(
  branchRef: string,
  relations: readonly GithubRelation[],
): string[] {
  return relations
    .filter(
      (rel) =>
        rel.kind === 'feature-implemented-by' &&
        rel.toType === 'branch' &&
        rel.toKey === branchRef &&
        rel.fromType === 'feature' &&
        !rel.stale,
    )
    .map((rel) => rel.fromKey)
}

function featuresForPr(
  prNumber: number,
  relations: readonly GithubRelation[],
): string[] {
  const key = String(prNumber)
  return relations
    .filter(
      (rel) =>
        rel.kind === 'feature-reviewed-by' &&
        rel.toType === 'pr' &&
        rel.toKey === key &&
        rel.fromType === 'feature' &&
        !rel.stale,
    )
    .map((rel) => rel.fromKey)
}

function headShaForBranch(
  model: GithubDomainModel,
  branchRef: string,
): string | undefined {
  const branch = model.branches.find((item) => item.name === branchRef)
  return branch?.headSha ?? undefined
}

function featureLabel(
  features: readonly GithubFeature[],
  id: string,
): string {
  return features.find((feature) => feature.id === id)?.title ?? id
}

/** Feature Tree → Git History focus. Never invents commit links. */
export function resolveFeatureToHistoryFocus(
  model: GithubDomainModel,
  featureId: string,
): FocusResolution {
  const feature = model.features.find((item) => item.id === featureId)
  if (!feature) {
    return { kind: 'none', reason: 'Feature not found in domain model.' }
  }
  const branches = implementedBranches(featureId, model.relations)
  const prs = reviewedPrs(featureId, model.relations)

  if (branches.length === 0 && prs.length === 0) {
    return {
      kind: 'none',
      reason:
        'No branch or PR is associated with this feature. Associate one, or browse the full repository history.',
    }
  }

  if (branches.length === 1 && prs.length === 0) {
    const branchRef = branches[0]!
    return {
      kind: 'one',
      featureId,
      branchRef,
      commitSha: headShaForBranch(model, branchRef),
    }
  }

  if (prs.length === 1 && branches.length === 0) {
    const prNumber = prs[0]!
    const pr = model.pullRequests.find((item) => item.number === prNumber)
    return {
      kind: 'one',
      featureId,
      prNumber,
      branchRef: pr?.headRef,
      commitSha: pr?.headSha ?? (pr ? headShaForBranch(model, pr.headRef) : undefined),
    }
  }

  const options: Extract<FocusResolution, { kind: 'many' }>['options'] = []
  for (const branchRef of branches) {
    options.push({
      id: `branch:${branchRef}`,
      label: branchRef,
      branchRef,
      featureId,
      commitSha: headShaForBranch(model, branchRef),
    })
  }
  for (const prNumber of prs) {
    const pr = model.pullRequests.find((item) => item.number === prNumber)
    options.push({
      id: `pr:${prNumber}`,
      label: pr ? `#${prNumber} ${pr.title}` : `#${prNumber}`,
      prNumber,
      featureId,
      branchRef: pr?.headRef,
      commitSha: pr?.headSha,
    })
  }
  return { kind: 'many', options }
}

/** Git History → Feature Tree focus. */
export function resolveHistoryToFeatureFocus(
  model: GithubDomainModel,
  input: { branchRef?: string | null; prNumber?: number | null; commitSha?: string | null },
): FocusResolution {
  const featureIds = new Set<string>()
  if (input.branchRef) {
    for (const id of featuresForBranch(input.branchRef, model.relations)) {
      featureIds.add(id)
    }
  }
  if (input.prNumber) {
    for (const id of featuresForPr(input.prNumber, model.relations)) {
      featureIds.add(id)
    }
  }
  // Commits only resolve through branch/PR associations — never guessed.
  if (featureIds.size === 0 && input.commitSha) {
    for (const branch of model.branches) {
      if (branch.headSha === input.commitSha) {
        for (const id of featuresForBranch(branch.name, model.relations)) {
          featureIds.add(id)
        }
      }
    }
  }

  const ids = [...featureIds]
  if (ids.length === 0) {
    return {
      kind: 'none',
      reason:
        'No feature is linked to this selection. You can associate a feature from the Feature Tree.',
    }
  }
  if (ids.length === 1) {
    return { kind: 'one', featureId: ids[0] }
  }
  return {
    kind: 'many',
    options: ids.map((id) => ({
      id,
      label: featureLabel(model.features, id),
      featureId: id,
    })),
  }
}
