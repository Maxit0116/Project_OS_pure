export const SEMANTIC_TOKEN_TYPES = [
  'namespace',
  'type',
  'class',
  'enum',
  'interface',
  'struct',
  'typeParameter',
  'parameter',
  'variable',
  'property',
  'enumMember',
  'event',
  'function',
  'method',
  'macro',
  'keyword',
  'modifier',
  'comment',
  'string',
  'number',
  'regexp',
  'operator',
  'decorator',
] as const

export const SEMANTIC_TOKEN_MODIFIERS = [
  'declaration',
  'definition',
  'readonly',
  'static',
  'deprecated',
  'abstract',
  'async',
  'modification',
  'documentation',
  'defaultLibrary',
] as const

export interface SemanticTokensLegend {
  tokenTypes: string[]
  tokenModifiers: string[]
}

const FALLBACK_LEGEND: SemanticTokensLegend = {
  tokenTypes: [...SEMANTIC_TOKEN_TYPES],
  tokenModifiers: [...SEMANTIC_TOKEN_MODIFIERS],
}

export function buildLspInitializeParams(rootUri: string): {
  processId: null
  rootUri: string
  capabilities: {
    textDocument: {
      semanticTokens: {
        dynamicRegistration: false
        requests: { full: true; range: false }
        tokenTypes: readonly string[]
        tokenModifiers: readonly string[]
        formats: string[]
        overlappingTokenSupport: false
        multilineTokenSupport: true
      }
      synchronization: {
        dynamicRegistration: false
        willSave: false
        willSaveWaitUntil: false
        didSave: false
      }
      publishDiagnostics: { relatedInformation: true }
    }
  }
  workspaceFolders: Array<{ uri: string; name: string }>
} {
  return {
    processId: null,
    rootUri,
    capabilities: {
      textDocument: {
        semanticTokens: {
          dynamicRegistration: false,
          requests: { full: true, range: false },
          tokenTypes: SEMANTIC_TOKEN_TYPES,
          tokenModifiers: SEMANTIC_TOKEN_MODIFIERS,
          formats: ['relative'],
          overlappingTokenSupport: false,
          multilineTokenSupport: true,
        },
        synchronization: {
          dynamicRegistration: false,
          willSave: false,
          willSaveWaitUntil: false,
          didSave: false,
        },
        publishDiagnostics: {
          relatedInformation: true,
        },
      },
    },
    workspaceFolders: [{ uri: rootUri, name: 'workspace' }],
  }
}

export function readSemanticTokensLegend(result: unknown): SemanticTokensLegend {
  const legend = (
    result as {
      capabilities?: {
        semanticTokensProvider?: { legend?: { tokenTypes?: unknown; tokenModifiers?: unknown } }
      }
    }
  )?.capabilities?.semanticTokensProvider?.legend
  if (!legend || !Array.isArray(legend.tokenTypes) || legend.tokenTypes.some((type) => typeof type !== 'string')) {
    return FALLBACK_LEGEND
  }
  const tokenModifiers = Array.isArray(legend.tokenModifiers)
    ? legend.tokenModifiers.filter((modifier): modifier is string => typeof modifier === 'string')
    : []
  return {
    tokenTypes: legend.tokenTypes as string[],
    tokenModifiers,
  }
}

export function semanticTokenData(data: number[]): Uint32Array {
  return Uint32Array.from(data)
}
