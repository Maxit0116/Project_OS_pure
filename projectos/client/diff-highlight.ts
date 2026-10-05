import { diffLines } from 'diff'

export type CharSpanKind = 'equal' | 'added' | 'removed'

export type RenderLine = {
  lineNumber: number | null
  spans: { text: string; kind: CharSpanKind }[]
  lineKind: 'equal' | 'changed' | 'added' | 'removed'
}

export type SideBySideRow = {
  before: RenderLine | null
  after: RenderLine | null
}

export type DiffStats = {
  added: number
  removed: number
}

export type DiffChangeSite = {
  rowIndex: number
  beforeLineNumber: number | null
  afterLineNumber: number | null
}

function isChangeRow(row: SideBySideRow): boolean {
  if (row.before === null || row.after === null) return true
  return row.before.lineKind !== 'equal' || row.after.lineKind !== 'equal'
}

export function collectDiffChangeSites(rows: SideBySideRow[]): DiffChangeSite[] {
  const sites: DiffChangeSite[] = []
  let inChangeRegion = false

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]!
    if (!isChangeRow(row)) {
      inChangeRegion = false
      continue
    }
    if (!inChangeRegion) {
      sites.push({
        rowIndex,
        beforeLineNumber: row.before?.lineNumber ?? null,
        afterLineNumber: row.after?.lineNumber ?? null,
      })
      inChangeRegion = true
    }
  }

  return sites
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function ensureTrailingNewline(text: string): string {
  const normalized = normalizeText(text)
  if (normalized.length === 0) return ''
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`
}

function linesFromChunk(value: string): string[] {
  if (value === '') return []
  const parts = value.split('\n')
  if (parts[parts.length - 1] === '') {
    parts.pop()
  }
  return parts
}

function makeEqualLine(text: string, lineNumber: number): RenderLine {
  return {
    lineNumber,
    spans: [{ text, kind: 'equal' }],
    lineKind: 'equal',
  }
}

function makeAddedLine(text: string, lineNumber: number): RenderLine {
  return {
    lineNumber,
    spans: [{ text, kind: 'equal' }],
    lineKind: 'added',
  }
}

function makeRemovedLine(text: string, lineNumber: number): RenderLine {
  return {
    lineNumber,
    spans: [{ text, kind: 'equal' }],
    lineKind: 'removed',
  }
}

function buildModifiedRow(
  beforeLine: string,
  afterLine: string,
  beforeLineNumber: number,
  afterLineNumber: number,
): SideBySideRow {
  const lineKind = beforeLine === afterLine ? 'equal' : 'changed'

  return {
    before: {
      lineNumber: beforeLineNumber,
      spans: [{ text: beforeLine, kind: 'equal' }],
      lineKind,
    },
    after: {
      lineNumber: afterLineNumber,
      spans: [{ text: afterLine, kind: 'equal' }],
      lineKind,
    },
  }
}

export function lineTextFromRenderLine(line: RenderLine | null): string {
  if (!line) return ''
  return line.spans.map((span) => span.text).join('')
}

export function buildSideBySideDiff(before: string, after: string): SideBySideRow[] {
  const beforeNorm = ensureTrailingNewline(before)
  const afterNorm = ensureTrailingNewline(after)

  if (beforeNorm === '' && afterNorm === '') return []

  const changes = diffLines(beforeNorm, afterNorm)
  const rows: SideBySideRow[] = []
  let beforeLineNumber = 1
  let afterLineNumber = 1
  let index = 0

  while (index < changes.length) {
    const change = changes[index]
    if (!change) break

    if (!change.added && !change.removed) {
      for (const line of linesFromChunk(change.value)) {
        const equalLine = makeEqualLine(line, beforeLineNumber)
        rows.push({
          before: { ...equalLine, lineNumber: beforeLineNumber },
          after: { ...equalLine, lineNumber: afterLineNumber },
        })
        beforeLineNumber += 1
        afterLineNumber += 1
      }
      index += 1
      continue
    }

    const removedLines: string[] = []
    const addedLines: string[] = []

    while (index < changes.length && changes[index]?.removed) {
      removedLines.push(...linesFromChunk(changes[index]?.value ?? ''))
      index += 1
    }
    while (index < changes.length && changes[index]?.added) {
      addedLines.push(...linesFromChunk(changes[index]?.value ?? ''))
      index += 1
    }

    const pairCount = Math.min(removedLines.length, addedLines.length)

    for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
      const beforeLine = removedLines[pairIndex] ?? ''
      const afterLine = addedLines[pairIndex] ?? ''
      rows.push(buildModifiedRow(beforeLine, afterLine, beforeLineNumber, afterLineNumber))
      beforeLineNumber += 1
      afterLineNumber += 1
    }

    for (let removedIndex = pairCount; removedIndex < removedLines.length; removedIndex += 1) {
      rows.push({
        before: makeRemovedLine(removedLines[removedIndex] ?? '', beforeLineNumber),
        after: null,
      })
      beforeLineNumber += 1
    }

    for (let addedIndex = pairCount; addedIndex < addedLines.length; addedIndex += 1) {
      rows.push({
        before: null,
        after: makeAddedLine(addedLines[addedIndex] ?? '', afterLineNumber),
      })
      afterLineNumber += 1
    }
  }

  return rows
}

export function buildSideBySideDiffForFile(
  before: string,
  after: string,
  changeType: string,
): SideBySideRow[] {
  if (changeType === 'create') return buildSideBySideDiff('', after)
  if (changeType === 'delete') return buildSideBySideDiff(before, '')
  return buildSideBySideDiff(before, after)
}

export function countDiffStats(rows: SideBySideRow[]): DiffStats {
  let added = 0
  let removed = 0

  for (const row of rows) {
    if (row.before === null && row.after !== null) {
      added += 1
      continue
    }
    if (row.after === null && row.before !== null) {
      removed += 1
      continue
    }
    if (row.before?.lineKind === 'changed' || row.after?.lineKind === 'changed') {
      added += 1
      removed += 1
    }
  }

  return { added, removed }
}
