import { describe, expect, it } from 'vitest'
import { mapLspDocumentSymbols } from './lspSymbolMapping'

describe('mapLspDocumentSymbols', () => {
  it('maps LSP document symbols to 1-based positions', () => {
    const symbols = mapLspDocumentSymbols([
      {
        name: 'Foo',
        kind: 12,
        selectionRange: {
          start: { line: 1, character: 0 },
          end: { line: 10, character: 1 },
        },
        children: [
          {
            name: 'bar',
            kind: 6,
            selectionRange: {
              start: { line: 3, character: 2 },
              end: { line: 5, character: 3 },
            },
          },
        ],
      },
    ])

    expect(symbols).toEqual([
      {
        name: 'Foo',
        kind: 'function',
        startLine: 2,
        startColumn: 1,
        endLine: 11,
        endColumn: 2,
        children: [
          {
            name: 'bar',
            kind: 'method',
            startLine: 4,
            startColumn: 3,
            endLine: 6,
            endColumn: 4,
            children: [],
          },
        ],
      },
    ])
  })
})
