import { describe, expect, it } from 'vitest'
import { getLoopGraphPreset, type IntentGraph } from '@contracts/index'
import { routeAllLoopWorkflowEdges } from '../loopEdgeBatchRouting'
import { nodeBoxSize } from '../loopWiringVisuals'
import type { Point } from '../loopEdgeRouting'
import {
  applySemanticPositionsToNodes,
  layoutNodesSemantically,
} from './layoutLoopSemantic'

function bends(points: Point[]): number {
  let count = 0
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = points[i - 1]!
    const b = points[i]!
    const c = points[i + 1]!
    const h1 = Math.abs(a.y - b.y) < 0.5
    const h2 = Math.abs(b.y - c.y) < 0.5
    if (h1 !== h2) count += 1
  }
  return count
}

/** True when two consecutive collinear segments run in opposite directions. */
function doublesBack(points: Point[]): boolean {
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = points[i - 1]!
    const b = points[i]!
    const c = points[i + 1]!
    const d1 = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) }
    const d2 = { x: Math.sign(c.x - b.x), y: Math.sign(c.y - b.y) }
    if (d1.x === -d2.x && d1.y === -d2.y && (d1.x !== 0 || d1.y !== 0)) {
      return true
    }
  }
  return false
}

function laidOutPreset(): IntentGraph {
  const draft = getLoopGraphPreset('feature_development')!.draft
  const sizes = draft.nodes.map((node) => ({
    id: node.id,
    ...nodeBoxSize(node, draft),
  }))
  const result = layoutNodesSemantically({ draft, sizes })
  return {
    ...draft,
    nodes: applySemanticPositionsToNodes({
      nodes: draft.nodes,
      edges: draft.edges,
      positions: result.positions,
    }),
  }
}

describe('Feature Development preset routing after semantic layout', () => {
  const draft = laidOutPreset()
  const routes = routeAllLoopWorkflowEdges({
    draft,
    sizeOf: (node) => nodeBoxSize(node, draft),
  })
  const byPair = (source: string, target: string) => {
    const edge = draft.edges.find(
      (item) => item.source === source && item.target === target,
    )!
    return routes.get(edge.id)!
  }

  it('routes spine hops and the fail return as straight vertical wires', () => {
    for (const [s, t] of [
      ['n_planner', 'n_plan_review'],
      ['n_plan_review', 'n_coder'],
      ['n_condition', 'n_reviewer'],
      ['n_reviewer', 'n_approval'],
      ['n_approval', 'n_create_pr'],
      ['n_condition', 'n_coder'],
    ] as const) {
      expect(bends(byPair(s, t).points), `${s}→${t}`).toBe(0)
    }
  })

  it('enters and leaves the Run Tests detour with one bend each', () => {
    const toTests = byPair('n_coder', 'n_test')
    const fromTests = byPair('n_test', 'n_condition')
    expect(bends(toTests.points)).toBeLessThanOrEqual(1)
    expect(bends(fromTests.points)).toBeLessThanOrEqual(1)
  })

  it('never doubles a wire back on itself', () => {
    for (const route of routes.values()) {
      expect(doublesBack(route.points), route.edgeId).toBe(false)
    }
  })
})
