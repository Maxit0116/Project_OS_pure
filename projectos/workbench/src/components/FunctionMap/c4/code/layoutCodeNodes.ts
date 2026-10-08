/**
 * Import-direction layered layout for code-level file nodes.
 * Roots (nothing imports them) sit in the top row; dependencies flow downward.
 * Within each layer, a barycenter pass reduces edge crossings.
 */

export interface CodeLayoutNode {
  id: string
  width: number
  height: number
  /** Stable sort key when barycenters tie. */
  sortKey?: string
}

export interface CodeLayoutEdge {
  source: string
  target: string
}

export interface CodeLayoutOptions {
  startX?: number
  startY?: number
  gapX?: number
  gapY?: number
  /** Max nodes per row within a layer before wrapping. */
  maxColumns?: number
}

const DEFAULTS = {
  startX: 40,
  startY: 40,
  gapX: 28,
  gapY: 36,
  maxColumns: 4,
} as const

export function layoutCodeNodesByImports(
  nodes: CodeLayoutNode[],
  edges: CodeLayoutEdge[],
  options: CodeLayoutOptions = {},
): Map<string, { x: number; y: number }> {
  const startX = options.startX ?? DEFAULTS.startX
  const startY = options.startY ?? DEFAULTS.startY
  const gapX = options.gapX ?? DEFAULTS.gapX
  const gapY = options.gapY ?? DEFAULTS.gapY
  const maxColumns = options.maxColumns ?? DEFAULTS.maxColumns

  const positions = new Map<string, { x: number; y: number }>()
  if (nodes.length === 0) return positions

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const ids = nodes.map((node) => node.id)
  const idSet = new Set(ids)

  const outgoing = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()
  for (const id of ids) {
    outgoing.set(id, [])
    incoming.set(id, [])
  }
  for (const edge of edges) {
    if (!idSet.has(edge.source) || !idSet.has(edge.target) || edge.source === edge.target) {
      continue
    }
    outgoing.get(edge.source)!.push(edge.target)
    incoming.get(edge.target)!.push(edge.source)
  }

  const layerOf = assignLayers(ids, outgoing, incoming)
  const maxLayer = Math.max(0, ...[...layerOf.values()])
  const layers: string[][] = Array.from({ length: maxLayer + 1 }, () => [])
  for (const id of ids) {
    layers[layerOf.get(id) ?? 0]!.push(id)
  }

  for (const layer of layers) {
    layer.sort((a, b) => compareNodes(nodeById.get(a), nodeById.get(b), a, b))
  }

  barycenterReorder(layers, outgoing, incoming, nodeById)

  let cursorY = startY
  for (const layer of layers) {
    if (layer.length === 0) continue

    const rowChunks = chunk(layer, maxColumns)
    let layerMaxHeight = 0

    for (const row of rowChunks) {
      let rowMaxHeight = 0
      let cursorX = startX
      const rowWidth = row.reduce((sum, id, index) => {
        const node = nodeById.get(id)!
        return sum + node.width + (index > 0 ? gapX : 0)
      }, 0)
      // Center short rows under the widest natural row width of this layer.
      const widestRow = Math.max(
        ...rowChunks.map((chunkRow) =>
          chunkRow.reduce(
            (sum, id, index) =>
              sum + (nodeById.get(id)?.width ?? 0) + (index > 0 ? gapX : 0),
            0,
          ),
        ),
      )
      cursorX = startX + Math.max(0, (widestRow - rowWidth) / 2)

      for (const id of row) {
        const node = nodeById.get(id)!
        positions.set(id, { x: cursorX, y: cursorY })
        cursorX += node.width + gapX
        rowMaxHeight = Math.max(rowMaxHeight, node.height)
      }

      cursorY += rowMaxHeight + gapY
      layerMaxHeight += rowMaxHeight + gapY
    }

    // Extra breathing room between import layers (already counted last gapY).
    if (layerMaxHeight > 0) {
      cursorY += gapY * 0.25
    }
  }

  return positions
}

/** Exported for unit tests: longest-path layering from import roots. */
export function assignImportLayers(
  nodeIds: string[],
  edges: CodeLayoutEdge[],
): Map<string, number> {
  const outgoing = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()
  for (const id of nodeIds) {
    outgoing.set(id, [])
    incoming.set(id, [])
  }
  const idSet = new Set(nodeIds)
  for (const edge of edges) {
    if (!idSet.has(edge.source) || !idSet.has(edge.target) || edge.source === edge.target) {
      continue
    }
    outgoing.get(edge.source)!.push(edge.target)
    incoming.get(edge.target)!.push(edge.source)
  }
  return assignLayers(nodeIds, outgoing, incoming)
}

function assignLayers(
  ids: string[],
  outgoing: Map<string, string[]>,
  incoming: Map<string, string[]>,
): Map<string, number> {
  const layerOf = new Map<string, number>()
  const roots = ids.filter((id) => (incoming.get(id)?.length ?? 0) === 0)

  // Kahn-style wavefront from roots; cycles get a fallback pass.
  const queue = [...roots]
  for (const id of roots) layerOf.set(id, 0)

  const indegree = new Map(ids.map((id) => [id, incoming.get(id)?.length ?? 0]))
  let head = 0
  while (head < queue.length) {
    const id = queue[head++]!
    const layer = layerOf.get(id) ?? 0
    for (const target of outgoing.get(id) ?? []) {
      const next = layer + 1
      const prev = layerOf.get(target)
      if (prev === undefined || next > prev) {
        layerOf.set(target, next)
      }
      const remaining = (indegree.get(target) ?? 1) - 1
      indegree.set(target, remaining)
      if (remaining === 0 && !queue.includes(target)) {
        queue.push(target)
      }
    }
  }

  // Cycles / unreachable: place near the max upstream layer.
  for (const id of ids) {
    if (layerOf.has(id)) continue
    let best = 0
    for (const source of incoming.get(id) ?? []) {
      best = Math.max(best, (layerOf.get(source) ?? 0) + 1)
    }
    layerOf.set(id, best)
  }

  // Isolated nodes with no edges stay at layer 0 (already set via roots).
  for (const id of ids) {
    if (!layerOf.has(id)) layerOf.set(id, 0)
  }

  return layerOf
}

function barycenterReorder(
  layers: string[][],
  outgoing: Map<string, string[]>,
  incoming: Map<string, string[]>,
  nodeById: Map<string, CodeLayoutNode>,
): void {
  const indexInLayer = (layer: string[]): Map<string, number> =>
    new Map(layer.map((id, index) => [id, index]))

  // Forward pass: order by average position of upstream neighbors.
  for (let li = 1; li < layers.length; li++) {
    const prevIndex = indexInLayer(layers[li - 1]!)
    layers[li] = [...layers[li]!].sort((a, b) => {
      const ba = barycenter(incoming.get(a) ?? [], prevIndex)
      const bb = barycenter(incoming.get(b) ?? [], prevIndex)
      if (ba !== bb) return ba - bb
      return compareNodes(nodeById.get(a), nodeById.get(b), a, b)
    })
  }

  // Backward pass: refine by average position of downstream neighbors.
  for (let li = layers.length - 2; li >= 0; li--) {
    const nextIndex = indexInLayer(layers[li + 1]!)
    layers[li] = [...layers[li]!].sort((a, b) => {
      const ba = barycenter(outgoing.get(a) ?? [], nextIndex)
      const bb = barycenter(outgoing.get(b) ?? [], nextIndex)
      if (ba !== bb) return ba - bb
      return compareNodes(nodeById.get(a), nodeById.get(b), a, b)
    })
  }
}

function barycenter(neighbors: string[], indexOf: Map<string, number>): number {
  const positions = neighbors
    .map((id) => indexOf.get(id))
    .filter((value): value is number => value !== undefined)
  if (positions.length === 0) return Number.POSITIVE_INFINITY
  return positions.reduce((sum, value) => sum + value, 0) / positions.length
}

function compareNodes(
  a: CodeLayoutNode | undefined,
  b: CodeLayoutNode | undefined,
  aId: string,
  bId: string,
): number {
  const ak = a?.sortKey ?? aId
  const bk = b?.sortKey ?? bId
  return ak.localeCompare(bk) || aId.localeCompare(bId)
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items]
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size))
  }
  return rows
}
