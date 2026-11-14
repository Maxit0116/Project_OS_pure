import { describe, expect, it } from 'vitest'
import {
  getLoopGraphPreset,
  type IntentGraph,
  type IntentGraphNode,
} from '@contracts/index'
import { layoutNodesSemantically } from './layoutLoopSemantic'

function node(
  partial: Partial<IntentGraphNode> & { id: string; title: string },
): IntentGraphNode {
  return {
    prompt: partial.title,
    type: 'agent',
    position: { x: 0, y: 0 },
    ...partial,
  }
}

function draft(
  nodes: IntentGraphNode[],
  edges: IntentGraph['edges'],
): Pick<IntentGraph, 'nodes' | 'edges'> {
  return { nodes, edges }
}

describe('layoutNodesSemantically', () => {
  it('lays out a depends chain top-to-bottom with colinear spine centers', () => {
    const nodes = [
      node({ id: 'a', title: 'A', position: { x: 500, y: 20 } }),
      node({ id: 'b', title: 'B', position: { x: 10, y: 10 } }),
      node({ id: 'c', title: 'C', position: { x: 900, y: 5 } }),
    ]
    const edges: IntentGraph['edges'] = [
      {
        id: 'e1',
        source: 'a',
        target: 'b',
        kind: 'depends',
        prompt: '',
      },
      {
        id: 'e2',
        source: 'b',
        target: 'c',
        kind: 'depends',
        prompt: '',
      },
    ]
    const sizes = nodes.map((n) => ({ id: n.id, width: 200, height: 80 }))
    const result = layoutNodesSemantically({
      draft: draft(nodes, edges),
      sizes,
      options: { origin: { x: 40, y: 40 }, gapY: 40 },
    })
    expect(result.ranks.get('a')).toBe(0)
    expect(result.ranks.get('b')).toBe(1)
    expect(result.ranks.get('c')).toBe(2)
    expect(result.positions.get('a')!.y).toBeLessThan(result.positions.get('b')!.y)
    expect(result.positions.get('b')!.y).toBeLessThan(result.positions.get('c')!.y)
    // Spine centers share X
    const cx = (id: string) =>
      result.positions.get(id)!.x + sizes.find((s) => s.id === id)!.width / 2
    expect(Math.abs(cx('a') - cx('b'))).toBeLessThan(1)
    expect(Math.abs(cx('b') - cx('c'))).toBeLessThan(1)
    expect(result.roles.get('a')).toBe('spine')
    expect(result.roles.get('b')).toBe('spine')
    expect(result.roles.get('c')).toBe('spine')
  })

  it('parks disconnected nodes to the right of the primary spine', () => {
    const nodes = [
      node({ id: 'a', title: 'A' }),
      node({ id: 'b', title: 'B' }),
      node({ id: 'orphan', title: 'Orphan' }),
    ]
    const edges: IntentGraph['edges'] = [
      {
        id: 'e1',
        source: 'a',
        target: 'b',
        kind: 'depends',
        prompt: '',
      },
    ]
    const sizes = [
      { id: 'a', width: 200, height: 80 },
      { id: 'b', width: 200, height: 80 },
      { id: 'orphan', width: 220, height: 100 },
    ]
    const result = layoutNodesSemantically({
      draft: draft(nodes, edges),
      sizes,
    })
    expect(result.roles.get('orphan')).toBe('parked')
    expect(result.roles.get('a')).toBe('spine')
    const a = result.positions.get('a')!
    const orphan = result.positions.get('orphan')!
    expect(orphan.x).toBeGreaterThan(a.x + 200)
    // Must not share the start rank row as a centered sibling of A
    expect(result.ranks.has('orphan')).toBe(false)
  })

  it('places side branches off the spine corridor, not in a wide same-rank row', () => {
    const nodes = [
      node({ id: 'coder', title: 'Coder' }),
      node({ id: 'tests', title: 'Run Tests', type: 'action' }),
      node({ id: 'cond', title: 'Condition', type: 'logic' }),
    ]
    const edges: IntentGraph['edges'] = [
      {
        id: 'e1',
        source: 'coder',
        target: 'tests',
        kind: 'depends',
        prompt: '',
      },
      {
        id: 'e2',
        source: 'tests',
        target: 'cond',
        kind: 'depends',
        prompt: '',
      },
      {
        id: 'e3',
        source: 'coder',
        target: 'cond',
        kind: 'depends',
        prompt: '',
      },
    ]
    const sizes = [
      { id: 'coder', width: 280, height: 120 },
      { id: 'tests', width: 200, height: 88 },
      { id: 'cond', width: 160, height: 120 },
    ]
    const result = layoutNodesSemantically({
      draft: draft(nodes, edges),
      sizes,
    })
    const coderCx =
      result.positions.get('coder')!.x + 140
    const testsCx =
      result.positions.get('tests')!.x + 100
    // Tests should not share coder's centerline (side corridor).
    expect(Math.abs(testsCx - coderCx)).toBeGreaterThan(80)
    expect(result.positions.get('coder')!.y).toBeLessThan(
      result.positions.get('cond')!.y,
    )
  })

  it('ignores provides edges for ranking', () => {
    const nodes = [
      node({ id: 'agent', title: 'Agent' }),
      node({
        id: 'model',
        title: 'Model',
        type: 'config',
        satelliteKind: 'model',
      }),
      node({ id: 'next', title: 'Next' }),
    ]
    const edges: IntentGraph['edges'] = [
      {
        id: 'p1',
        source: 'model',
        target: 'agent',
        kind: 'provides',
        prompt: '',
      },
      {
        id: 'd1',
        source: 'agent',
        target: 'next',
        kind: 'depends',
        prompt: '',
      },
    ]
    const sizes = [
      { id: 'agent', width: 280, height: 120 },
      { id: 'next', width: 200, height: 88 },
    ]
    const result = layoutNodesSemantically({
      draft: draft(nodes, edges),
      sizes,
    })
    expect(result.ranks.get('agent')).toBe(0)
    expect(result.ranks.get('next')).toBe(1)
    expect(result.positions.has('model')).toBe(false)
  })

  it('keeps feedback from forcing target below source in forward ranks', () => {
    const nodes = [
      node({ id: 'coder', title: 'Coder' }),
      node({ id: 'test', title: 'Test', type: 'action' }),
    ]
    const edges: IntentGraph['edges'] = [
      {
        id: 'd1',
        source: 'coder',
        target: 'test',
        kind: 'depends',
        prompt: '',
      },
      {
        id: 'f1',
        source: 'test',
        target: 'coder',
        kind: 'feedback',
        prompt: 'fail',
      },
    ]
    const sizes = [
      { id: 'coder', width: 280, height: 120 },
      { id: 'test', width: 200, height: 88 },
    ]
    const result = layoutNodesSemantically({
      draft: draft(nodes, edges),
      sizes,
    })
    expect(result.ranks.get('coder')).toBe(0)
    expect(result.ranks.get('test')).toBe(1)
    expect(result.positions.get('coder')!.y).toBeLessThan(
      result.positions.get('test')!.y,
    )
  })

  it('demotes action pass-through to side corridor even without a shortcut edge', () => {
    // Graph: Coder(agent) → RunTests(action) → Condition(logic)
    // No direct Coder → Condition shortcut.  RunTests must still end up as 'side'.
    const nodes = [
      node({ id: 'coder', title: 'Coder', type: 'agent' }),
      node({ id: 'tests', title: 'Run Tests', type: 'action' }),
      node({ id: 'cond', title: 'Condition', type: 'logic' }),
    ]
    const edges: IntentGraph['edges'] = [
      { id: 'e1', source: 'coder', target: 'tests', kind: 'depends', prompt: '' },
      { id: 'e2', source: 'tests', target: 'cond', kind: 'depends', prompt: '' },
      // NO direct coder → cond edge (no shortcut).
    ]
    const sizes = [
      { id: 'coder', width: 280, height: 120 },
      { id: 'tests', width: 200, height: 88 },
      { id: 'cond', width: 160, height: 120 },
    ]
    const result = layoutNodesSemantically({ draft: draft(nodes, edges), sizes })
    // tests must be in the side corridor, not on the spine
    expect(result.roles.get('tests')).toBe('side')
    expect(result.roles.get('coder')).toBe('spine')
    expect(result.roles.get('cond')).toBe('spine')
    // tests X must differ from coder/cond X (not colinear)
    const coderCx = result.positions.get('coder')!.x + 140
    const testsCx = result.positions.get('tests')!.x + 100
    expect(Math.abs(testsCx - coderCx)).toBeGreaterThan(80)
    // vertical order preserved: coder is above cond
    expect(result.positions.get('coder')!.y).toBeLessThan(
      result.positions.get('cond')!.y,
    )
  })

  it('lays out the Feature Development preset as one vertical spine with Run Tests on the side', () => {
    const preset = getLoopGraphPreset('feature_development')!
    const nodes = [
      ...preset.draft.nodes,
      node({ id: 'wg_orphan', title: 'Workgroup 1' }),
    ]
    const sizes = nodes.map((n) => ({
      id: n.id,
      width: n.type === 'logic' || n.type === 'human' ? 240 : 280,
      height: n.type === 'logic' || n.type === 'human' ? 130 : 110,
    }))
    const result = layoutNodesSemantically({
      draft: { nodes, edges: preset.draft.edges },
      sizes,
    })
    const spineOrder = [
      'n_planner',
      'n_plan_review',
      'n_coder',
      'n_condition',
      'n_reviewer',
      'n_approval',
      'n_create_pr',
    ]
    for (const id of spineOrder) expect(result.roles.get(id)).toBe('spine')
    expect(result.roles.get('n_test')).toBe('side')
    expect(result.roles.get('wg_orphan')).toBe('parked')

    const box = (id: string) => {
      const pos = result.positions.get(id)!
      const size = sizes.find((s) => s.id === id)!
      return { cx: pos.x + size.width / 2, top: pos.y, left: pos.x, right: pos.x + size.width }
    }
    for (let i = 1; i < spineOrder.length; i += 1) {
      expect(box(spineOrder[i]!).top).toBeGreaterThan(box(spineOrder[i - 1]!).top)
      expect(Math.abs(box(spineOrder[i]!).cx - box('n_planner').cx)).toBeLessThan(1)
    }
    // Run Tests sits left of the spine, vertically between Coder and Condition.
    expect(box('n_test').right).toBeLessThan(box('n_coder').left)
    expect(box('n_test').top).toBeGreaterThan(box('n_coder').top)
    expect(box('n_test').top).toBeLessThan(box('n_condition').top)
    // Disconnected work group parks right of the spine.
    expect(box('wg_orphan').left).toBeGreaterThan(box('n_coder').right)
  })

  it('places parallel children on the same rank', () => {
    const nodes = [
      node({ id: 'fork', title: 'Fork' }),
      node({ id: 'a', title: 'A' }),
      node({ id: 'b', title: 'B' }),
    ]
    const edges: IntentGraph['edges'] = [
      {
        id: 'e1',
        source: 'fork',
        target: 'a',
        kind: 'depends',
        prompt: '',
      },
      {
        id: 'e2',
        source: 'fork',
        target: 'b',
        kind: 'depends',
        prompt: '',
      },
    ]
    const sizes = nodes.map((n) => ({ id: n.id, width: 180, height: 80 }))
    const result = layoutNodesSemantically({
      draft: draft(nodes, edges),
      sizes,
    })
    expect(result.ranks.get('a')).toBe(1)
    expect(result.ranks.get('b')).toBe(1)
  })
})
