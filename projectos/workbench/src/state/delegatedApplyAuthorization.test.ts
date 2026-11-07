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
    locale: 'en',
    diffReviewOnlyReason: null as string | null,
    diffReady: true,
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
