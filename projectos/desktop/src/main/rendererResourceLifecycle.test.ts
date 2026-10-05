import type { WebContents } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import { installRendererResourceCleanup } from './rendererResourceLifecycle.js'

describe('renderer-owned resource lifecycle', () => {
  it('disposes pty/subscription resources on reload and renderer loss', () => {
    const listeners = new Map<string, (...args: unknown[]) => void>()
    const webContents = {
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(event, listener)
      }),
    } as unknown as WebContents
    const dispose = vi.fn()
    installRendererResourceCleanup(webContents, dispose)

    listeners.get('did-start-navigation')?.({}, 'app://same#hash', true, true)
    expect(dispose).not.toHaveBeenCalled()

    listeners.get('did-start-navigation')?.({}, 'app://same', false, true)
    listeners.get('render-process-gone')?.()
    expect(dispose).toHaveBeenCalledTimes(2)
  })
})
