import type { ArchitectureLevel, MapArtifact } from '@contracts/index'
import { getStackNodeId } from '@contracts/index'
import { architectureFileNodeId } from './architectureView'
import { getMapArtifactDisplayTitle } from './mapArtifactTitle'

export const MAP_SEARCH_HIT_LIMIT = 12

export type MapSearchHitKind = 'feature' | 'card' | 'workgroup'

export interface MapSearchHit {
  id: string
  canvasNodeId: string
  kind: MapSearchHitKind
  title: string
  level?: ArchitectureLevel
  parentId?: string | null
  artifactId?: string
  workGroupId?: string
}

export interface MapSearchFocusRequest {
  token: number
  canvasNodeId: string
  workGroupId?: string
}

export interface MapSearchNode {
  id: string
  name: string
  nameEn?: string
  level?: ArchitectureLevel
  parentId?: string | null
  linkedFiles?: Array<{ path: string }>
}

interface ScoredHit {
  hit: MapSearchHit
  score: number
  kindRank: number
}

const KIND_RANK: Record<MapSearchHitKind, number> = {
  feature: 0,
  card: 1,
  workgroup: 2,
}

function fileTitle(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

function scoreText(text: string, query: string): number | null {
  const haystack = text.trim().toLowerCase()
  if (!haystack) return null
  if (haystack === query) return 0
  if (haystack.startsWith(query)) return 1
  const index = haystack.indexOf(query)
  if (index < 0) return null
  return 2 + Math.min(index, 40) / 100
}

function bestScore(fields: string[], query: string): number | null {
  let best: number | null = null
  for (const field of fields) {
    const score = scoreText(field, query)
    if (score === null) continue
    if (best === null || score < best) best = score
  }
  return best
}

function pushHit(scored: ScoredHit[], seen: Set<string>, hit: MapSearchHit, score: number) {
  const key = `${hit.kind}:${hit.id}`
  if (seen.has(key)) return
  seen.add(key)
  scored.push({ hit, score, kindRank: KIND_RANK[hit.kind] })
}

export function buildMapSearchHits(input: {
  nodes: MapSearchNode[]
  artifacts?: MapArtifact[]
  workGroups?: Array<{ id: string; title: string }>
  query: string
  limit?: number
}): MapSearchHit[] {
  const query = input.query.trim().toLowerCase()
  if (!query) return []

  const scored: ScoredHit[] = []
  const seen = new Set<string>()
  const nodeIds = new Set(input.nodes.map((node) => node.id))

  for (const node of input.nodes) {
    const title = node.name.trim()
    if (!title) continue
    const score = bestScore([title, node.nameEn ?? ''], query)
    if (score === null) continue
    pushHit(
      scored,
      seen,
      {
        id: node.id,
        canvasNodeId: node.id,
        kind: 'feature',
        title,
        ...(node.level ? { level: node.level } : {}),
        parentId: node.parentId ?? null,
      },
      score,
    )
  }

  for (const node of input.nodes) {
    if (node.level !== 'component') continue
    for (const file of node.linkedFiles ?? []) {
      const path = file.path.trim()
      if (!path) continue
      const canvasNodeId = architectureFileNodeId(node.id, path)
      if (nodeIds.has(canvasNodeId)) continue
      const title = fileTitle(path)
      const score = bestScore([title, path], query)
      if (score === null) continue
      pushHit(
        scored,
        seen,
        {
          id: canvasNodeId,
          canvasNodeId,
          kind: 'feature',
          title,
          level: 'code',
          parentId: node.id,
        },
        score + 0.5,
      )
    }
  }

  for (const artifact of input.artifacts ?? []) {
    const title = getMapArtifactDisplayTitle(artifact, '').trim()
    if (!title) continue
    const score = bestScore([title], query)
    if (score === null) continue
    pushHit(
      scored,
      seen,
      {
        id: artifact.id,
        canvasNodeId: getStackNodeId(artifact),
        kind: 'card',
        title,
        artifactId: artifact.id,
      },
      score,
    )
  }

  for (const group of input.workGroups ?? []) {
    const title = group.title.trim()
    if (!title) continue
    const score = bestScore([title], query)
    if (score === null) continue
    pushHit(
      scored,
      seen,
      {
        id: group.id,
        canvasNodeId: group.id,
        kind: 'workgroup',
        title,
        workGroupId: group.id,
      },
      score,
    )
  }

  scored.sort((left, right) => {
    if (left.score !== right.score) return left.score - right.score
    if (left.kindRank !== right.kindRank) return left.kindRank - right.kindRank
    return left.hit.title.localeCompare(right.hit.title)
  })

  return scored.slice(0, input.limit ?? MAP_SEARCH_HIT_LIMIT).map((entry) => entry.hit)
}
