import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DocumentSymbolItem } from '@contracts/index'
import { useOutlineStore } from './outlineStore'

vi.mock('../data/clientMode', () => ({
  isDesktopApp: () => true,
}))

const demoSymbol: DocumentSymbolItem = {
  name: 'Demo',
  kind: 'function',
  startLine: 1,
  startColumn: 1,
  endLine: 2,
  endColumn: 1,
  children: [],
}

const documentSymbol = vi.fn(async () => [demoSymbol])

vi.mock('../lsp/lspClient', () => ({
  lspClient: {
    isAvailable: () => true,
    getUnavailableReason: () => null,
    documentSymbol: (...args: unknown[]) => documentSymbol(...args),
  },
}))

afterEach(() => {
  useOutlineStore.getState().clear()
  documentSymbol.mockClear()
})

describe('outlineStore.fetchOutline', () => {
  it('does not show loading when cached symbols are refreshed', async () => {
    await useOutlineStore.getState().fetchOutline('src/a.ts')
    expect(useOutlineStore.getState().loadingFiles['src/a.ts']).toBe(false)

    await useOutlineStore.getState().fetchOutline('src/a.ts')

    expect(useOutlineStore.getState().loadingFiles['src/a.ts']).toBe(false)
    expect(documentSymbol).toHaveBeenCalledTimes(2)
  })

  it('deduplicates concurrent fetches for the same file', async () => {
    await Promise.all([
      useOutlineStore.getState().fetchOutline('src/b.ts'),
      useOutlineStore.getState().fetchOutline('src/b.ts'),
    ])

    expect(documentSymbol).toHaveBeenCalledTimes(1)
  })
})
