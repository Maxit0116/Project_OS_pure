import { describe, expect, it } from 'vitest'
import {
  selectDiffReviewAttention,
  selectPendingChangesDrawerUndoMode,
  selectPendingChangesDrawerVisible,
} from './pendingChangesDrawer'

describe('pendingChangesDrawer selectors', () => {
  const base = {
    chatMode: 'change' as const,
    generatedDiff: { files: [{ path: 'a.ts' }] },
    activeRunId: 'run_1',
    pendingChangesDrawerDismissedRunId: null,
    applyResult: null,
    settings: { execution: { changeExecutionPolicy: 'review_first' as const } },
  }

  it('shows the drawer for pending change diffs', () => {
    expect(selectPendingChangesDrawerVisible(base)).toBe(true)
  })

  it('hides after dismiss for the same run', () => {
    expect(selectPendingChangesDrawerVisible({
      ...base,
      pendingChangesDrawerDismissedRunId: 'run_1',
    })).toBe(false)
  })

  it('hides after apply in review_first mode', () => {
    expect(selectPendingChangesDrawerVisible({
      ...base,
      applyResult: { applied: true },
    })).toBe(false)
  })

  it('keeps visible after apply in automatic mode', () => {
    expect(selectPendingChangesDrawerVisible({
      ...base,
      applyResult: { applied: true, backupId: 'backup_1' },
      settings: { execution: { changeExecutionPolicy: 'automatic' } },
    })).toBe(true)
  })

  it('keeps Undo/restore visible after automatic apply even without generatedDiff', () => {
    expect(selectPendingChangesDrawerVisible({
      ...base,
      generatedDiff: null,
      applyResult: { applied: true, backupId: 'backup_1' },
      settings: { execution: { changeExecutionPolicy: 'automatic' } },
    })).toBe(true)
  })

  it('uses restore undo mode for automatic applied runs with backup', () => {
    expect(selectPendingChangesDrawerUndoMode({
      applyResult: { applied: true, backupId: 'backup_1' },
      settings: { execution: { changeExecutionPolicy: 'automatic' } },
    })).toBe('restore')
  })
})

describe('selectDiffReviewAttention', () => {
  it('requires both diffReady and a non-empty generated diff', () => {
    expect(selectDiffReviewAttention({
      diffReady: true,
      generatedDiff: { files: [{ path: 'a.ts' }] },
    })).toBe(true)
    expect(selectDiffReviewAttention({
      diffReady: true,
      generatedDiff: null,
    })).toBe(false)
    expect(selectDiffReviewAttention({
      diffReady: true,
      generatedDiff: { files: [] },
    })).toBe(false)
    expect(selectDiffReviewAttention({
      diffReady: false,
      generatedDiff: { files: [{ path: 'a.ts' }] },
    })).toBe(false)
  })
})
