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
  applyResult: { applied: boolean } | null
  settings: { execution: { changeExecutionPolicy: 'review_first' | 'automatic' } } | null
}): boolean {
  if (state.chatMode !== 'change') return false
  if (!state.generatedDiff || state.generatedDiff.files.length === 0) return false
  if (!state.activeRunId) return false
  if (state.activeRunId === state.pendingChangesDrawerDismissedRunId) return false
  const policy = state.settings?.execution.changeExecutionPolicy ?? 'review_first'
  if (state.applyResult?.applied && policy !== 'automatic') return false
  return true
}

export function selectPendingChangesDrawerUndoMode(state: {
  applyResult: { applied: boolean; backupId?: string } | null
  settings: { execution: { changeExecutionPolicy: 'review_first' | 'automatic' } } | null
}): PendingChangesDrawerUndoMode {
  const policy = state.settings?.execution.changeExecutionPolicy ?? 'review_first'
  if (
    policy === 'automatic' &&
    state.applyResult?.applied &&
    state.applyResult.backupId
  ) {
    return 'restore'
  }
  return 'dismiss'
}
