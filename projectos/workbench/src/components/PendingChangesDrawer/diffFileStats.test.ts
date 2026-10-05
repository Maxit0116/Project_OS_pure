import { describe, expect, it } from 'vitest'
import {
  computeDiffFileStat,
  computeDiffFileStats,
  summarizeDiffStats,
} from './diffFileStats'

describe('diffFileStats', () => {
  it('counts modify file changes', () => {
    const stat = computeDiffFileStat({
      path: 'app/login/page.tsx',
      changeType: 'modify',
      before: 'alpha\nold\n',
      after: 'alpha\nnew\n',
    })
    expect(stat.added).toBeGreaterThan(0)
    expect(stat.removed).toBeGreaterThan(0)
  })

  it('counts create files as additions only', () => {
    const stat = computeDiffFileStat({
      path: 'lib/new.ts',
      changeType: 'create',
      after: 'export const ok = true\n',
    })
    expect(stat.added).toBe(1)
    expect(stat.removed).toBe(0)
  })

  it('counts delete files as removals only', () => {
    const stat = computeDiffFileStat({
      path: 'lib/old.ts',
      changeType: 'delete',
      before: 'export const ok = true\n',
    })
    expect(stat.added).toBe(0)
    expect(stat.removed).toBe(1)
  })

  it('returns zero stats for empty modify content', () => {
    const stat = computeDiffFileStat({
      path: 'empty.ts',
      changeType: 'modify',
    })
    expect(stat).toEqual({
      path: 'empty.ts',
      changeType: 'modify',
      added: 0,
      removed: 0,
    })
  })

  it('aggregates totals across files', () => {
    const files = [
      {
        path: 'a.ts',
        changeType: 'create' as const,
        after: 'one\n',
      },
      {
        path: 'b.ts',
        changeType: 'delete' as const,
        before: 'two\n',
      },
    ]
    expect(computeDiffFileStats(files)).toHaveLength(2)
    expect(summarizeDiffStats(files)).toEqual({ added: 1, removed: 1 })
  })
})
