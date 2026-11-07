/**
 * SYNTHETIC — delegated Apply authorization (not a real model proof).
 * Parent active + child diff_ready must not apply without valid parent batch.
 * Covers async / incomplete / invalid / late / concurrent / no-write side effects.
 */
import { describe, expect, it, vi } from 'vitest'

import type { ProjectOSApi } from '@contracts/index'
import { useWorkbenchStore } from './workbenchStore'

const parentDelegation = {
  eventId: 'evt_del',
  runId: 'run_parent',
  timestamp: '2026-11-07T00:00:00.000Z',
  type: 'task_delegated' as const,
  payload: {
    planId: 'plan_1',
    taskId: 'task_1',
    childRunId: 'run_child',
    nodeId: 'node_1',
    filePath: 'a.ts',
  },
}

const childTrace = {
  events: [],
  transientTraces: [],
  parentRunId: 'run_parent',
  rootRunId: 'run_parent',
}

function baseDelegatedState(overrides: Record<string, unknown> = {}) {
  return {
    project: { projectId: 'p', name: 'SYNTHETIC', rootPath: '/tmp' } as never,
    activeRunId: 'run_parent',
    locale: 'en' as const,
    diffReviewOnlyReason: null as string | null,
    diffReady: true,
    flowStatus: 'awaiting_review' as const,
    revokedApplyRunIds: [] as string[],
    generatedDiff: {
      runId: 'run_child',
      summary: 'preview',
      files: [{ path: 'a.ts', operation: 'modify', before: 'a', after: 'b' }],
    } as never,
    delegatedRunTraces: { run_child: childTrace as never },
    flowDelegationEvents: [parentDelegation] as never,
    flowActions: [] as never[],
    toasts: [] as never[],
    messages: [],
    conversationCheckpoints: [],
    editorBuffers: {},
    selectedNodeId: null,
    ...overrides,
  }
}

const parentBatchValid = {
  eventId: 'evt_batch',
  runId: 'run_parent',
  timestamp: '2026-11-07T00:00:01.000Z',
  type: 'batch_validation_result' as const,
  payload: {
    planId: 'plan_1',
    verdict: 'valid' as const,
    tasks: [
      {
        taskId: 'task_1',
        childRunId: 'run_child',
        path: 'a.ts',
        status: 'consistent' as const,
        criteria: [{ criterion: 'c', status: 'satisfied' as const }],
      },
    ],
    crossFileStatus: 'consistent' as const,
    summary: 'ok',
    rationale: 'ok',
  },
}

describe('delegated Apply authorization (SYNTHETIC)', () => {
  it('blocks applyCurrentDiff when delegated children exist without valid parent batch', async () => {
    const applyDiff = vi.fn(async () => {
      throw new Error('must not apply')
    })
    useWorkbenchStore.setState({
      ...baseDelegatedState(),
      client: { applyDiff } as unknown as ProjectOSApi,
    })

    await useWorkbenchStore.getState().applyCurrentDiff()
    expect(applyDiff).not.toHaveBeenCalled()
    expect(useWorkbenchStore.getState().diffReviewOnlyReason).toMatch(/batch/i)
  })

  it('keeps Apply blocked while parent is active and only child diff_ready (no batch yet)', async () => {
    const applyDiff = vi.fn(async () => {
      throw new Error('must not apply')
    })
    useWorkbenchStore.setState({
      ...baseDelegatedState({
        // Mirrors child-subscription path: preview OK, Apply gated.
        diffReviewOnlyReason:
          'Child proposal is ready for preview — Apply stays blocked until parent batch validation completes',
      }),
      client: { applyDiff } as unknown as ProjectOSApi,
    })

    await useWorkbenchStore.getState().applyCurrentDiff()
    expect(applyDiff).not.toHaveBeenCalled()
    expect(useWorkbenchStore.getState().toasts.at(-1)?.type).toBe('warning')
  })

  it('blocks Apply when parent batch_validation_result is invalid (budget/JSON failure surface)', async () => {
    const applyDiff = vi.fn(async () => {
      throw new Error('must not apply')
    })
    useWorkbenchStore.setState({
      ...baseDelegatedState({
        flowActions: [
          {
            eventId: 'evt_batch_invalid',
            runId: 'run_parent',
            timestamp: '2026-11-07T00:00:01.000Z',
            type: 'batch_validation_result',
            payload: {
              planId: 'plan_1',
              verdict: 'invalid',
              tasks: [],
              crossFileStatus: 'inconsistent',
              summary: 'incomplete',
              rationale: 'budget or JSON failure must not unlock',
            },
          },
        ],
        diffReviewOnlyReason:
          'Child proposal is ready for preview — Apply stays blocked until parent batch validation completes',
      }),
      client: { applyDiff } as unknown as ProjectOSApi,
    })

    await useWorkbenchStore.getState().applyCurrentDiff()
    expect(applyDiff).not.toHaveBeenCalled()
  })

  it('blocks Apply after parent cancel / incomplete (no valid batch event)', async () => {
    const applyDiff = vi.fn(async () => {
      throw new Error('must not apply')
    })
    useWorkbenchStore.setState({
      ...baseDelegatedState({
        flowActions: [
          {
            eventId: 'evt_cancelled',
            runId: 'run_parent',
            timestamp: '2026-11-07T00:00:01.000Z',
            type: 'run_cancelled',
            payload: { reason: 'user_stop' },
          },
        ],
      }),
      client: { applyDiff } as unknown as ProjectOSApi,
    })

    await useWorkbenchStore.getState().applyCurrentDiff()
    expect(applyDiff).not.toHaveBeenCalled()
  })

  it('blocks Apply when cancel revoked the run even if late valid is present', async () => {
    const applyDiff = vi.fn(async () => {
      throw new Error('must not apply')
    })
    useWorkbenchStore.setState({
      ...baseDelegatedState({
        diffReviewOnlyReason: null,
        flowActions: [parentBatchValid],
        revokedApplyRunIds: ['run_parent'],
        flowStatus: 'awaiting_review',
      }),
      client: { applyDiff } as unknown as ProjectOSApi,
    })

    await useWorkbenchStore.getState().applyCurrentDiff()
    expect(applyDiff).not.toHaveBeenCalled()
    expect(useWorkbenchStore.getState().diffReviewOnlyReason).toMatch(/cancel/i)
  })

  it('blocks Apply when cross-run residual valid belongs to a previous parent', async () => {
    const applyDiff = vi.fn(async () => {
      throw new Error('must not apply')
    })
    useWorkbenchStore.setState({
      ...baseDelegatedState({
        activeRunId: 'run_new_parent',
        flowActions: [
          {
            ...parentBatchValid,
            eventId: 'evt_old',
            runId: 'run_old_parent',
          },
        ],
        revokedApplyRunIds: [],
      }),
      client: { applyDiff } as unknown as ProjectOSApi,
    })

    await useWorkbenchStore.getState().applyCurrentDiff()
    expect(applyDiff).not.toHaveBeenCalled()
    expect(useWorkbenchStore.getState().diffReviewOnlyReason).toMatch(/batch/i)
  })

  it('allows applyCurrentDiff only after a late valid parent batch_validation_result', async () => {
    const applyDiff = vi.fn(async () => ({
      runId: 'run_parent',
      applied: true,
      filesChanged: ['a.ts'],
      backupId: 'bak_1',
      outcome: 'applied' as const,
      verificationStatus: 'not_run' as const,
    }))
    useWorkbenchStore.setState({
      ...baseDelegatedState({
        // Incomplete first — Apply must refuse.
        diffReviewOnlyReason: null,
        flowActions: [],
      }),
      client: {
        applyDiff,
        getProjectGraph: vi.fn(async () => ({ nodes: [], edges: [], fileIndex: [] })),
        getSemanticTree: vi.fn(async () => ({ roots: [] })),
        getCurrentWork: vi.fn(async () => null),
        listFileTimeline: vi.fn(async () => []),
      } as unknown as ProjectOSApi,
    })

    await useWorkbenchStore.getState().applyCurrentDiff()
    expect(applyDiff).not.toHaveBeenCalled()

    // Late parent batch arrives after child was already diff_ready.
    useWorkbenchStore.setState({
      diffReviewOnlyReason: null,
      flowActions: [
        {
          eventId: 'evt_batch',
          runId: 'run_parent',
          timestamp: '2026-11-07T00:00:05.000Z',
          type: 'batch_validation_result',
          payload: {
            planId: 'plan_1',
            verdict: 'valid',
            tasks: [
              {
                taskId: 'task_1',
                childRunId: 'run_child',
                path: 'a.ts',
                status: 'consistent',
                criteria: [{ criterion: 'c', status: 'satisfied' }],
              },
            ],
            crossFileStatus: 'consistent',
            summary: 'ok',
            rationale: 'ok',
          },
        },
      ] as never,
    })

    await useWorkbenchStore.getState().applyCurrentDiff()
    expect(applyDiff).toHaveBeenCalledWith('run_parent')
  })

  it('concurrent Apply attempts while parent batch incomplete produce zero writes', async () => {
    const applyDiff = vi.fn(async () => {
      throw new Error('must not apply')
    })
    useWorkbenchStore.setState({
      ...baseDelegatedState(),
      client: { applyDiff } as unknown as ProjectOSApi,
    })

    await Promise.all([
      useWorkbenchStore.getState().applyCurrentDiff(),
      useWorkbenchStore.getState().applyCurrentDiff(),
      useWorkbenchStore.getState().applyCurrentDiff(),
    ])
    expect(applyDiff).not.toHaveBeenCalled()
  })

  it('heals sticky review-only after parent batch valid when late child raced', async () => {
    const applyDiff = vi.fn(async () => ({
      runId: 'run_parent',
      applied: true,
      filesChanged: ['a.ts'],
      backupId: 'bak_1',
      outcome: 'applied' as const,
      verificationStatus: 'not_run' as const,
    }))
    useWorkbenchStore.setState({
      ...baseDelegatedState({
        // Sticky gate left by a late child diff_ready after parent already unlocked.
        diffReviewOnlyReason:
          'Child proposal is ready for preview — Apply stays blocked until parent batch validation completes',
        flowActions: [parentBatchValid],
        flowStatus: 'awaiting_review',
      }),
      client: {
        applyDiff,
        getProjectGraph: vi.fn(async () => ({ nodes: [], edges: [], fileIndex: [] })),
        getSemanticTree: vi.fn(async () => ({ roots: [] })),
        getCurrentWork: vi.fn(async () => null),
        listFileTimeline: vi.fn(async () => []),
      } as unknown as ProjectOSApi,
    })

    await useWorkbenchStore.getState().applyCurrentDiff()
    expect(applyDiff).toHaveBeenCalledWith('run_parent')
    expect(useWorkbenchStore.getState().diffReviewOnlyReason).toBeNull()
  })

  it('allows applyCurrentDiff after parent batch_validation_result is valid', async () => {
    const applyDiff = vi.fn(async () => ({
      runId: 'run_parent',
      applied: true,
      filesChanged: ['a.ts'],
      backupId: 'bak_1',
      outcome: 'applied' as const,
      verificationStatus: 'not_run' as const,
    }))
    useWorkbenchStore.setState({
      ...baseDelegatedState({
        generatedDiff: {
          runId: 'run_parent',
          summary: 'ready',
          files: [{ path: 'a.ts', operation: 'modify', before: 'a', after: 'b' }],
        },
        flowActions: [
          {
            eventId: 'evt_batch',
            runId: 'run_parent',
            timestamp: '2026-11-07T00:00:01.000Z',
            type: 'batch_validation_result',
            payload: {
              planId: 'plan_1',
              verdict: 'valid',
              tasks: [
                {
                  taskId: 'task_1',
                  childRunId: 'run_child',
                  path: 'a.ts',
                  status: 'consistent',
                  criteria: [{ criterion: 'c', status: 'satisfied' }],
                },
              ],
              crossFileStatus: 'consistent',
              summary: 'ok',
              rationale: 'ok',
            },
          },
        ],
      }),
      client: {
        applyDiff,
        getProjectGraph: vi.fn(async () => ({ nodes: [], edges: [], fileIndex: [] })),
        getSemanticTree: vi.fn(async () => ({ roots: [] })),
        getCurrentWork: vi.fn(async () => null),
        listFileTimeline: vi.fn(async () => []),
      } as unknown as ProjectOSApi,
    })

    await useWorkbenchStore.getState().applyCurrentDiff()
    expect(applyDiff).toHaveBeenCalledWith('run_parent')
  })
})
