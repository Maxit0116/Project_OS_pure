import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DocumentSymbolItem } from '@contracts/index'
import { useOutlineStore } from './outlineStore'
import { useWorkbenchStore } from './workbenchStore'

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

const documentSymbol = vi.fn(async (_filePath: string) => [demoSymbol])

vi.mock('../lsp/lspClient', () => ({
  lspClient: {
    isAvailable: () => true,
    getUnavailableReason: () => null,
    documentSymbol: (filePath: string) => documentSymbol(filePath),
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

describe('outlineStore.fetchOutline for a language the language server does not serve', () => {
  // Found on Python, Java and Go projects: the bundled server speaks TypeScript only, answered with
  // nothing, and the panel said "no symbols" for every such file.
  it('reads the symbols from the editor text when the server returns none', async () => {
    documentSymbol.mockResolvedValueOnce([])
    useWorkbenchStore.setState({ editorBuffers: { 'lib/more.py': 'class Parser:\n    def parse(self):\n        return 1\n\ndef chunked(n):\n    return n\n' } })

    await useOutlineStore.getState().fetchOutline('lib/more.py')

    const symbols = useOutlineStore.getState().symbolsByFile['lib/more.py']!
    expect(symbols.map((symbol) => symbol.name)).toEqual(['Parser', 'chunked'])
    expect(symbols[0]!.children.map((child) => child.name)).toEqual(['parse'])
    expect(useOutlineStore.getState().unavailableReason).toBeNull()
  })

  it('leaves a TypeScript file to the server, even when the server returns nothing', async () => {
    documentSymbol.mockResolvedValueOnce([])
    useWorkbenchStore.setState({ editorBuffers: { 'src/empty.ts': 'export function x() {}\n' } })

    await useOutlineStore.getState().fetchOutline('src/empty.ts')

    expect(useOutlineStore.getState().symbolsByFile['src/empty.ts']).toEqual([])
  })

  it('still produces an outline when the language server itself fails', async () => {
    documentSymbol.mockRejectedValue(new Error('server down'))
    useWorkbenchStore.setState({ editorBuffers: { 'main.go': 'package main\n\nfunc main() {\n}\n' } })

    await useOutlineStore.getState().fetchOutline('main.go')
    documentSymbol.mockReset()
    documentSymbol.mockImplementation(async () => [demoSymbol])

    expect(useOutlineStore.getState().symbolsByFile['main.go']!.map((symbol) => symbol.name)).toEqual(['main'])
  })
})
