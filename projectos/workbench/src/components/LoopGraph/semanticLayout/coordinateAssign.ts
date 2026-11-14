import type {
  SemanticLayoutGraph,
  SemanticLayoutOptions,
  SemanticLayoutResult,
  SemanticNodeRole,
} from './types'
import {
  SEM_CORRIDOR_GAP,
  SEM_GAP_Y,
  SEM_ORIGIN,
  SEM_PARK_GAP_X,
  SEM_PARK_GAP_Y,
  SEM_SIDE_DROP,
} from './types'

/**
 * Role-aware TB coordinates (SL-D11/D13):
 * - spine nodes share one centerline X (colinear vertical trunk)
 * - side nodes sit in a left (or right) corridor, offset from spine
 * - parked nodes stack to the right of the primary AABB
 *
 * spineX is computed from actual node sizes to guarantee a minimum
 * SEM_CORRIDOR_GAP pixel gap between the widest side node and the spine:
 *   left corridor starts at origin.x
 *   spineX = origin.x + maxSideW + SEM_CORRIDOR_GAP + maxSpineW / 2
 * When there are no side nodes the spine simply starts at origin.x.
 *
 * Never horizontally packs an entire rank centered on the spine.
 */
export function assignSemanticCoordinates(input: {
  graph: SemanticLayoutGraph
  layers: string[][]
  ranks: Map<string, number>
  roles: Map<string, SemanticNodeRole>
  spineIds: readonly string[]
  sideCorridor: Map<string, 'left' | 'right'>
  parkedIds: readonly string[]
  options?: SemanticLayoutOptions
}): SemanticLayoutResult {
  const origin = input.options?.origin ?? SEM_ORIGIN
  const gapY = input.options?.gapY ?? SEM_GAP_Y
  const parkGapX = input.options?.parkGapX ?? SEM_PARK_GAP_X
  const layers = input.layers
  const corridorGap = SEM_CORRIDOR_GAP

  // ── Measure max widths ─────────────────────────────────────────────────────
  let maxSpineW = 200
  for (const id of input.spineIds) {
    maxSpineW = Math.max(maxSpineW, input.graph.sizes.get(id)?.width ?? 200)
  }

  let maxSideW = 200
  let hasSideNodes = false
  for (const [id, role] of input.roles) {
    if (role !== 'side') continue
    hasSideNodes = true
    maxSideW = Math.max(maxSideW, input.graph.sizes.get(id)?.width ?? 200)
  }

  // ── spineX: derived from geometry so nodes never overlap ──────────────────
  // With side nodes:
  //   left corridor occupies [origin.x … origin.x + maxSideW]
  //   gap of SEM_CORRIDOR_GAP separates it from the spine
  //   spineX = origin.x + maxSideW + corridorGap + maxSpineW / 2
  //
  // Without side nodes:
  //   spineX = origin.x + maxSpineW / 2  (spine touches origin left edge)
  const spineX =
    input.options?.spineX ??
    (hasSideNodes
      ? origin.x + maxSideW + corridorGap + maxSpineW / 2
      : origin.x + maxSpineW / 2)

  const leftCorridorCenterX = origin.x + maxSideW / 2
  const rightCorridorCenterX =
    spineX + maxSpineW / 2 + corridorGap + maxSideW / 2

  // ── Layer heights & tops ───────────────────────────────────────────────────
  const layerHeights = layers.map((layer) => {
    let maxH = 0
    for (const id of layer) {
      maxH = Math.max(maxH, input.graph.sizes.get(id)?.height ?? 88)
    }
    return Math.max(maxH, 48)
  })

  // Ranks holding only side nodes don't push the spine down by a full band:
  // the side node drops SEM_SIDE_DROP below the previous band and the next
  // spine band starts once half of it has passed, so the detour tucks into
  // the spine gap instead of stretching it.
  const spineSet = new Set(input.spineIds)
  const layerTop: number[] = []
  let bandBottom = origin.y - gapY
  for (let r = 0; r < layers.length; r += 1) {
    const layer = layers[r]!
    const h = layerHeights[r]!
    const sideOnly =
      r > 0 &&
      layer.length > 0 &&
      layer.every((id) => !spineSet.has(id) && input.roles.get(id) === 'side')
    if (sideOnly) {
      const top = bandBottom + SEM_SIDE_DROP
      layerTop[r] = top
      bandBottom = Math.max(bandBottom, top + h / 2 - gapY / 2)
    } else {
      const top = bandBottom + gapY
      layerTop[r] = top
      bandBottom = top + h
    }
  }

  const positions = new Map<string, { x: number; y: number }>()

  // ── 1) Spine: all share the same centerline X ──────────────────────────────
  for (const id of input.spineIds) {
    const rank = input.ranks.get(id) ?? 0
    const size = input.graph.sizes.get(id) ?? { width: 200, height: 88 }
    const top = layerTop[rank] ?? origin.y
    const layerH = layerHeights[rank] ?? size.height
    positions.set(id, {
      x: spineX - size.width / 2,
      y: top + (layerH - size.height) / 2,
    })
  }

  // ── 2) Side: corridor columns (stack if multiple nodes at same rank+side) ──
  const sideByKey = new Map<string, string[]>()
  for (const [id, role] of input.roles) {
    if (role !== 'side') continue
    const rank = input.ranks.get(id) ?? 0
    const side = input.sideCorridor.get(id) ?? 'left'
    const key = `${rank}:${side}`
    const list = sideByKey.get(key) ?? []
    list.push(id)
    sideByKey.set(key, list)
  }

  for (const [key, ids] of sideByKey) {
    ids.sort((a, b) => a.localeCompare(b))
    const [rankStr, side] = key.split(':') as [string, 'left' | 'right']
    const rank = Number(rankStr)
    const top = layerTop[rank] ?? origin.y
    const layerH = layerHeights[rank] ?? 88
    const corridorCenterX =
      side === 'left' ? leftCorridorCenterX : rightCorridorCenterX

    if (ids.length === 1) {
      const id = ids[0]!
      const size = input.graph.sizes.get(id) ?? { width: 200, height: 88 }
      positions.set(id, {
        x: corridorCenterX - size.width / 2,
        y: top + (layerH - size.height) / 2,
      })
      continue
    }

    // Multiple nodes at same rank+corridor: stack vertically inside the layer band.
    let localY = top
    for (const id of ids) {
      const size = input.graph.sizes.get(id) ?? { width: 200, height: 88 }
      positions.set(id, {
        x: corridorCenterX - size.width / 2,
        y: localY,
      })
      localY += size.height + 16
    }
  }

  // ── 3) Parked: right of primary AABB + parkGapX ────────────────────────────
  let maxRight = origin.x
  let minTop = origin.y
  for (const [id, pos] of positions) {
    const size = input.graph.sizes.get(id) ?? { width: 200, height: 88 }
    maxRight = Math.max(maxRight, pos.x + size.width)
    minTop = Math.min(minTop, pos.y)
  }

  const parkedSorted = [...input.parkedIds].sort((a, b) => a.localeCompare(b))
  let parkY = minTop
  const parkX = maxRight + parkGapX
  for (const id of parkedSorted) {
    const size = input.graph.sizes.get(id) ?? { width: 200, height: 88 }
    positions.set(id, { x: parkX, y: parkY })
    parkY += size.height + SEM_PARK_GAP_Y
  }

  return {
    positions,
    ranks: input.ranks,
    layers,
    spineX,
    roles: input.roles,
    spineIds: [...input.spineIds],
  }
}
