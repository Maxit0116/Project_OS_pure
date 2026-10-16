import { describe, expect, it } from 'vitest'
import {
  LOOP_NODE_H,
  LOOP_NODE_W,
  nearestPort,
  portPoint,
  preferredPortsForPair,
  routeLoopEdge,
  truncateEdgeLabel,
} from './loopEdgeRouting'

const nodeA = {
  id: 'a',
  title: 'A',
  prompt: '',
  position: { x: 0, y: 0 },
}

const nodeB = {
  id: 'b',
  title: 'B',
  prompt: '',
  position: { x: 280, y: 0 },
}

describe('loopEdgeRouting', () => {
  it('maps ports to node mid-sides', () => {
    expect(portPoint(nodeA, 'n')).toEqual({ x: LOOP_NODE_W / 2, y: 0 })
    expect(portPoint(nodeA, 'e')).toEqual({
      x: LOOP_NODE_W,
      y: LOOP_NODE_H / 2,
    })
    expect(portPoint(nodeA, 's')).toEqual({
      x: LOOP_NODE_W / 2,
      y: LOOP_NODE_H,
    })
    expect(portPoint(nodeA, 'w')).toEqual({ x: 0, y: LOOP_NODE_H / 2 })
  })

  it('picks the nearest port to a pointer', () => {
    expect(nearestPort(nodeA, { x: LOOP_NODE_W / 2, y: -20 })).toBe('n')
    expect(nearestPort(nodeA, { x: LOOP_NODE_W + 40, y: LOOP_NODE_H / 2 })).toBe('e')
  })

  it('prefers facing ports between a horizontal pair', () => {
    const ports = preferredPortsForPair(nodeA, nodeB)
    expect(ports.sourcePort).toBe('e')
    expect(ports.targetPort).toBe('w')
  })

  it('routes a cubic path with midpoint and ports', () => {
    const routed = routeLoopEdge({
      source: nodeA,
      target: nodeB,
      sourcePort: 'e',
      targetPort: 'w',
      obstacles: [],
    })
    expect(routed.d.startsWith('M ')).toBe(true)
    expect(routed.d.includes(' C ')).toBe(true)
    expect(routed.sourcePort).toBe('e')
    expect(routed.targetPort).toBe('w')
    expect(routed.mid.x).toBeGreaterThan(nodeA.position.x)
    expect(routed.mid.x).toBeLessThan(nodeB.position.x + LOOP_NODE_W)
  })

  it('truncates edge labels', () => {
    expect(truncateEdgeLabel('short')).toBe('short')
    expect(truncateEdgeLabel('x'.repeat(50)).endsWith('…')).toBe(true)
  })
})
