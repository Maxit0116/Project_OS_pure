import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  handleTopmostOverlayEscape,
  registerOverlay,
  resetOverlayStackForTests,
} from '../overlays/overlayStack'
import { trapDialogTab } from './settingsDialogFocus'

afterEach(() => resetOverlayStackForTests())

describe('settings dialog focus and overlay ordering', () => {
  it('wraps Tab focus inside the dialog', () => {
    const first = { focus: vi.fn() }
    const last = { focus: vi.fn() }

    expect(trapDialogTab([first, last], last, false)).toBe(true)
    expect(first.focus).toHaveBeenCalledOnce()

    expect(trapDialogTab([first, last], first, true)).toBe(true)
    expect(last.focus).toHaveBeenCalledOnce()
  })

  it('lets Escape close only the topmost overlay', () => {
    const settingsToken = Symbol('settings')
    const paletteToken = Symbol('palette')
    const closeSettings = vi.fn()
    const closePalette = vi.fn()
    registerOverlay(settingsToken)
    registerOverlay(paletteToken)
    const event = {
      key: 'Escape',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }

    expect(handleTopmostOverlayEscape(event, settingsToken, closeSettings)).toBe(false)
    expect(handleTopmostOverlayEscape(event, paletteToken, closePalette)).toBe(true)
    expect(closeSettings).not.toHaveBeenCalled()
    expect(closePalette).toHaveBeenCalledOnce()
  })
})
