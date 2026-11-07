import { describe, expect, it } from 'vitest'
import {
  clampPagerOffset,
  isHorizontalGesture,
  pagerTrackTranslatePx,
  resolveDiagramNeighbors,
  shouldCommitPagerSwipe,
} from './diagramStageSwipe'

describe('diagramStageSwipe', () => {
  it('resolves previous/next from rail order', () => {
    expect(resolveDiagramNeighbors(['a', 'b', 'c'], 'b')).toEqual({
      prevId: 'a',
      nextId: 'c',
      index: 1,
    })
    expect(resolveDiagramNeighbors(['a', 'b', 'c'], 'a')).toEqual({
      prevId: null,
      nextId: 'b',
      index: 0,
    })
    expect(resolveDiagramNeighbors(['a', 'b', 'c'], 'missing')).toEqual({
      prevId: null,
      nextId: null,
      index: -1,
    })
  })

  it('treats dominant deltaX as a horizontal gesture', () => {
    expect(isHorizontalGesture(20, 4)).toBe(true)
    expect(isHorizontalGesture(4, 20)).toBe(false)
    expect(isHorizontalGesture(2, 1)).toBe(false)
  })

  it('clamps offset when a neighbor is missing', () => {
    expect(clampPagerOffset(40, false, true)).toBe(0)
    expect(clampPagerOffset(-40, true, false)).toBe(0)
    expect(clampPagerOffset(-40, true, true)).toBe(-40)
  })

  it('commits swipe by distance or velocity', () => {
    expect(shouldCommitPagerSwipe(-150, 500, 0)).toBe(-1)
    expect(shouldCommitPagerSwipe(150, 500, 0)).toBe(1)
    expect(shouldCommitPagerSwipe(-20, 500, -0.8)).toBe(-1)
    expect(shouldCommitPagerSwipe(10, 500, 0)).toBe(0)
  })

  it('centers the current page in the 3-slot track', () => {
    expect(pagerTrackTranslatePx(800, 0)).toBe(-800)
    expect(pagerTrackTranslatePx(800, 120)).toBe(-680)
  })
})
