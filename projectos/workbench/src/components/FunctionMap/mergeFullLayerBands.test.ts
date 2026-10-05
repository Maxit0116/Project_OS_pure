import { describe, expect, it } from 'vitest'
import type { ArchitectureLayerBandLayout } from './layeredArchitectureLayout'
import { NODE_HEIGHT, NODE_WIDTH } from './autoGridLayout'
import {
  diagnoseLayerBands,
  layerIdsMissingBands,
  mergeFullLayerBands,
  resolveRenderableLayerBands,
  sanitizeLayerBandsForNodes,
} from './mergeFullLayerBands'

function band(id: string, width = 100, x = 0, y = 0): ArchitectureLayerBandLayout {
  return {
    id,
    label: id,
    description: id,
    position: { x, y },
    width,
    height: 80,
  }
}

describe('mergeFullLayerBands', () => {
  it('appends newly introduced active bands instead of dropping them', () => {
    const full = [band('experience', 120), band('infrastructure', 140)]
    const active = [
      band('experience', 200),
      band('interface', 180),
      band('application', 220),
      band('infrastructure', 160),
    ]

    const merged = mergeFullLayerBands(full, active)

    expect(merged.map((item) => item.id)).toEqual([
      'experience',
      'infrastructure',
      'interface',
      'application',
    ])
    expect(merged.find((item) => item.id === 'experience')?.width).toBe(200)
    expect(layerIdsMissingBands(
      ['experience', 'interface', 'application', 'infrastructure'],
      merged.map((item) => item.id),
    )).toEqual([])
  })

  it('keeps preserved bands when active snapshot is temporarily empty', () => {
    const full = [band('experience'), band('application')]
    expect(mergeFullLayerBands(full, []).map((item) => item.id)).toEqual([
      'experience',
      'application',
    ])
  })
})

describe('sanitizeLayerBandsForNodes', () => {
  it('drops orphan bands with no visible member nodes', () => {
    const positions = {
      auth: { x: 40, y: 120 },
      billing: { x: 40 + NODE_WIDTH + 22, y: 120 },
    }
    const sanitized = sanitizeLayerBandsForNodes({
      bands: [
        band('application', 900, 0, 80),
        band('infrastructure', 900, 0, 320),
        band('experience', 900, 0, 520),
      ],
      nodes: [
        { id: 'auth', layer: 'application' },
        { id: 'billing', layer: 'application' },
      ],
      positionsById: positions,
      configuredLayers: [
        { id: 'application', label: 'Application', description: 'app', order: 2 },
        { id: 'infrastructure', label: 'Infra', description: 'infra', order: 3 },
        { id: 'experience', label: 'Experience', description: 'exp', order: 0 },
      ],
    })

    expect(sanitized.map((item) => item.id)).toEqual(['application'])
    const diagnostics = diagnoseLayerBands({
      bands: sanitized,
      layoutBandIds: sanitized.map((item) => item.id),
      nodes: [
        { id: 'auth', layer: 'application' },
        { id: 'billing', layer: 'application' },
      ],
      positionsById: positions,
    })
    expect(diagnostics.every((item) => item.orphan === false)).toBe(true)
    expect(diagnostics.every((item) => item.slackWidth <= 1 && item.slackHeight <= 1)).toBe(true)
  })

  it('refits stale oversized bands to the current member union', () => {
    const positions = {
      solo: { x: 100, y: 200 },
    }
    const sanitized = sanitizeLayerBandsForNodes({
      bands: [band('experience', 1200, 0, 0)],
      nodes: [{ id: 'solo', layer: 'experience' }],
      positionsById: positions,
      configuredLayers: [
        { id: 'experience', label: 'Experience', description: 'exp', order: 0 },
      ],
    })

    expect(sanitized).toHaveLength(1)
    expect(sanitized[0]!.width).toBeLessThan(400)
    expect(sanitized[0]!.position.x).toBe(100 - 18)
    expect(sanitized[0]!.position.y).toBe(200 - 38 - 18)
    expect(sanitized[0]!.height).toBe(NODE_HEIGHT + 38 + 18 * 2)
  })
})

describe('resolveRenderableLayerBands', () => {
  it('drops transition bands with no visible member nodes', () => {
    const positions = {
      auth: { x: 40, y: 120 },
    }
    const bands = resolveRenderableLayerBands({
      sourceBands: [
        band('application', 900, 0, 80),
        band('infrastructure', 900, 0, 320),
      ],
      nodes: [
        { id: 'auth', layer: 'application' },
        { id: 'db', layer: 'infrastructure' },
      ],
      positionsById: positions,
      nodeOpacityById: { auth: 1, db: 0 },
      opacityByBandId: { application: 1, infrastructure: 0.6 },
    })

    expect(bands.map((item) => item.id)).toEqual(['application'])
    expect(bands[0]!.opacity).toBe(1)
  })
})
