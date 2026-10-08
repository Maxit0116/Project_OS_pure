import { afterEach, describe, expect, it } from 'vitest'
import {
  applyOverlayToPositions,
  clearC4LayoutOverlay,
  loadC4LayoutOverlay,
  pruneC4LayoutOverlayForView,
  upsertC4LayoutPositions,
} from './c4LayoutOverlay'

const PROJECT = 'test-project-overlay'

afterEach(() => {
  clearC4LayoutOverlay(PROJECT)
})

describe('c4LayoutOverlay', () => {
  it('persists and applies per-view node positions', () => {
    upsertC4LayoutPositions(PROJECT, 'container', 'system_root', {
      web: { x: 12, y: 34 },
    })
    const overlay = loadC4LayoutOverlay(PROJECT)
    const applied = applyOverlayToPositions(
      overlay,
      'container',
      'system_root',
      {
        web: { x: 0, y: 0 },
        api: { x: 100, y: 100 },
      },
    )
    expect(applied.web).toEqual({ x: 12, y: 34 })
    expect(applied.api).toEqual({ x: 100, y: 100 })
  })

  it('prunes stale keys for the current view', () => {
    upsertC4LayoutPositions(PROJECT, 'container', null, {
      stale: { x: 1, y: 2 },
      keep: { x: 3, y: 4 },
    })
    pruneC4LayoutOverlayForView(PROJECT, 'container', null, ['keep'])
    const overlay = loadC4LayoutOverlay(PROJECT)
    expect(overlay.positions['container::root::stale']).toBeUndefined()
    expect(overlay.positions['container::root::keep']).toEqual({ x: 3, y: 4 })
  })
})
