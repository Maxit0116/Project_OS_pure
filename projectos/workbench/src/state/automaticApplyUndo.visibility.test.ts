/**
 * SYNTHETIC — automatic execution Apply → Undo visibility (not real DeepSeek).
 * After project_api automatic commit, Apply button is not required; Undo/restore must remain.
 */
import { describe, expect, it, vi } from 'vitest'

import type { ProjectOSApi } from '@contracts/index'
import { AgentRunEventSchema } from '@contracts/index'
import { handleRunEvent } from './handleRunEvent'
import {
  selectPendingChangesDrawerUndoMode,
  selectPendingChangesDrawerVisible,
} from './pendingChangesDrawer'
import { useWorkbenchStore } from './workbenchStore'

describe('automatic Apply Undo visibility (SYNTHETIC)', () => {
  it('keeps restore Undo available after automatic apply_result even without Diff bytes', async () => {
    const restoreApplyBackup = vi.fn(async () => ({
      restored: true,
      filesRestored: ['a.ts'],
    }))
    useWorkbenchStore.setState({
      client: {
        restoreApplyBackup,
        getCurrentWork: vi.fn(async () => null),
      } as unknown as ProjectOSApi,
      project: { projectId: 'p', name: 'SYNTHETIC', rootPath: '/tmp' } as never,
      activeRunId: 'run_parent',
      chatMode: 'change',
      locale: 'en',
      generatedDiff: null,
      applyResult: null,
      settings: {
        execution: { changeExecutionPolicy: 'automatic' },
      } as never,
      editorBuffers: {},
      messages: [],
      toasts: [],
      pendingChangesDrawerDismissedRunId: null,
    })

    const apply = AgentRunEventSchema.parse({
      eventId: 'evt_auto_apply',
      runId: 'run_parent',
      timestamp: '2026-11-07T14:54:42.618Z',
      type: 'apply_result',
      payload: {
        outcome: 'applied',
        filesWritten: ['a.ts'],
        backupId: 'bak_auto_1',
      },
    })
    handleRunEvent(apply, useWorkbenchStore.setState, useWorkbenchStore.getState)

    const state = useWorkbenchStore.getState()
    expect(state.applyResult?.backupId).toBe('bak_auto_1')
    expect(
      selectPendingChangesDrawerVisible({
        chatMode: 'change',
        generatedDiff: null,
        activeRunId: 'run_parent',
        pendingChangesDrawerDismissedRunId: null,
        applyResult: state.applyResult,
        settings: { execution: { changeExecutionPolicy: 'automatic' } },
      }),
    ).toBe(true)
    expect(
      selectPendingChangesDrawerUndoMode({
        applyResult: state.applyResult,
        settings: { execution: { changeExecutionPolicy: 'automatic' } },
      }),
    ).toBe('restore')

    await useWorkbenchStore.getState().undoCurrentApply()
    expect(restoreApplyBackup).toHaveBeenCalledWith('p', 'bak_auto_1')
    expect(useWorkbenchStore.getState().applyResult).toBeNull()
  })
})
