import type { DocumentSymbolItem, DocumentSymbolKind } from '@contracts/index'

const LSP_KIND_TO_SYMBOL: Record<number, DocumentSymbolKind> = {
  1: 'file',
  2: 'module',
  3: 'namespace',
  4: 'package',
  5: 'class',
  6: 'method',
  7: 'property',
  8: 'field',
  9: 'constructor',
  10: 'enum',
  11: 'interface',
  12: 'function',
  13: 'variable',
  14: 'constant',
  15: 'string',
  16: 'number',
  17: 'boolean',
  18: 'array',
  19: 'object',
  20: 'key',
  21: 'null',
  22: 'enumMember',
  23: 'struct',
  24: 'event',
  25: 'operator',
  26: 'typeParameter',
}

type LspRange = {
  start?: { line?: number; character?: number }
  end?: { line?: number; character?: number }
}

type LspDocumentSymbol = {
  name?: string
  kind?: number
  range?: LspRange
  selectionRange?: LspRange
  children?: LspDocumentSymbol[]
  location?: { range?: LspRange }
}

function rangeToPosition(range: LspRange | undefined): {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
} {
  return {
    startLine: Number(range?.start?.line ?? 0) + 1,
    startColumn: Number(range?.start?.character ?? 0) + 1,
    endLine: Number(range?.end?.line ?? 0) + 1,
    endColumn: Number(range?.end?.character ?? 0) + 1,
  }
}

function mapSymbol(symbol: LspDocumentSymbol): DocumentSymbolItem | null {
  const name = symbol.name?.trim()
  if (!name) return null

  const range = symbol.selectionRange ?? symbol.range ?? symbol.location?.range
  const position = rangeToPosition(range)

  return {
    name,
    kind: LSP_KIND_TO_SYMBOL[symbol.kind ?? 0] ?? 'unknown',
    ...position,
    children: (symbol.children ?? [])
      .map(mapSymbol)
      .filter((child): child is DocumentSymbolItem => child != null),
  }
}

export function mapLspDocumentSymbols(
  symbols: LspDocumentSymbol[] | null | undefined,
): DocumentSymbolItem[] {
  if (!symbols?.length) return []
  return symbols
    .map(mapSymbol)
    .filter((symbol): symbol is DocumentSymbolItem => symbol != null)
}
