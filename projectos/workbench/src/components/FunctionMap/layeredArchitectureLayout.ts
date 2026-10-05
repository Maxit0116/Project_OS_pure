import type { ArchitectureLayer, FunctionalNode } from '@contracts/index'
import type { GridArea } from './autoGridLayout'
import { NODE_HEIGHT, NODE_WIDTH } from './autoGridLayout'

const BAND_HEADER_HEIGHT = 38
const BAND_PADDING = 18
export const LAYER_BAND_GAP = 16
const BAND_GAP = LAYER_BAND_GAP
const NODE_GAP_X = 22
const NODE_GAP_Y = 16
/** Minimum visible gap between node boxes (borders/shadows need breathing room). */
const MIN_NODE_SEP = 4
const MAX_COLUMNS_PER_LAYER = 6
const BARYCENTER_PASSES = 8
const NUDGE_MIN_SEP = 14
const MIN_ROWS_FOR_EDGES = 2
const MAX_COLUMNS_WITH_EDGES = 3

export interface LayoutEdgeRef {
  source: string
  target: string
}

export interface ArchitectureLayerBandLayout {
  id: string
  label: string
  description: string
  position: { x: number; y: number }
  width: number
  height: number
}

export interface LayeredArchitectureLayout {
  positionsById: Record<string, { x: number; y: number }>
  bands: ArchitectureLayerBandLayout[]
  bounds: { minX: number; minY: number; width: number; height: number }
}

function maxColumnsForWidth(contentWidth: number): number {
  return Math.max(
    1,
    Math.floor((contentWidth + NODE_GAP_X) / (NODE_WIDTH + NODE_GAP_X)),
  )
}

function nodeSortKey(node: FunctionalNode): string {
  return (node.nameEn ?? node.name).toLowerCase()
}

function segmentHitsBox(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  hW: number,
  hH: number,
): boolean {
  const dx = bx - ax
  const dy = by - ay
  const p = [-dx, dx, -dy, dy]
  const q = [ax - (cx - hW), cx + hW - ax, ay - (cy - hH), cy + hH - ay]
  let u1 = 0
  let u2 = 1
  for (let i = 0; i < 4; i += 1) {
    if (Math.abs(p[i]) < 1e-12) {
      if (q[i] < 0) return false
    } else {
      const r = q[i] / p[i]
      if (p[i] < 0) {
        if (r > u2) return false
        if (r > u1) u1 = r
      } else {
        if (r < u1) return false
        if (r < u2) u2 = r
      }
    }
  }
  return u1 <= u2 && u2 > 0.04 && u1 < 0.96
}

function reorderByBarycenter(
  layerNodes: FunctionalNode[],
  layerIndex: number,
  layerIndices: Map<string, number>,
  neighbors: Map<string, string[]>,
  orderIndex: Map<string, number>,
): FunctionalNode[] {
  const pitch = NODE_WIDTH + NODE_GAP_X
  const scored = layerNodes.map((node) => {
    const neighborIds = neighbors.get(node.id) ?? []
    let sum = 0
    let count = 0
    for (const neighborId of neighborIds) {
      const neighborLayer = layerIndices.get(neighborId)
      if (neighborLayer === undefined || neighborLayer === layerIndex) continue
      const neighborOrder = orderIndex.get(neighborId)
      if (neighborOrder === undefined) continue
      sum += neighborOrder * pitch
      count += 1
    }
    const barycenter = count > 0 ? sum / count : orderIndex.get(node.id)! * pitch
    return { node, barycenter }
  })
  scored.sort(
    (a, b) =>
      a.barycenter - b.barycenter ||
      nodeSortKey(a.node).localeCompare(nodeSortKey(b.node)) ||
      a.node.id.localeCompare(b.node.id),
  )
  return scored.map((entry) => entry.node)
}

function placeLayerNodesLeftAligned(
  layerNodes: FunctionalNode[],
  columns: number,
): {
  localPositions: Map<string, { x: number; y: number }>
  maxRowWidth: number
  rows: number
} {
  const localPositions = new Map<string, { x: number; y: number }>()
  const rows = Math.ceil(layerNodes.length / columns)
  let maxRowWidth = 0

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const rowNodes = layerNodes.slice(rowIndex * columns, (rowIndex + 1) * columns)
    const rowWidth =
      rowNodes.length * NODE_WIDTH + Math.max(0, rowNodes.length - 1) * NODE_GAP_X
    maxRowWidth = Math.max(maxRowWidth, rowWidth)
    rowNodes.forEach((node, columnIndex) => {
      localPositions.set(node.id, {
        x: columnIndex * (NODE_WIDTH + NODE_GAP_X),
        y: rowIndex * (NODE_HEIGHT + NODE_GAP_Y),
      })
    })
  }

  return { localPositions, maxRowWidth, rows }
}

function separateNodeBoxFromEdge(
  position: { x: number; y: number },
  ax: number,
  ay: number,
  bx: number,
  by: number,
): void {
  const cx = position.x + NODE_WIDTH / 2
  const cy = position.y + NODE_HEIGHT / 2
  const hitHW = NODE_WIDTH / 2 + NUDGE_MIN_SEP
  const hitHH = NODE_HEIGHT / 2 + NUDGE_MIN_SEP
  if (!segmentHitsBox(ax, ay, bx, by, cx, cy, hitHW, hitHH)) return

  const dxs = bx - ax
  const dys = by - ay
  const corridorHalf = NODE_WIDTH / 2 + NUDGE_MIN_SEP

  if (Math.abs(dxs) <= Math.abs(dys) * 1.15) {
    const corridorX = (ax + bx) / 2
    const corridorLeft = corridorX - corridorHalf
    const corridorRight = corridorX + corridorHalf
    const nodeLeft = position.x
    const nodeRight = position.x + NODE_WIDTH
    if (nodeRight <= corridorLeft || nodeLeft >= corridorRight) return
    if (cx <= corridorX) {
      position.x = corridorLeft - NODE_WIDTH - 4
    } else {
      position.x = corridorRight + 4
    }
    return
  }

  const l2 = dxs * dxs + dys * dys || 1
  let t = ((cx - ax) * dxs + (cy - ay) * dys) / l2
  t = Math.max(0, Math.min(1, t))
  const px = ax + t * dxs
  const side = cx >= px ? 1 : -1
  position.x = px + side * (corridorHalf + 4) - NODE_WIDTH / 2
  if (segmentHitsBox(ax, ay, bx, by, position.x + NODE_WIDTH / 2, cy, hitHW, hitHH)) {
    position.x += side * (NODE_WIDTH + NUDGE_MIN_SEP)
  }
}

function separateAllNodeBoxesFromEdges(
  positionsById: Record<string, { x: number; y: number }>,
  edges: LayoutEdgeRef[],
): boolean {
  let moved = false
  const center = (id: string) => {
    const position = positionsById[id]
    if (!position) return null
    return { x: position.x + NODE_WIDTH / 2, y: position.y + NODE_HEIGHT / 2 }
  }

  for (const edge of edges) {
    const a = center(edge.source)
    const b = center(edge.target)
    if (!a || !b) continue
    for (const [id, position] of Object.entries(positionsById)) {
      if (id === edge.source || id === edge.target) continue
      const beforeX = position.x
      separateNodeBoxFromEdge(position, a.x, a.y, b.x, b.y)
      if (position.x !== beforeX) moved = true
    }
  }
  return moved
}

function resolveEdgeNodeSeparations(
  positionsById: Record<string, { x: number; y: number }>,
  edges: LayoutEdgeRef[],
): void {
  for (let pass = 0; pass < 24; pass += 1) {
    separateAllNodeBoxesFromEdges(positionsById, edges)
    if (countEdgeHitsOnNodes(positionsById, edges) === 0) break
  }
}

function rowKeyForY(y: number): number {
  return Math.round(y / (NODE_HEIGHT + NODE_GAP_Y))
}

function colKeyForX(x: number): number {
  return Math.round(x / (NODE_WIDTH + NODE_GAP_X))
}

/**
 * Keep stacked layer bands from overlapping. Does not rearrange nodes inside a
 * layer — relationship-driven spacing is preserved.
 */
function enforceMinimumBandSeparation(
  bands: ArchitectureLayerBandLayout[],
  layerPlans: Array<{ layerNodes: FunctionalNode[] }>,
  positionsById: Record<string, { x: number; y: number }>,
  minGap: number = BAND_GAP,
): void {
  for (let index = 1; index < bands.length; index += 1) {
    const previous = bands[index - 1]!
    const current = bands[index]!
    const minY = previous.position.y + previous.height + minGap
    if (current.position.y >= minY - 0.5) {
      continue
    }
    const delta = minY - current.position.y
    for (let bandIndex = index; bandIndex < bands.length; bandIndex += 1) {
      bands[bandIndex]!.position.y += delta
    }
    for (let planIndex = index; planIndex < layerPlans.length; planIndex += 1) {
      for (const node of layerPlans[planIndex]!.layerNodes) {
        const position = positionsById[node.id]
        if (position) {
          position.y += delta
        }
      }
    }
  }
}

export function countBandSeparationViolations(
  bands: ArchitectureLayerBandLayout[],
  minGap: number = LAYER_BAND_GAP,
): number {
  const sorted = [...bands].sort((a, b) => a.position.y - b.position.y)
  let violations = 0
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!
    const current = sorted[index]!
    if (current.position.y < previous.position.y + previous.height + minGap - 0.5) {
      violations += 1
    }
  }
  return violations
}

export function maxIntraLayerGap(
  layerNodeIds: string[],
  positionsById: Record<string, { x: number; y: number }>,
): { maxGapX: number; maxGapY: number } {
  let maxGapX = 0
  let maxGapY = 0

  const rows = new Map<number, string[]>()
  const columns = new Map<number, string[]>()
  for (const id of layerNodeIds) {
    const position = positionsById[id]
    if (!position) continue
    const row = rows.get(rowKeyForY(position.y)) ?? []
    row.push(id)
    rows.set(rowKeyForY(position.y), row)
    const column = columns.get(colKeyForX(position.x)) ?? []
    column.push(id)
    columns.set(colKeyForX(position.x), column)
  }

  for (const rowIds of rows.values()) {
    const sorted = [...rowIds].sort(
      (a, b) => positionsById[a]!.x - positionsById[b]!.x,
    )
    for (let index = 1; index < sorted.length; index += 1) {
      const gap =
        positionsById[sorted[index]!]!.x -
        (positionsById[sorted[index - 1]!]!.x + NODE_WIDTH)
      maxGapX = Math.max(maxGapX, gap)
    }
  }

  for (const columnIds of columns.values()) {
    const sorted = [...columnIds].sort(
      (a, b) => positionsById[a]!.y - positionsById[b]!.y,
    )
    for (let index = 1; index < sorted.length; index += 1) {
      const gap =
        positionsById[sorted[index]!]!.y -
        (positionsById[sorted[index - 1]!]!.y + NODE_HEIGHT)
      maxGapY = Math.max(maxGapY, gap)
    }
  }

  return { maxGapX, maxGapY }
}

function groupNodesByAlignedRow(
  layerNodeIds: string[],
  positionsById: Record<string, { x: number; y: number }>,
): string[][] {
  const epsilon = 0.5
  const sorted = [...layerNodeIds]
    .filter((id) => positionsById[id])
    .sort((a, b) => {
      const dy = positionsById[a]!.y - positionsById[b]!.y
      if (Math.abs(dy) > epsilon) return dy
      return positionsById[a]!.x - positionsById[b]!.x
    })
  const groups: string[][] = []
  for (const id of sorted) {
    const y = positionsById[id]!.y
    const last = groups[groups.length - 1]
    if (!last || Math.abs(y - positionsById[last[0]!]!.y) > epsilon) {
      groups.push([id])
    } else {
      last.push(id)
    }
  }
  return groups
}

/**
 * Remove empty leading horizontal space on sparse single-node rows. Multi-node
 * rows are trimmed as a unit so intra-row gaps stay relationship-driven.
 */
function trimLeadingRowOffsetInLayer(
  layerNodeIds: string[],
  positionsById: Record<string, { x: number; y: number }>,
): void {
  const ids = layerNodeIds.filter((id) => positionsById[id])
  if (ids.length === 0) return

  const layerMinX = Math.min(...ids.map((id) => positionsById[id]!.x))
  for (const rowIds of groupNodesByAlignedRow(ids, positionsById)) {
    const rowMinX = Math.min(...rowIds.map((id) => positionsById[id]!.x))
    const delta = rowMinX - layerMinX
    if (delta <= 0.5) continue
    for (const id of rowIds) {
      positionsById[id]!.x -= delta
    }
  }
}

function trimHorizontalSlackInLayers(
  layerPlans: Array<{ layerNodes: FunctionalNode[] }>,
  positionsById: Record<string, { x: number; y: number }>,
): void {
  for (const plan of layerPlans) {
    trimLeadingRowOffsetInLayer(
      plan.layerNodes.map((node) => node.id),
      positionsById,
    )
  }
}

/** After horizontal trim, re-open vertical pitch inside each column without moving X. */
function separateVerticalColumnStacksInLayer(
  layerNodeIds: string[],
  positionsById: Record<string, { x: number; y: number }>,
): void {
  const columns = new Map<number, string[]>()
  for (const id of layerNodeIds) {
    const position = positionsById[id]
    if (!position) continue
    const key = colKeyForX(position.x)
    const column = columns.get(key) ?? []
    column.push(id)
    columns.set(key, column)
  }

  for (const columnIds of columns.values()) {
    const sorted = [...columnIds].sort(
      (a, b) => positionsById[a]!.y - positionsById[b]!.y,
    )
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = positionsById[sorted[index - 1]!]!
      const current = positionsById[sorted[index]!]!
      const minY = previous.y + NODE_HEIGHT + NODE_GAP_Y
      if (current.y < minY) {
        current.y = minY
      }
    }
  }
}

function separateVerticalColumnStacksInLayers(
  layerPlans: Array<{ layerNodes: FunctionalNode[] }>,
  positionsById: Record<string, { x: number; y: number }>,
): void {
  for (const plan of layerPlans) {
    separateVerticalColumnStacksInLayer(
      plan.layerNodes.map((node) => node.id),
      positionsById,
    )
  }
}

function compactLayerRows(
  layerNodeIds: string[],
  positionsById: Record<string, { x: number; y: number }>,
  edges: LayoutEdgeRef[],
  minLeft: number,
): void {
  for (const rowIds of groupNodesByAlignedRow(layerNodeIds, positionsById)) {
    const sorted = [...rowIds].sort(
      (a, b) => positionsById[a]!.x - positionsById[b]!.x,
    )
    const saved = sorted.map((id) => ({ id, x: positionsById[id]!.x }))
    let cursor = minLeft
    for (const id of sorted) {
      positionsById[id]!.x = cursor
      cursor += NODE_WIDTH + NODE_GAP_X
    }
    if (countEdgeHitsOnNodes(positionsById, edges) > 0) {
      for (const entry of saved) {
        positionsById[entry.id]!.x = entry.x
      }
    }
  }
}

function compactSeparatedLayout(
  positionsById: Record<string, { x: number; y: number }>,
  layerPlans: Array<{ layerNodes: FunctionalNode[] }>,
  edges: LayoutEdgeRef[],
  minLeft: number,
): void {
  for (const plan of layerPlans) {
    compactLayerRows(
      plan.layerNodes.map((node) => node.id),
      positionsById,
      edges,
      minLeft,
    )
  }
}

function normalizeLayoutMinX(
  positionsById: Record<string, { x: number; y: number }>,
  bands: ArchitectureLayerBandLayout[],
  minX: number,
): void {
  const nodeMinX = boundsFromPositions(positionsById).minX
  const bandMinX = bands.length > 0 ? Math.min(...bands.map((band) => band.position.x)) : nodeMinX
  const layoutMinX = Math.min(nodeMinX, bandMinX)
  if (layoutMinX >= minX) return
  const shift = minX - layoutMinX
  for (const position of Object.values(positionsById)) {
    position.x += shift
  }
  for (const band of bands) {
    band.position.x += shift
  }
}

function refitBandToNodes(
  band: ArchitectureLayerBandLayout,
  nodeIds: string[],
  positionsById: Record<string, { x: number; y: number }>,
): void {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const id of nodeIds) {
    const position = positionsById[id]
    if (!position) continue
    minX = Math.min(minX, position.x)
    maxX = Math.max(maxX, position.x + NODE_WIDTH)
    minY = Math.min(minY, position.y)
    maxY = Math.max(maxY, position.y + NODE_HEIGHT)
  }

  if (minX === Number.POSITIVE_INFINITY) return

  band.position.x = minX - BAND_PADDING
  band.position.y = minY - BAND_HEADER_HEIGHT - BAND_PADDING
  band.width = maxX - minX + BAND_PADDING * 2
  band.height = maxY - minY + BAND_HEADER_HEIGHT + BAND_PADDING * 2
}

function countEdgeHitsOnNodes(
  positionsById: Record<string, { x: number; y: number }>,
  edges: LayoutEdgeRef[],
): number {
  const center = (id: string) => {
    const position = positionsById[id]
    if (!position) return null
    return { x: position.x + NODE_WIDTH / 2, y: position.y + NODE_HEIGHT / 2 }
  }
  let hits = 0
  for (const edge of edges) {
    const a = center(edge.source)
    const b = center(edge.target)
    if (!a || !b) continue
    for (const id of Object.keys(positionsById)) {
      if (id === edge.source || id === edge.target) continue
      const c = center(id)
      if (!c) continue
      if (
        segmentHitsBox(
          a.x,
          a.y,
          b.x,
          b.y,
          c.x,
          c.y,
          NODE_WIDTH / 2 + NUDGE_MIN_SEP,
          NODE_HEIGHT / 2 + NUDGE_MIN_SEP,
        )
      ) {
        hits += 1
      }
    }
  }
  return hits
}

function columnsForLayerNodes(
  layerNodeCount: number,
  maxColumns: number,
  hasEdges: boolean,
): number {
  let columns = Math.min(maxColumns, Math.max(1, layerNodeCount))
  if (!hasEdges || layerNodeCount < 4) return columns
  columns = Math.min(columns, Math.ceil(layerNodeCount / MIN_ROWS_FOR_EDGES))
  if (layerNodeCount >= 6) {
    columns = Math.min(columns, MAX_COLUMNS_WITH_EDGES)
  }
  return Math.max(1, columns)
}

function nodeBoxOverlapAmount(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { overlapX: number; overlapY: number } {
  return {
    overlapX: NODE_WIDTH + MIN_NODE_SEP - Math.abs(b.x - a.x),
    overlapY: NODE_HEIGHT + MIN_NODE_SEP - Math.abs(b.y - a.y),
  }
}

export function countNodeBoxOverlaps(
  positionsById: Record<string, { x: number; y: number }>,
): number {
  const ids = Object.keys(positionsById)
  let overlaps = 0
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const { overlapX, overlapY } = nodeBoxOverlapAmount(
        positionsById[ids[i]]!,
        positionsById[ids[j]]!,
      )
      if (overlapX > 0 && overlapY > 0) overlaps += 1
    }
  }
  return overlaps
}

function resolveNodeBoxOverlaps(
  positionsById: Record<string, { x: number; y: number }>,
  layerIndexById: Map<string, number> = new Map(),
  passes = 32,
): void {
  const ids = Object.keys(positionsById)
  if (ids.length < 2) return

  const centers = ids.map((id) => ({
    id,
    cx: positionsById[id]!.x + NODE_WIDTH / 2,
    cy: positionsById[id]!.y + NODE_HEIGHT / 2,
  }))
  const halfW = NODE_WIDTH / 2 + MIN_NODE_SEP / 2
  const halfH = NODE_HEIGHT / 2 + MIN_NODE_SEP / 2

  for (let pass = 0; pass < passes; pass += 1) {
    let moved = false
    for (let i = 0; i < centers.length; i += 1) {
      for (let j = i + 1; j < centers.length; j += 1) {
        const a = centers[i]!
        const b = centers[j]!
        const dx = b.cx - a.cx
        const dy = b.cy - a.cy
        const overlapX = halfW * 2 - Math.abs(dx)
        const overlapY = halfH * 2 - Math.abs(dy)
        if (overlapX <= 0 || overlapY <= 0) continue
        const sameLayer =
          layerIndexById.size === 0 ||
          layerIndexById.get(a.id) === layerIndexById.get(b.id)
        const separateHorizontally = overlapX <= overlapY || !sameLayer
        if (separateHorizontally) {
          const push = (overlapX / 2) * Math.sign(dx || 1)
          a.cx -= push
          b.cx += push
        } else {
          const push = (overlapY / 2) * Math.sign(dy || 1)
          a.cy -= push
          b.cy += push
        }
        moved = true
      }
    }
    if (!moved) break
  }

  for (const center of centers) {
    positionsById[center.id] = {
      x: center.cx - NODE_WIDTH / 2,
      y: center.cy - NODE_HEIGHT / 2,
    }
  }
}

function refitAllBands(
  bands: ArchitectureLayerBandLayout[],
  layerPlans: Array<{ layerNodes: FunctionalNode[] }>,
  positionsById: Record<string, { x: number; y: number }>,
): void {
  for (let planIndex = 0; planIndex < layerPlans.length; planIndex += 1) {
    const plan = layerPlans[planIndex]!
    refitBandToNodes(bands[planIndex]!, plan.layerNodes.map((node) => node.id), positionsById)
  }
}

function resolveLayoutCollisions(
  positionsById: Record<string, { x: number; y: number }>,
  layerIndexById: Map<string, number>,
  edges: LayoutEdgeRef[],
  maxPasses = 16,
): void {
  for (let pass = 0; pass < maxPasses; pass += 1) {
    resolveNodeBoxOverlaps(positionsById, layerIndexById)
    if (edges.length > 0) {
      resolveEdgeNodeSeparations(positionsById, edges)
    }
    if (
      countNodeBoxOverlaps(positionsById) === 0 &&
      (edges.length === 0 || countEdgeHitsOnNodes(positionsById, edges) === 0)
    ) {
      break
    }
  }
}

function resolveLayoutOverlapsOnly(
  positionsById: Record<string, { x: number; y: number }>,
  layerIndexById: Map<string, number>,
  maxPasses = 12,
): void {
  for (let pass = 0; pass < maxPasses; pass += 1) {
    resolveNodeBoxOverlaps(positionsById, layerIndexById)
    if (countNodeBoxOverlaps(positionsById) === 0) {
      break
    }
  }
}

function boundsFromPositions(
  positionsById: Record<string, { x: number; y: number }>,
): { minX: number; minY: number; width: number; height: number } {
  const points = Object.values(positionsById)
  if (points.length === 0) {
    return { minX: 0, minY: 0, width: 0, height: 0 }
  }
  const minX = Math.min(...points.map((p) => p.x))
  const minY = Math.min(...points.map((p) => p.y))
  const maxX = Math.max(...points.map((p) => p.x + NODE_WIDTH))
  const maxY = Math.max(...points.map((p) => p.y + NODE_HEIGHT))
  return { minX, minY, width: maxX - minX, height: maxY - minY }
}

export function computeLayeredArchitectureLayout(
  nodes: FunctionalNode[],
  configuredLayers: ArchitectureLayer[],
  area: GridArea,
  edges: LayoutEdgeRef[] = [],
): LayeredArchitectureLayout {
  const positionsById: Record<string, { x: number; y: number }> = {}
  const nodesByLayer = new Map<string, FunctionalNode[]>()
  const layerIndices = new Map<string, number>()

  for (const node of nodes) {
    if (!node.layer) continue
    const group = nodesByLayer.get(node.layer) ?? []
    group.push(node)
    nodesByLayer.set(node.layer, group)
  }

  const configuredById = new Map(configuredLayers.map((layer) => [layer.id, layer]))
  const layers = [...nodesByLayer.keys()]
    .map((id) =>
      configuredById.get(id) ?? {
        id,
        label: id.replace(/_/g, ' '),
        order: Number.MAX_SAFE_INTEGER,
        description: 'Architecture layer',
      },
    )
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))

  layers.forEach((layer, index) => {
    const layerNodes = nodesByLayer.get(layer.id) ?? []
    layerNodes.forEach((node) => layerIndices.set(node.id, index))
  })

  const layerIndexById = new Map(layerIndices)

  const nodeIdSet = new Set(nodes.map((node) => node.id))
  const validEdges = edges.filter(
    (edge) =>
      nodeIdSet.has(edge.source) &&
      nodeIdSet.has(edge.target) &&
      edge.source !== edge.target,
  )

  const neighbors = new Map<string, string[]>()
  for (const id of nodeIdSet) neighbors.set(id, [])
  for (const edge of validEdges) {
    neighbors.get(edge.source)?.push(edge.target)
    neighbors.get(edge.target)?.push(edge.source)
  }

  const widestLayerSize = Math.max(1, ...[...nodesByLayer.values()].map((group) => group.length))
  const preferredColumns = Math.min(MAX_COLUMNS_PER_LAYER, widestLayerSize)
  const preferredContentWidth =
    preferredColumns * NODE_WIDTH + Math.max(0, preferredColumns - 1) * NODE_GAP_X
  const wrapContentWidth = Math.max(area.width - BAND_PADDING * 2, preferredContentWidth)
  const maxColumns = Math.min(MAX_COLUMNS_PER_LAYER, maxColumnsForWidth(wrapContentWidth))

  type LayerPlan = {
    layer: (typeof layers)[number]
    layerNodes: FunctionalNode[]
    columns: number
    rows: number
    bandHeight: number
    localPositions: Map<string, { x: number; y: number }>
    maxRowWidth: number
  }

  const orderedNodesByLayer = new Map<string, FunctionalNode[]>()
  for (const layer of layers) {
    orderedNodesByLayer.set(
      layer.id,
      [...(nodesByLayer.get(layer.id) ?? [])].sort(
        (a, b) => nodeSortKey(a).localeCompare(nodeSortKey(b)) || a.id.localeCompare(b.id),
      ),
    )
  }

  if (validEdges.length > 0) {
    const orderIndex = new Map<string, number>()
    for (const layer of layers) {
      const layerNodes = orderedNodesByLayer.get(layer.id) ?? []
      layerNodes.forEach((node, index) => orderIndex.set(node.id, index))
    }

    for (let pass = 0; pass < BARYCENTER_PASSES; pass += 1) {
      const layerOrder =
        pass % 2 === 0
          ? layers.map((_, index) => index)
          : layers.map((_, index) => layers.length - 1 - index)

      for (const layerIndex of layerOrder) {
        const layer = layers[layerIndex]
        const layerNodes = orderedNodesByLayer.get(layer.id) ?? []
        const reordered = reorderByBarycenter(
          layerNodes,
          layerIndex,
          layerIndices,
          neighbors,
          orderIndex,
        )
        orderedNodesByLayer.set(layer.id, reordered)
        reordered.forEach((node, index) => orderIndex.set(node.id, index))
      }
    }
  }

  const layerPlans: LayerPlan[] = []

  for (const layer of layers) {
    const layerNodes = orderedNodesByLayer.get(layer.id) ?? []

    const columns = columnsForLayerNodes(layerNodes.length, maxColumns, validEdges.length > 0)
    const { localPositions, maxRowWidth, rows } = placeLayerNodesLeftAligned(layerNodes, columns)
    const contentHeight = rows * NODE_HEIGHT + Math.max(0, rows - 1) * NODE_GAP_Y
    const bandHeight = BAND_HEADER_HEIGHT + BAND_PADDING * 2 + contentHeight

    layerPlans.push({
      layer,
      layerNodes,
      columns,
      rows,
      bandHeight,
      localPositions,
      maxRowWidth,
    })
  }

  const bands: ArchitectureLayerBandLayout[] = []
  let cursorY = area.originY

  for (let planIndex = 0; planIndex < layerPlans.length; planIndex += 1) {
    const plan = layerPlans[planIndex]
    const startY = cursorY + BAND_HEADER_HEIGHT + BAND_PADDING

    for (const node of plan.layerNodes) {
      const local = plan.localPositions.get(node.id)
      if (!local) continue
      positionsById[node.id] = {
        x: area.originX + BAND_PADDING + local.x,
        y: startY + local.y,
      }
    }

    const band: ArchitectureLayerBandLayout = {
      id: plan.layer.id,
      label: plan.layer.label,
      description: plan.layer.description,
      position: { x: area.originX, y: cursorY },
      width: plan.maxRowWidth + BAND_PADDING * 2,
      height: plan.bandHeight,
    }
    refitBandToNodes(band, plan.layerNodes.map((node) => node.id), positionsById)
    bands.push(band)
    cursorY = band.position.y + band.height + BAND_GAP
  }

  if (validEdges.length > 0) {
    resolveEdgeNodeSeparations(positionsById, validEdges)
    if (countEdgeHitsOnNodes(positionsById, validEdges) === 0) {
      compactSeparatedLayout(
        positionsById,
        layerPlans,
        validEdges,
        area.originX + BAND_PADDING,
      )
    }
    for (let planIndex = 0; planIndex < layerPlans.length; planIndex += 1) {
      const plan = layerPlans[planIndex]
      refitBandToNodes(bands[planIndex]!, plan.layerNodes.map((node) => node.id), positionsById)
    }
    normalizeLayoutMinX(positionsById, bands, area.originX)
  }

  resolveLayoutCollisions(positionsById, layerIndexById, validEdges)

  refitAllBands(bands, layerPlans, positionsById)

  enforceMinimumBandSeparation(bands, layerPlans, positionsById)

  refitAllBands(bands, layerPlans, positionsById)

  const nodeBounds = boundsFromPositions(positionsById)

  if (nodeBounds.width > 0 && nodeBounds.width < area.width) {
    const shiftX = area.originX + (area.width - nodeBounds.width) / 2 - nodeBounds.minX
    for (const id of Object.keys(positionsById)) {
      positionsById[id].x += shiftX
    }
    for (const band of bands) {
      band.position.x += shiftX
    }
  }

  trimHorizontalSlackInLayers(layerPlans, positionsById)
  separateVerticalColumnStacksInLayers(layerPlans, positionsById)
  resolveLayoutOverlapsOnly(positionsById, layerIndexById)
  normalizeLayoutMinX(positionsById, bands, area.originX)
  refitAllBands(bands, layerPlans, positionsById)
  enforceMinimumBandSeparation(bands, layerPlans, positionsById)
  refitAllBands(bands, layerPlans, positionsById)

  const finalBounds = boundsFromPositions(positionsById)
  const layoutHeight = Math.max(
    0,
    bands.length > 0
      ? bands[bands.length - 1]!.position.y + bands[bands.length - 1]!.height - area.originY
      : 0,
  )

  return {
    positionsById,
    bands,
    bounds: {
      minX: finalBounds.minX,
      minY: area.originY,
      width: finalBounds.width,
      height: layoutHeight,
    },
  }
}
