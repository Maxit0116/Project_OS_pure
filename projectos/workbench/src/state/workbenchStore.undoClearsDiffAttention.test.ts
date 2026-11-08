import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectOSApi } from '@contracts/index'
import { selectDiffReviewAttention } from './pendingChangesDrawer'
import { useWorkbenchStore } from './workbenchStore'

afterEach(() => {
  useWorkbenchStore.setState({
    client: null,
    project: null,
    activeRunId: null,
    chatMode: 'change',
    locale: 'en',
    generatedDiff: null,
    applyResult: null,
    diffReady: false,
    diffReadyBanner: null,
    diffFileStats: [],
    selectedDiffFilePath: null,
    pendingChangesDrawerDismissedRunId: null,
    pendingChangesDrawerExpanded: true,
    editorBuffers: {},
    messages: [],
    toasts: [],
    undoLoading: false,
    settings: null,
  })
})

describe('undo / dismiss clears Code/Diff attention', () => {
  it('clears diffReady and generatedDiff on dismiss so the stage-rail dot turns off', () => {
    useWorkbenchStore.setState({
      activeRunId: 'run_1',
      diffReady: true,
      generatedDiff: {
        runId: 'run_1',
        summary: 'pending',
        files: [{ path: 'a.ts', operation: 'modify', additions: 1, deletions: 0 }],
      } as never,
      diffFileStats: [{ path: 'a.ts', changeType: 'modify', added: 1, removed: 0 }],
      selectedDiffFilePath: 'a.ts',
    })
    expect(selectDiffReviewAttention(useWorkbenchStore.getState())).toBe(true)

    useWorkbenchStore.getState().dismissPendingChanges()

    const state = useWorkbenchStore.getState()
    expect(state.diffReady).toBe(false)
    expect(state.generatedDiff).toBeNull()
    expect(state.diffFileStats).toEqual([])
    expect(state.pendingChangesDrawerDismissedRunId).toBe('run_1')
    expect(selectDiffReviewAttention(state)).toBe(false)
  })

  it('clears attention after a successful restore undo', async () => {
    const restoreApplyBackup = vi.fn(async () => ({
      restored: true,
      filesRestored: ['a.ts'],
    }))
    useWorkbenchStore.setState({
      client: {
        restoreApplyBackup,
        getCurrentWork: vi.fn(async () => null),
        listFileTimeline: vi.fn(async () => []),
      } as unknown as ProjectOSApi,
      project: { projectId: 'p', name: 't', rootPath: '/tmp' } as never,
      activeRunId: 'run_1',
      locale: 'en',
      diffReady: true,
      generatedDiff: {
        runId: 'run_1',
        summary: 'applied',
        files: [{
          path: 'a.ts',
          operation: 'modify',
          before: 'old',
          after: 'new',
          additions: 1,
          deletions: 0,
        }],
      } as never,
      applyResult: {
        runId: 'run_1',
        applied: true,
        filesChanged: ['a.ts'],
        backupId: 'bak_1',
        verificationStatus: 'not_run',
      },
      editorBuffers: { 'a.ts': 'new' },
      messages: [],
      toasts: [],
    })
    expect(selectDiffReviewAttention(useWorkbenchStore.getState())).toBe(true)

    await useWorkbenchStore.getState().undoCurrentApply()

    const state = useWorkbenchStore.getState()
    expect(restoreApplyBackup).toHaveBeenCalled()
    expect(state.applyResult).toBeNull()
    expect(state.diffReady).toBe(false)
    expect(state.generatedDiff).toBeNull()
    expect(selectDiffReviewAttention(state)).toBe(false)
  })
})
