import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MapArtifact } from '@contracts/index'
import {
  computeTabReorderPreview,
  isPointerInTabStrip,
  isTabDragHoverTarget,
  shouldUseReorderDragMode,
  sortStackMembersForTabs,
  getTabDragState,
  startStackTabDrag,
} from './mapArtifactStack'

afterEach(() => {
  vi.unstubAllGlobals()
})

const base = {
  scope: 'project' as const,
  position: { x: 0, y: 0 },
  size: { width: 280, height: 160 },
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}

function note(id: string, stackOrder?: number): MapArtifact {
  return {
    ...base,
    id,
    type: 'note',
    note: { body: id },
    ...(stackOrder !== undefined
      ? { stackId: 'stack_1', stackOrder }
      : {}),
  }
}

describe('mapArtifactStack ui helpers', () => {
  it('sorts stack members by stackOrder for tab strip', () => {
    const sorted = sortStackMembersForTabs([note('art_c', 2), note('art_a', 0), note('art_b', 1)])
    expect(sorted.map((member) => member.id)).toEqual(['art_a', 'art_b', 'art_c'])
  })

  it('keeps solo artifact as a one-member tab list', () => {
    const sorted = sortStackMembersForTabs([note('art_solo')])
    expect(sorted).toHaveLength(1)
    expect(sorted[0]?.id).toBe('art_solo')
  })

  it('reports compatible hover state for matching artifact types', () => {
    expect(getTabDragState()).toBeNull()
    expect(isTabDragHoverTarget('stack_target', 'note')).toBeNull()
  })

  it('detects pointer inside tab strip bounds', () => {
    const rect = { left: 10, top: 20, right: 110, bottom: 44 } as DOMRect
    expect(isPointerInTabStrip(50, 30, rect)).toBe(true)
    expect(isPointerInTabStrip(5, 30, rect)).toBe(false)
    expect(isPointerInTabStrip(50, 50, rect)).toBe(false)
  })

  it('uses reorder mode when horizontal movement dominates inside strip', () => {
    expect(shouldUseReorderDragMode(12, 4, true, true)).toBe(true)
    expect(shouldUseReorderDragMode(4, 12, true, true)).toBe(false)
    expect(shouldUseReorderDragMode(12, 4, false, true)).toBe(false)
    expect(shouldUseReorderDragMode(12, 4, true, false)).toBe(false)
  })

  it('computes insert index from tab centers', () => {
    const preview = computeTabReorderPreview(
      ['art_a', 'art_b', 'art_c'],
      'art_b',
      15,
      [
        { id: 'art_a', centerX: 20 },
        { id: 'art_c', centerX: 80 },
      ],
    )
    expect(preview.insertIndex).toBe(0)
    expect(preview.orderedIds).toEqual(['art_b', 'art_a', 'art_c'])
  })

  it.each(['unmount', 'pointercancel'] as const)(
    'restores global drag state on %s mid-drag',
    (finishMode) => {
      const documentListeners = new Map<string, (event: PointerEvent) => void>()
      const ghost = { style: {}, remove: vi.fn(), className: '', textContent: '' }
      const body = {
        style: { cursor: 'default', userSelect: 'text' },
        appendChild: vi.fn(),
      }
      vi.stubGlobal('document', {
        body,
        createElement: vi.fn(() => ghost),
        elementFromPoint: vi.fn(() => null),
        addEventListener: vi.fn((type: string, listener: (event: PointerEvent) => void) => {
          documentListeners.set(type, listener)
        }),
        removeEventListener: vi.fn((type: string) => {
          documentListeners.delete(type)
        }),
      })

      const target = {
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(() => {
          throw new Error('capture already gone')
        }),
      }
      const cleanup = startStackTabDrag(
        {
          button: 0,
          pointerId: 11,
          clientX: 10,
          clientY: 10,
          currentTarget: target,
        } as never,
        'art_a',
        'stack_1',
        'note',
        'Alpha',
        {
          onDetach: vi.fn(),
          onMerge: vi.fn(),
        },
        {
          sortedMemberIds: ['art_a'],
          reorderEnabled: false,
          stripElement: {
            getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 30 }),
            querySelectorAll: () => [],
          } as never,
        },
      )

      documentListeners.get('pointermove')?.({ clientX: 30, clientY: 50 } as PointerEvent)
      expect(body.style).toEqual({ cursor: 'grabbing', userSelect: 'none' })
      expect(getTabDragState()).not.toBeNull()

      expect(() => {
        if (finishMode === 'unmount') cleanup()
        else documentListeners.get('pointercancel')?.({} as PointerEvent)
      }).not.toThrow()

      expect(body.style).toEqual({ cursor: 'default', userSelect: 'text' })
      expect(target.releasePointerCapture).toHaveBeenCalledWith(11)
      expect(ghost.remove).toHaveBeenCalledOnce()
      expect(getTabDragState()).toBeNull()
      expect(documentListeners.size).toBe(0)
    },
  )
})
