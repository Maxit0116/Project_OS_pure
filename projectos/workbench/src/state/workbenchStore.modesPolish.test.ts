import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectOSApi } from '@contracts/index'
import { useWorkbenchStore } from './workbenchStore'

describe('workbenchStore modes polish', () => {
  beforeEach(() => {
    useWorkbenchStore.setState({
      project: {
        projectId: 'proj_1',
        name: 'Test',
        rootPath: '/tmp/proj',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      } as never,
      client: null,
      chatMode: 'change',
      activeCustomModeSkillId: null,
      customModePreviousChatMode: null,
      conversationCheckpoints: [],
      messages: [],
      activeRunId: null,
      flowStatus: 'idle',
      refineLoading: false,
      generatedDiff: null,
      applyResult: null,
      pendingPlan: null,
      locale: 'en',
      toasts: [],
      error: null,
    })
  })

  it('pins custom mode and exit restores the previous built-in mode', () => {
    useWorkbenchStore.setState({ chatMode: 'ask' })
    useWorkbenchStore.getState().setActiveCustomModeSkillId('skill_review')
    expect(useWorkbenchStore.getState()).toMatchObject({
      activeCustomModeSkillId: 'skill_review',
      customModePreviousChatMode: 'ask',
      chatMode: 'ask',
    })

    useWorkbenchStore.setState({ chatMode: 'change' })
    useWorkbenchStore.getState().exitCustomMode()
    expect(useWorkbenchStore.getState()).toMatchObject({
      activeCustomModeSkillId: null,
      customModePreviousChatMode: null,
      chatMode: 'ask',
    })
  })

  it('savePlanEdits then confirmPlanBuild uses the edited plan id', async () => {
    const updatePlan = vi.fn(async (request: { planId: string; objective?: string }) => ({
      version: '0.1.0' as const,
      id: request.planId,
      projectId: 'proj_1',
      scope: { kind: 'global' as const },
      objective: request.objective ?? 'edited',
      steps: [
        {
          id: 'step_1',
          description: 'Edited step',
          affectedFiles: ['a.ts'],
          acceptanceCriteria: ['ok'],
        },
      ],
      todos: [],
      ambiguities: [],
      rationale: 'Edited rationale',
      status: 'ready' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }))
    const buildPlan = vi.fn(async () => ({
      id: 'ref_from_plan',
      understood: 'Built',
      ambiguities: [],
      suggestions: [],
      affectedNodeIds: [],
      affectedFiles: ['a.ts'],
      confidence: 1,
      mode: 'model' as const,
      sourcePlanId: 'plan_1',
      executionPolicy: 'review_first' as const,
    }))
    useWorkbenchStore.setState({
      client: { updatePlan, buildPlan } as unknown as ProjectOSApi,
      pendingPlan: {
        version: '0.1.0',
        id: 'plan_1',
        projectId: 'proj_1',
        scope: { kind: 'global' },
        objective: 'original',
        steps: [
          {
            id: 'step_1',
            description: 'Original',
            affectedFiles: [],
            acceptanceCriteria: ['ok'],
          },
        ],
        todos: [],
        ambiguities: [],
        rationale: 'Because',
        status: 'ready',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      // Avoid the live-run poll loop; this test only asserts edit → build wiring.
      confirmRefinement: vi.fn(async () => undefined),
    } as never)

    await useWorkbenchStore.getState().savePlanEdits({
      objective: 'edited',
      steps: [
        {
          id: 'step_1',
          description: 'Edited step',
          affectedFiles: ['a.ts'],
          acceptanceCriteria: ['ok'],
        },
      ],
      todos: [],
      rationale: 'Edited rationale',
    })
    expect(updatePlan).toHaveBeenCalled()
    expect(useWorkbenchStore.getState().pendingPlan?.objective).toBe('edited')

    await useWorkbenchStore.getState().confirmPlanBuild()
    expect(buildPlan).toHaveBeenCalledWith('plan_1')
    expect(useWorkbenchStore.getState().confirmRefinement).toHaveBeenCalled()
  })

  it('restoreConversationCheckpoint calls restoreApplyBackup and keeps messages', async () => {
    const restoreApplyBackup = vi.fn(async () => ({ restored: true }))
    useWorkbenchStore.setState({
      client: { restoreApplyBackup } as unknown as ProjectOSApi,
      conversationCheckpoints: [
        {
          id: 'ckpt_1',
          messageId: 'msg_ckpt',
          backupId: 'backup_1',
          runId: 'run_1',
          createdAt: '2026-01-01T00:00:00.000Z',
          filesChanged: ['a.ts'],
        },
      ],
      messages: [
        {
          id: 'msg_ckpt',
          role: 'system',
          content: 'Checkpoint',
          timestamp: '2026-01-01T00:00:00.000Z',
          checkpointId: 'ckpt_1',
        },
      ],
    })

    await useWorkbenchStore.getState().restoreConversationCheckpoint('ckpt_1')

    expect(restoreApplyBackup).toHaveBeenCalledWith('proj_1', 'backup_1')
    expect(useWorkbenchStore.getState().messages).toHaveLength(1)
  })

  it('listWorkspacePlans returns client summaries', async () => {
    const listWorkspacePlans = vi.fn(async () => [
      {
        id: 'plan_saved',
        path: '.projectos/plans/plan_saved.md',
        objective: 'Saved objective',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ])
    useWorkbenchStore.setState({
      client: { listWorkspacePlans } as unknown as ProjectOSApi,
    })
    const plans = await useWorkbenchStore.getState().listWorkspacePlans()
    expect(listWorkspacePlans).toHaveBeenCalledWith('proj_1')
    expect(plans).toEqual([
      expect.objectContaining({ id: 'plan_saved', objective: 'Saved objective' }),
    ])
  })

  it('undoCurrentApply restores a delegated transaction-group backup once', async () => {
    const restoreApplyBackup = vi.fn(async () => ({
      backupId: 'backup_group',
      restored: true,
      filesRestored: ['app/login/page.tsx', 'components/LoginForm.tsx'],
      outcome: 'restored' as const,
    }))
    const getCurrentWork = vi.fn(async () => ({ recentChanges: [] }))
    useWorkbenchStore.setState({
      client: { restoreApplyBackup, getCurrentWork } as unknown as ProjectOSApi,
      applyResult: {
        runId: 'run_parent',
        applied: true,
        filesChanged: ['app/login/page.tsx', 'components/LoginForm.tsx'],
        verificationStatus: 'not_run',
        outcome: 'applied',
        backupId: 'backup_group',
        transactionGroup: {
          parentRunId: 'run_parent',
          childRunIds: ['run_leaf_a', 'run_leaf_b'],
        },
      } as never,
      generatedDiff: {
        files: [
          { path: 'app/login/page.tsx', before: 'a0', after: 'a1', changeType: 'modify' },
          { path: 'components/LoginForm.tsx', before: 'b0', after: 'b1', changeType: 'modify' },
        ],
      } as never,
      editorBuffers: {
        'app/login/page.tsx': 'a1',
        'components/LoginForm.tsx': 'b1',
      },
    })

    await useWorkbenchStore.getState().undoCurrentApply()

    expect(restoreApplyBackup).toHaveBeenCalledTimes(1)
    expect(restoreApplyBackup).toHaveBeenCalledWith('proj_1', 'backup_group')
    expect(useWorkbenchStore.getState().applyResult).toBeNull()
    expect(useWorkbenchStore.getState().editorBuffers['app/login/page.tsx']).toBe('a0')
    expect(useWorkbenchStore.getState().editorBuffers['components/LoginForm.tsx']).toBe('b0')
  })

  it('stopAgentRun clears activeRunId so applyCurrentDiff is a no-op', async () => {
    const applyDiff = vi.fn(async () => ({
      applied: true,
      filesChanged: ['a.ts'],
      backupId: 'backup_x',
    }))
    const cancelAgentRun = vi.fn(async () => ({
      runId: 'run_stop',
      projectId: 'proj_1',
      kind: 'feature_change' as const,
      status: 'cancelled' as const,
      relatedNodeIds: [],
      relatedFiles: [],
      scope: { kind: 'global' as const },
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
    }))
    useWorkbenchStore.setState({
      client: { applyDiff, cancelAgentRun } as unknown as ProjectOSApi,
      activeRunId: 'run_stop',
      flowStatus: 'running',
      runDisposable: { dispose: vi.fn() },
      generatedDiff: { files: [{ path: 'a.ts' }] } as never,
    })

    await useWorkbenchStore.getState().stopAgentRun()
    await useWorkbenchStore.getState().applyCurrentDiff()

    expect(applyDiff).not.toHaveBeenCalled()
    expect(useWorkbenchStore.getState().activeRunId).toBeNull()
  })
})
