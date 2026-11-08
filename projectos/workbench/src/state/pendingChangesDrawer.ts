import type { DiffFileStat } from '../components/PendingChangesDrawer/diffFileStats'

export type { DiffFileStat }

export type PendingChangesDrawerUndoMode = 'dismiss' | 'restore'

export type PendingChangesDrawerSlice = {
  pendingChangesDrawerExpanded: boolean
  pendingChangesDrawerDismissedRunId: string | null
  selectedDiffFilePath: string | null
  diffFileStats: DiffFileStat[]
}

export function selectPendingChangesDrawerVisible(state: {
  chatMode: 'ask' | 'change' | 'plan' | 'debug' | 'anchored'
  generatedDiff: { files: unknown[] } | null
  activeRunId: string | null
  pendingChangesDrawerDismissedRunId: string | null
  applyResult: { applied: boolean; backupId?: string } | null
  settings: { execution: { changeExecutionPolicy: 'review_first' | 'automatic' } } | null
}): boolean {
  if (state.chatMode !== 'change') return false
  if (!state.activeRunId) return false
  if (state.activeRunId === state.pendingChangesDrawerDismissedRunId) return false
  const policy = state.settings?.execution.changeExecutionPolicy ?? 'review_first'
  // Automatic apply still needs Undo/restore even if Diff bytes are briefly unloaded.
  const restoreableAutomatic =
    policy === 'automatic' &&
    state.applyResult?.applied === true &&
    Boolean(state.applyResult.backupId)
  if (!restoreableAutomatic) {
    if (!state.generatedDiff || state.generatedDiff.files.length === 0) return false
  }
  if (state.applyResult?.applied && policy !== 'automatic') return false
  return true
}

export function selectPendingChangesDrawerUndoMode(state: {
  applyResult: { applied: boolean; backupId?: string } | null
  settings: { execution: { changeExecutionPolicy: 'review_first' | 'automatic' } } | null
}): PendingChangesDrawerUndoMode {
  // Any applied run with a restore backup must map 「全部撤销」to undoCurrentApply.
  // Previously only automatic did this; review_first uncertain→human Apply then lost Undo.
  if (state.applyResult?.applied && state.applyResult.backupId) {
    return 'restore'
  }
  return 'dismiss'
}

/** Stage-rail Code/Diff live dot: only when there is a reviewable diff payload. */
export function selectDiffReviewAttention(state: {
  diffReady: boolean
  generatedDiff: { files: unknown[] } | null
}): boolean {
  return state.diffReady && (state.generatedDiff?.files.length ?? 0) > 0
}
