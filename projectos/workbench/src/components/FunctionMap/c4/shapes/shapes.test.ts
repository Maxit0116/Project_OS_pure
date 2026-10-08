import { describe, expect, it } from 'vitest'
import { C4_DEFAULT_NODE_SIZE, C4_SHAPE_COMPONENTS } from './index'
import type { C4ShapeKind } from '../types'

const KINDS: C4ShapeKind[] = [
  'person',
  'system',
  'external_system',
  'web_app',
  'mobile_app',
  'server',
  'database',
  'queue',
  'component',
  'code',
]

describe('C4 shape registry', () => {
  it('exports a component for every shape kind', () => {
    for (const kind of KINDS) {
      expect(typeof C4_SHAPE_COMPONENTS[kind]).toBe('function')
    }
    expect(Object.keys(C4_SHAPE_COMPONENTS).sort()).toEqual([...KINDS].sort())
  })

  it('exports positive default sizes for every shape kind', () => {
    for (const kind of KINDS) {
      const size = C4_DEFAULT_NODE_SIZE[kind]
      expect(size.width).toBeGreaterThan(0)
      expect(size.height).toBeGreaterThan(0)
    }
  })
})
