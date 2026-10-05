import type { GeneratedDiffFile } from '@contracts/index'
import {
  buildSideBySideDiffForFile,
  countDiffStats,
  type DiffStats,
} from '../DiffReview/diffHighlight'

export type DiffFileStat = {
  path: string
  changeType: GeneratedDiffFile['changeType']
  added: number
  removed: number
}

export function computeDiffFileStat(file: GeneratedDiffFile): DiffFileStat {
  const before = file.before ?? ''
  const after = file.after ?? ''
  const rows = buildSideBySideDiffForFile(before, after, file.changeType)
  const stats = countDiffStats(rows)
  return {
    path: file.path,
    changeType: file.changeType,
    added: stats.added,
    removed: stats.removed,
  }
}

export function computeDiffFileStats(files: GeneratedDiffFile[]): DiffFileStat[] {
  return files.map(computeDiffFileStat)
}

export function summarizeDiffStats(files: GeneratedDiffFile[]): DiffStats {
  return computeDiffFileStats(files).reduce(
    (totals, file) => ({
      added: totals.added + file.added,
      removed: totals.removed + file.removed,
    }),
    { added: 0, removed: 0 },
  )
}
