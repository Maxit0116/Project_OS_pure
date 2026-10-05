import { describe, expect, it, vi } from 'vitest'

import { handleCommandPaletteNavigation } from './commandPaletteKeyboard'

function keyEvent(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  }
}

describe('command palette keyboard navigation', () => {
  it('moves the highlighted command with arrow keys', () => {
    const highlight = vi.fn()

    handleCommandPaletteNavigation(keyEvent('ArrowDown'), 0, 3, highlight, vi.fn())
    expect(highlight).toHaveBeenLastCalledWith(1)

    handleCommandPaletteNavigation(keyEvent('ArrowUp'), 0, 3, highlight, vi.fn())
    expect(highlight).toHaveBeenLastCalledWith(2)
  })

  it('activates the highlighted command on Enter', () => {
    const activate = vi.fn()
    const event = keyEvent('Enter')

    expect(
      handleCommandPaletteNavigation(event, 1, 3, vi.fn(), activate),
    ).toBe(true)
    expect(activate).toHaveBeenCalledWith(1)
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })
})
