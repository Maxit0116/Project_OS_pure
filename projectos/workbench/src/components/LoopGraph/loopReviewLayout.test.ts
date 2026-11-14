import { describe, expect, it } from 'vitest'
import {
  areReviewGatesReady,
  isReviewCompileStale,
  layoutLoopReviewPath,
} from './loopReviewLayout'

const baseNode = (id: string, goal = id) => ({
  id,
  role: 'implement' as const,
  type: 'agent' as const,
  agentRole: 'coder' as const,
  goal,
  constraints: [] as string[],
  inputs: [] as string[],
  outputs: [] as string[],
  acceptance: [] as { id: string; description: string; kind: 'human' | 'machine' }[],
})

describe('loopReviewLayout', () => {
  it('lays out a linear depends chain top-to-bottom', () => {
    const layout = layoutLoopReviewPath({
      nodes: [baseNode('a'), baseNode('b'), baseNode('c')],
      edges: [
        { id: 'e1', from: 'a', to: 'b', kind: 'depends' },
        { id: 'e2', from: 'b', to: 'c', kind: 'depends' },
      ],
    })
    expect(layout.orderedNodeIds).toEqual(['a', 'b', 'c'])
    const a = layout.nodes.find((n) => n.id === 'a')!
    const b = layout.nodes.find((n) => n.id === 'b')!
    const c = layout.nodes.find((n) => n.id === 'c')!
    expect(a.y).toBeLessThan(b.y)
    expect(b.y).toBeLessThan(c.y)
    expect(layout.edges).toHaveLength(2)
    expect(layout.edges.every((e) => e.d.startsWith('M '))).toBe(true)
    expect(layout.edges.every((e) => !e.d.includes(' C '))).toBe(true)
  })

  it('routes feedback distinctly and keeps topo order on forward edges', () => {
    const layout = layoutLoopReviewPath({
      nodes: [baseNode('plan'), baseNode('code'), baseNode('test')],
      edges: [
        { id: 'e1', from: 'plan', to: 'code', kind: 'depends' },
        { id: 'e2', from: 'code', to: 'test', kind: 'depends' },
        {
          id: 'fb',
          from: 'test',
          to: 'code',
          kind: 'feedback',
          when: 'Verification failed',
        },
      ],
    })
    expect(layout.orderedNodeIds[0]).toBe('plan')
    const feedback = layout.edges.find((e) => e.kind === 'feedback')
    expect(feedback).toBeTruthy()
    expect(feedback!.when).toBe('Verification failed')
    expect(layout.groups.some((g) => g.kind === 'loop')).toBe(true)
  })

  it('marks parallel fork-join regions as groups', () => {
    const layout = layoutLoopReviewPath({
      nodes: [
        baseNode('start'),
        baseNode('a'),
        baseNode('b'),
        {
          ...baseNode('merge'),
          role: 'unknown',
          type: 'logic',
          logicKind: 'merge',
          agentRole: undefined,
        },
      ],
      edges: [
        { id: 'e1', from: 'start', to: 'a', kind: 'depends' },
        { id: 'e2', from: 'start', to: 'b', kind: 'depends' },
        { id: 'e3', from: 'a', to: 'merge', kind: 'depends' },
        { id: 'e4', from: 'b', to: 'merge', kind: 'depends' },
      ],
    })
    const parallel = layout.groups.find((g) => g.kind === 'parallel')
    expect(parallel).toBeTruthy()
    expect(parallel!.nodeIds).toEqual(
      expect.arrayContaining(['start', 'a', 'b', 'merge']),
    )
  })

  it('gates require every assumption and cycle confirmation', () => {
    expect(areReviewGatesReady([], [], {}, {})).toBe(true)
    expect(
      areReviewGatesReady([{ id: 'a1' }], [{ edgeId: 'fb' }], { a1: true }, {}),
    ).toBe(false)
    expect(
      areReviewGatesReady(
        [{ id: 'a1' }],
        [{ edgeId: 'fb' }],
        { a1: true },
        { fb: true },
      ),
    ).toBe(true)
  })

  it('detects stale compile against draft revision', () => {
    expect(isReviewCompileStale(3, 3)).toBe(false)
    expect(isReviewCompileStale(4, 3)).toBe(true)
  })
})
