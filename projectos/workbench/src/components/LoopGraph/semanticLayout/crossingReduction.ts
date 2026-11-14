import type { SemanticLayoutEdge } from './types'
import { SEM_BARY_ITERS } from './types'

/**
 * Barycenter layer ordering to reduce crossings on forward edges.
 * Happy-path bias: nodes on the longest chain are pulled toward layer center.
 */
export function orderLayersByBarycenter(input: {
  layers: string[][]
  forwardEdges: SemanticLayoutEdge[]
  iterations?: number
}): string[][] {
  const iterations = input.iterations ?? SEM_BARY_ITERS
  const layers = input.layers.map((layer) => [...layer])
  if (layers.length === 0) return layers

  const spine = pickSpineNodeIds(layers, input.forwardEdges)
  const spineSet = new Set(spine)

  for (let iter = 0; iter < iterations; iter += 1) {
    // Top → bottom
    for (let r = 1; r < layers.length; r += 1) {
      layers[r] = sortLayerByBarycenter({
        layer: layers[r]!,
        reference: layers[r - 1]!,
        edges: input.forwardEdges,
        direction: 'up',
        spineSet,
      })
    }
    // Bottom → top
    for (let r = layers.length - 2; r >= 0; r -= 1) {
      layers[r] = sortLayerByBarycenter({
        layer: layers[r]!,
        reference: layers[r + 1]!,
        edges: input.forwardEdges,
        direction: 'down',
        spineSet,
      })
    }
  }

  // Final pass: within each layer, pull spine nodes toward center index.
  for (let r = 0; r < layers.length; r += 1) {
    layers[r] = biasSpineToCenter(layers[r]!, spineSet)
  }

  return layers
}

function sortLayerByBarycenter(input: {
  layer: string[]
  reference: string[]
  edges: SemanticLayoutEdge[]
  direction: 'up' | 'down'
  spineSet: Set<string>
}): string[] {
  const indexOf = new Map(input.reference.map((id, index) => [id, index]))
  const scored = input.layer.map((id, stableIndex) => {
    const neighbors: number[] = []
    for (const edge of input.edges) {
      if (input.direction === 'up') {
        if (edge.target !== id) continue
        const idx = indexOf.get(edge.source)
        if (idx !== undefined) neighbors.push(idx)
      } else {
        if (edge.source !== id) continue
        const idx = indexOf.get(edge.target)
        if (idx !== undefined) neighbors.push(idx)
      }
    }
    const bary =
      neighbors.length > 0
        ? neighbors.reduce((a, b) => a + b, 0) / neighbors.length
        : stableIndex
    const spineBias = input.spineSet.has(id) ? -0.25 : 0
    return { id, bary: bary + spineBias, stableIndex }
  })
  scored.sort(
    (a, b) =>
      a.bary - b.bary ||
      a.stableIndex - b.stableIndex ||
      a.id.localeCompare(b.id),
  )
  return scored.map((item) => item.id)
}

function biasSpineToCenter(layer: string[], spineSet: Set<string>): string[] {
  if (layer.length <= 2) return layer
  const spine = layer.filter((id) => spineSet.has(id))
  if (spine.length === 0) return layer
  const rest = layer.filter((id) => !spineSet.has(id))
  const mid = Math.floor(rest.length / 2)
  return [...rest.slice(0, mid), ...spine, ...rest.slice(mid)]
}

/** Prefer a single depends-chain from a top entry as the happy-path spine. */
function pickSpineNodeIds(
  layers: string[][],
  forwardEdges: SemanticLayoutEdge[],
): string[] {
  if (layers.length === 0 || layers[0]!.length === 0) return []
  const succs = new Map<string, string[]>()
  for (const edge of forwardEdges) {
    if (edge.kind === 'conditional' || edge.kind === 'fallback') continue
    const list = succs.get(edge.source) ?? []
    list.push(edge.target)
    succs.set(edge.source, list)
  }
  const start = layers[0]![0]!
  const spine: string[] = [start]
  const seen = new Set<string>([start])
  let current = start
  while (true) {
    const nexts = (succs.get(current) ?? []).filter((id) => !seen.has(id))
    if (nexts.length === 0) break
    nexts.sort((a, b) => a.localeCompare(b))
    const next = nexts[0]!
    spine.push(next)
    seen.add(next)
    current = next
  }
  return spine
}
