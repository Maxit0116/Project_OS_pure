import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => {
  const displays = [
    { id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 } },
    { id: 2, bounds: { x: 1440, y: -100, width: 1920, height: 1080 } },
  ]
  return {
    app: { isPackaged: true },
    screen: {
      getAllDisplays: () => displays,
      on: vi.fn(),
      removeListener: vi.fn(),
    },
    BrowserWindow: vi.fn(),
  }
})

describe('virtualScreenBounds', () => {
  it('unions all display bounds into one virtual desktop rect', async () => {
    const { virtualScreenBounds } = await import('./createOverlayWindow.js')
    expect(virtualScreenBounds()).toEqual({
      x: 0,
      y: -100,
      width: 1440 + 1920,
      height: 1080,
    })
  })
})
