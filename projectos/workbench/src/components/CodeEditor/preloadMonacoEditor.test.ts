import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@monaco-editor/react', () => ({
  default: {},
  loader: {
    init: vi.fn(() => Promise.resolve()),
  },
}))

describe('preloadMonacoEditor', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('preloads Monaco only once', async () => {
    const { preloadMonacoEditor, isMonacoPreloaded } = await import('./preloadMonacoEditor')

    preloadMonacoEditor()
    preloadMonacoEditor()

    await vi.waitFor(() => {
      expect(isMonacoPreloaded()).toBe(true)
    })
  })
})
