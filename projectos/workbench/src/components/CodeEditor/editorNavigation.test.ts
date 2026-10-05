import { describe, expect, it, vi } from 'vitest'
import { registerEditor, revealPosition, unregisterEditor } from './editorNavigation'

describe('editorNavigation', () => {
  it('reveals line and column in a registered editor', () => {
    const revealLineInCenter = vi.fn()
    const setPosition = vi.fn()
    const focus = vi.fn()

    registerEditor('src/a.ts', {
      revealLineInCenter,
      setPosition,
      focus,
    } as never)

    expect(revealPosition('src/a.ts', 12, 4)).toBe(true)
    expect(revealLineInCenter).toHaveBeenCalledWith(12)
    expect(setPosition).toHaveBeenCalledWith({ lineNumber: 12, column: 4 })
    expect(focus).toHaveBeenCalled()

    unregisterEditor('src/a.ts')
    expect(revealPosition('src/a.ts', 1)).toBe(false)
  })
})
