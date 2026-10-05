import type { MapArtifactType, MapContentDocument, MapWorkGroup } from '@contracts/index'
import {
  collectCanvasUnitBounds,
  expandWorkGroupSelectionToMemberNodeIds,
  groupArtifactsForCanvas,
  isValidWorkGroupLayout,
  nextWorkGroupTitle,
  type WorkGroupSelectionItem,
} from '@contracts/index'

export type WorkGroupSelectKind = 'member' | 'workgroup'

export interface WorkGroupSelectCandidate {
  key: string
  kind: WorkGroupSelectKind
  memberNodeId?: string
  workGroupId?: string
  title: string
  subtitle: string
  memberNodeIds: string[]
  disabled?: boolean
}

export interface WorkGroupSelectLabels {
  untitled: string
  workgroup: string
  memberCount: (count: number) => string
  artifactType: Record<MapArtifactType, string>
}

export interface WorkGroupMergePreview {
  effectiveMemberCount: number
  primaryWorkGroupTitle: string | null
  willCreateNew: boolean
  layoutValid: boolean
  willRearrange: boolean
  appendToExisting: boolean
  involvedGroupIds: string[]
}

function memberKey(memberNodeId: string): string {
  return `member:${memberNodeId}`
}

function workGroupKey(workGroupId: string): string {
  return `workgroup:${workGroupId}`
}

export function buildWorkGroupSelectCandidates(
  artifacts: MapContentDocument['artifacts'],
  workGroups: MapWorkGroup[],
  labels: WorkGroupSelectLabels,
  getDisplayTitle: (artifactId: string, fallback: string) => string,
): WorkGroupSelectCandidate[] {
  const candidates: WorkGroupSelectCandidate[] = []

  for (const group of workGroups) {
    candidates.push({
      key: workGroupKey(group.id),
      kind: 'workgroup',
      workGroupId: group.id,
      title: group.title,
      subtitle: labels.memberCount(group.memberNodeIds.length),
      memberNodeIds: [...group.memberNodeIds],
    })
  }

  for (const canvasGroup of groupArtifactsForCanvas(artifacts)) {
    const active = canvasGroup.active
    const title = getDisplayTitle(active.id, labels.untitled)
    const typeLabel = labels.artifactType[active.type] ?? active.type
    const stackSuffix =
      canvasGroup.members.length > 1 ? ` · ${labels.memberCount(canvasGroup.members.length)}` : ''
    candidates.push({
      key: memberKey(canvasGroup.nodeId),
      kind: 'member',
      memberNodeId: canvasGroup.nodeId,
      title,
      subtitle: `${typeLabel}${stackSuffix}`,
      memberNodeIds: [canvasGroup.nodeId],
    })
  }

  return candidates.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === 'workgroup' ? -1 : 1
    }
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  })
}

export function filterCandidatesByQuery(
  candidates: WorkGroupSelectCandidate[],
  query: string,
): WorkGroupSelectCandidate[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return candidates
  }
  return candidates.filter(
    (candidate) =>
      candidate.title.toLowerCase().includes(normalized) ||
      candidate.subtitle.toLowerCase().includes(normalized),
  )
}

function suggestionScore(candidate: WorkGroupSelectCandidate, normalized: string): number {
  const title = candidate.title.toLowerCase()
  const subtitle = candidate.subtitle.toLowerCase()
  if (title.startsWith(normalized)) {
    return 0
  }
  if (subtitle.startsWith(normalized)) {
    return 1
  }
  if (title.includes(normalized)) {
    return 2
  }
  if (subtitle.includes(normalized)) {
    return 3
  }
  return 99
}

export function rankSuggestions(
  candidates: WorkGroupSelectCandidate[],
  query: string,
  limit = 8,
): WorkGroupSelectCandidate[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return []
  }
  return [...candidates]
    .map((candidate) => ({ candidate, score: suggestionScore(candidate, normalized) }))
    .filter((entry) => entry.score < 99)
    .sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score
      }
      return a.candidate.title.localeCompare(b.candidate.title, undefined, {
        sensitivity: 'base',
      })
    })
    .slice(0, limit)
    .map((entry) => entry.candidate)
}

export function resolveSelectedItems(
  candidates: WorkGroupSelectCandidate[],
  selectedKeys: Set<string>,
): WorkGroupSelectionItem[] {
  const items: WorkGroupSelectionItem[] = []
  for (const candidate of candidates) {
    if (!selectedKeys.has(candidate.key)) {
      continue
    }
    if (candidate.kind === 'workgroup' && candidate.workGroupId) {
      items.push({ kind: 'workgroup', workGroupId: candidate.workGroupId })
      continue
    }
    if (candidate.kind === 'member' && candidate.memberNodeId) {
      items.push({ kind: 'member', memberNodeId: candidate.memberNodeId })
    }
  }
  return items
}

export function isMemberCoveredBySelection(
  memberNodeId: string,
  selectedKeys: Set<string>,
  candidates: WorkGroupSelectCandidate[],
): boolean {
  for (const candidate of candidates) {
    if (candidate.kind !== 'workgroup' || !selectedKeys.has(candidate.key)) {
      continue
    }
    if (candidate.memberNodeIds.includes(memberNodeId)) {
      return true
    }
  }
  return false
}

export function decorateCandidateDisabledState(
  candidates: WorkGroupSelectCandidate[],
  selectedKeys: Set<string>,
): WorkGroupSelectCandidate[] {
  return candidates.map((candidate) => {
    if (candidate.kind === 'member' && candidate.memberNodeId) {
      return {
        ...candidate,
        disabled: isMemberCoveredBySelection(candidate.memberNodeId, selectedKeys, candidates),
      }
    }
    return candidate
  })
}

export function previewMergeOutcome(
  document: MapContentDocument,
  items: WorkGroupSelectionItem[],
): WorkGroupMergePreview {
  const memberNodeIds = expandWorkGroupSelectionToMemberNodeIds(document, items)
  if (memberNodeIds.length === 0) {
    return {
      effectiveMemberCount: 0,
      primaryWorkGroupTitle: null,
      willCreateNew: false,
      layoutValid: true,
      willRearrange: false,
      appendToExisting: false,
      involvedGroupIds: [],
    }
  }

  const involvedGroupIds = new Set<string>()
  for (const item of items) {
    if (item.kind === 'workgroup') {
      involvedGroupIds.add(item.workGroupId)
    }
  }
  for (const memberNodeId of memberNodeIds) {
    const group = document.workGroups.find((candidate) =>
      candidate.memberNodeIds.includes(memberNodeId),
    )
    if (group) {
      involvedGroupIds.add(group.id)
    }
  }

  const primaryGroupId = items.find((item) => item.kind === 'workgroup')?.workGroupId ?? null
  const willCreateNew = involvedGroupIds.size === 0
  const primaryGroup =
    primaryGroupId && involvedGroupIds.has(primaryGroupId)
      ? document.workGroups.find((group) => group.id === primaryGroupId)
      : involvedGroupIds.size > 0
        ? document.workGroups.find((group) => involvedGroupIds.has(group.id))
        : undefined

  const memberBounds = collectCanvasUnitBounds(document.artifacts, memberNodeIds)
  const layoutValid = isValidWorkGroupLayout(memberBounds)
  const appendToExisting =
    primaryGroup !== undefined &&
    primaryGroupId !== null &&
    involvedGroupIds.has(primaryGroupId) &&
    memberNodeIds.some((memberNodeId) => !primaryGroup.memberNodeIds.includes(memberNodeId))
  const willRearrange = memberNodeIds.length > 1 && !layoutValid

  return {
    effectiveMemberCount: memberNodeIds.length,
    primaryWorkGroupTitle: willCreateNew
      ? nextWorkGroupTitle(document.workGroupSeq + 1)
      : (primaryGroup?.title ?? null),
    willCreateNew,
    layoutValid,
    willRearrange,
    appendToExisting,
    involvedGroupIds: [...involvedGroupIds],
  }
}
