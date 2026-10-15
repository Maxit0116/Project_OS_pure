import { describe, expect, it } from 'vitest'

import {
  buildLspInitializeParams,
  readSemanticTokensLegend,
  semanticTokenData,
} from './lspInitialize'

describe('lsp semantic token handshake', () => {
  it('asks the language server for full relative semantic tokens', () => {
    const params = buildLspInitializeParams('file:///workspace')
    expect(params.rootUri).toBe('file:///workspace')
    expect(params.capabilities.textDocument.semanticTokens.requests).toEqual({
      full: true,
      range: false,
    })
    expect(params.capabilities.textDocument.semanticTokens.formats).toEqual(['relative'])
    expect(params.capabilities.textDocument.semanticTokens.tokenTypes).toContain('function')
    expect(params.capabilities.textDocument.semanticTokens.tokenTypes).toContain('type')
  })

  it('uses the server legend when the initialize result includes one', () => {
    expect(readSemanticTokensLegend({
      capabilities: {
        semanticTokensProvider: {
          legend: { tokenTypes: ['type', 'function'], tokenModifiers: ['declaration'] },
        },
      },
    })).toEqual({
      tokenTypes: ['type', 'function'],
      tokenModifiers: ['declaration'],
    })
  })

  it('falls back to the standard legend and copies token data', () => {
    const legend = readSemanticTokensLegend({})
    expect(legend.tokenTypes).toContain('parameter')
    expect(Array.from(semanticTokenData([1, 0, 4, 12, 0]))).toEqual([1, 0, 4, 12, 0])
  })
})
