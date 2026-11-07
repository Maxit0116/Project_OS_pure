import { describe, expect, it } from 'vitest'
import { CAPTURE_DRAG_HOLD_MS, CAPTURE_DRAG_MOVE_PX } from './useCaptureFolderDrag'

describe('useCaptureFolderDrag thresholds', () => {
  it('matches Session Graph-style hold and move thresholds', () => {
    expect(CAPTURE_DRAG_HOLD_MS).toBe(120)
    expect(CAPTURE_DRAG_MOVE_PX).toBe(4)
  })
})
