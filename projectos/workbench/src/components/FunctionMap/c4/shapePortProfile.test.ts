import { describe, expect, it } from 'vitest'
import {
  attach,
  assignEdgePorts,
  firstPortableSide,
  portAttachRect,
  portBodyRect,
  rankSides,
  sidePortCapacity,
  type RouteRect,
} from './orthogonalRoute'
import { C4_DEFAULT_NODE_SIZE } from './shapes'
import { getShapePortProfile, SHAPE_PORT_PROFILES } from './shapePortProfile'
import type { C4ShapeKind } from './types'

function node(
  shape: C4ShapeKind,
  overrides?: Partial<RouteRect>,
): RouteRect {
  const size = C4_DEFAULT_NODE_SIZE[shape]
  return {
    id: shape,
    x: 0,
    y: 0,
    width: size.width,
    height: size.height,
    shape,
    ...overrides,
  }
}

describe('shapePortProfile', () => {
  it('covers every C4 shape kind', () => {
    const kinds = Object.keys(SHAPE_PORT_PROFILES).sort()
    expect(kinds).toEqual(
      [
        'code',
        'component',
        'database',
        'desktop_app',
        'external_system',
        'mobile_app',
        'person',
        'queue',
        'server',
        'system',
        'web_app',
      ].sort(),
    )
  })

  it('disables person top ports and insets the torso body', () => {
    const person = node('person')
    expect(sidePortCapacity(person, 'top')).toBe(0)
    expect(sidePortCapacity(person, 'left')).toBeGreaterThan(0)
    expect(sidePortCapacity(person, 'right')).toBeGreaterThan(0)
    expect(sidePortCapacity(person, 'bottom')).toBeGreaterThan(0)

    const body = portBodyRect(person)
    const profile = getShapePortProfile('person')
    expect(body.y).toBe(profile.bodyInset.top)
    expect(body.x).toBe(profile.bodyInset.left)
    expect(body.width).toBe(
      person.width - profile.bodyInset.left - profile.bodyInset.right,
    )

    const left = attach(person, 'left', 0.5)
    expect(left.x).toBe(body.x)
    expect(left.y).toBeGreaterThan(body.y)
    expect(left.y).toBeLessThan(body.y + body.height)

    const ranks = rankSides(
      person,
      { id: 'sys', x: 0, y: -200, width: 100, height: 80 },
      'source',
    )
    expect(ranks[0]).toBe('top')
    expect(firstPortableSide(person, ranks)).not.toBe('top')
  })

  it('gives database one centered port on each arc and L/R on the cylinder', () => {
    const db = node('database')
    expect(sidePortCapacity(db, 'top')).toBe(1)
    expect(sidePortCapacity(db, 'bottom')).toBe(1)
    expect(sidePortCapacity(db, 'left')).toBeGreaterThan(0)
    expect(sidePortCapacity(db, 'right')).toBeGreaterThan(0)

    expect(portAttachRect(db, 'top')).toEqual(db)
    expect(portAttachRect(db, 'bottom')).toEqual(db)
    expect(portAttachRect(db, 'left')).toEqual(portBodyRect(db))

    const top = attach(db, 'top', 0.5)
    expect(top).toEqual({ x: db.width / 2, y: 0 })
    const bottom = attach(db, 'bottom', 0.5)
    expect(bottom).toEqual({ x: db.width / 2, y: db.height })

    const left = attach(db, 'left', 0.5)
    const body = portBodyRect(db)
    expect(left.x).toBe(body.x)
    expect(left.y).toBe(body.y + body.height / 2)
  })

  it('gives queue one centered port on each end cap and T/B on the pipe', () => {
    const queue = node('queue')
    expect(sidePortCapacity(queue, 'left')).toBe(1)
    expect(sidePortCapacity(queue, 'right')).toBe(1)
    expect(sidePortCapacity(queue, 'top')).toBeGreaterThan(0)
    expect(sidePortCapacity(queue, 'bottom')).toBeGreaterThan(0)

    expect(portAttachRect(queue, 'left')).toEqual(queue)
    expect(portAttachRect(queue, 'top')).toEqual(portBodyRect(queue))

    const left = attach(queue, 'left', 0.5)
    expect(left).toEqual({ x: 0, y: queue.height / 2 })
    const right = attach(queue, 'right', 0.5)
    expect(right).toEqual({ x: queue.width, y: queue.height / 2 })

    const top = attach(queue, 'top', 0.5)
    const body = portBodyRect(queue)
    expect(top.y).toBe(body.y)
    expect(top.x).toBe(body.x + body.width / 2)
  })

  it('excludes the desktop stand and component tabs from the body', () => {
    const desktop = node('desktop_app')
    const desktopBody = portBodyRect(desktop)
    expect(desktopBody.height).toBe(desktop.height - 7)
    expect(desktopBody.x).toBe(8)

    const component = node('component')
    const componentBody = portBodyRect(component)
    expect(componentBody.x).toBe(8)
    expect(attach(component, 'left', 0.5).x).toBe(8)
  })

  it('never assigns person top when routing edges', () => {
    const person = node('person', { id: 'p', x: 0, y: 100 })
    const system: RouteRect = {
      id: 's',
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      shape: 'system',
    }
    const ports = assignEdgePorts({
      nodes: [person, system],
      edges: [{ id: 'e1', source: 'p', target: 's' }],
    })
    const assignment = ports.get('e1')
    expect(assignment).toBeTruthy()
    expect(assignment!.sourceSide).not.toBe('top')
  })
})
