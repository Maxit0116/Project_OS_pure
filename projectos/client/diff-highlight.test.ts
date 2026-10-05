import { describe, expect, it } from 'vitest'

import {
  buildSideBySideDiff,
  buildSideBySideDiffForFile,
  collectDiffChangeSites,
  countDiffStats,
} from './diff-highlight.js'

describe('buildSideBySideDiff', () => {
  it('returns no rows for empty before and after', () => {
    expect(buildSideBySideDiff('', '')).toEqual([])
  })

  it('keeps equal lines unhighlighted', () => {
    const rows = buildSideBySideDiff('alpha\nbeta\n', 'alpha\nbeta\n')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.before?.lineKind).toBe('equal')
    expect(rows[0]?.after?.lineKind).toBe('equal')
    expect(rows[0]?.before?.spans).toEqual([{ text: 'alpha', kind: 'equal' }])
  })

  it('marks modified lines when before and after differ', () => {
    const rows = buildSideBySideDiff('keep\nold\n', 'keep\nnew\n')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.before?.lineKind).toBe('equal')
    expect(rows[1]?.before?.lineKind).toBe('changed')
    expect(rows[1]?.after?.lineKind).toBe('changed')
    expect(rows[1]?.before?.spans).toEqual([{ text: 'old', kind: 'equal' }])
    expect(rows[1]?.after?.spans).toEqual([{ text: 'new', kind: 'equal' }])
  })

  it('keeps full-line text for modified rows without char-level spans', () => {
    const rows = buildSideBySideDiff('const x = 1\n', 'const x = 2\n')
    const row = rows[0]
    expect(row?.before?.lineKind).toBe('changed')
    expect(row?.after?.lineKind).toBe('changed')
    expect(row?.before?.spans).toEqual([{ text: 'const x = 1', kind: 'equal' }])
    expect(row?.after?.spans).toEqual([{ text: 'const x = 2', kind: 'equal' }])
  })

  it('handles pure insertions and deletions as aligned rows', () => {
    const rows = buildSideBySideDiff('a\nb\nc\n', 'a\nc\n')
    expect(rows.some((row) => row.before === null && row.after?.lineKind === 'added')).toBe(false)
    expect(rows.some((row) => row.after === null && row.before?.lineKind === 'removed')).toBe(true)
  })

  it('normalizes Windows line endings', () => {
    const rows = buildSideBySideDiff('alpha\r\n', 'alpha\r\nbeta\r\n')
    expect(rows).toHaveLength(2)
    expect(rows[1]?.after?.spans[0]?.text).toBe('beta')
  })
})

describe('buildSideBySideDiffForFile', () => {
  it('treats create files as all added', () => {
    const rows = buildSideBySideDiffForFile('', 'export const ok = true\n', 'create')
    expect(rows.every((row) => row.before === null)).toBe(true)
    expect(rows[0]?.after?.lineKind).toBe('added')
  })

  it('treats delete files as all removed', () => {
    const rows = buildSideBySideDiffForFile('export const ok = true\n', '', 'delete')
    expect(rows.every((row) => row.after === null)).toBe(true)
    expect(rows[0]?.before?.lineKind).toBe('removed')
  })
})

describe('collectDiffChangeSites', () => {
  it('returns no sites for equal files', () => {
    expect(collectDiffChangeSites(buildSideBySideDiff('a\n', 'a\n'))).toEqual([])
  })

  it('returns one site for a single modified line', () => {
    const sites = collectDiffChangeSites(buildSideBySideDiff('a\nold\n', 'a\nnew\n'))
    expect(sites).toEqual([{
      rowIndex: 1,
      beforeLineNumber: 2,
      afterLineNumber: 2,
    }])
  })

  it('groups consecutive change rows into one site', () => {
    const sites = collectDiffChangeSites(buildSideBySideDiff('a\nb\nc\n', 'a\nx\ny\n'))
    expect(sites).toHaveLength(1)
    expect(sites[0]).toMatchObject({
      rowIndex: 1,
      beforeLineNumber: 2,
      afterLineNumber: 2,
    })
  })

  it('returns separate sites for disjoint change regions', () => {
    const sites = collectDiffChangeSites(buildSideBySideDiff('old\nkeep\nold2\n', 'new\nkeep\nnew2\n'))
    expect(sites).toHaveLength(2)
    expect(sites[0]?.rowIndex).toBe(0)
    expect(sites[1]?.rowIndex).toBe(2)
  })
})

describe('countDiffStats', () => {
  it('counts added, removed, and changed rows', () => {
    const rows = buildSideBySideDiff('a\nold\n', 'a\nnew\nextra\n')
    const stats = countDiffStats(rows)
    expect(stats.added).toBeGreaterThan(0)
    expect(stats.removed).toBeGreaterThan(0)
  })
})
