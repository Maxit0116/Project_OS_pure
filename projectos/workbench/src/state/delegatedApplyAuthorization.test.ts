/**
 * SYNTHETIC — delegated Apply authorization (not a real model proof).
 * Parent active + child diff_ready must not apply without valid parent batch.
 */
import { describe, expect, it, vi } from 'vitest'

import type { ProjectOSApi } from '@contracts/index'
import { useWorkbenchStore } from './workbenchStore'

describe('delegated Apply authorization (SYNTHETIC)', () => {
  it('blocks applyCurrentDiff when delegated children exist without valid parent batch', async () => {
    const applyDiff = vi.fn(async () => {
      throw new Error('must not apply')
    })
    useWorkbenchStore.setState({
      client: { applyDiff } as unknown as ProjectOSApi,
      project: { projectId: 'p', name: 'SYNTHETIC', rootPath: '/tmp' } as never,
      activeRunId: 'run_parent',
      locale: 'en',
      diffReviewOnlyReason: null,
      diffReady: true,
      generatedDiff: {
        runId: 'run_child',
        summary: 'preview',
        files: [{ path: 'a.ts', operation: 'modify', before: 'a', after: 'b' }],
      } as never,
      delegatedRunTraces: {
        run_child: {
          events: [],
          transientTraces: [],
          parentRunId: 'run_parent',
          rootRunId: 'run_parent',
        } as never,
      },
      flowDelegationEvents: [
        {
          eventId: 'evt_del',
          runId: 'run_parent',
          timestamp: '2026-11-07T00:00:00.000Z',
          type: 'task_delegated',
          payload: {
            planId: 'plan_1',
            taskId: 'task_1',
            childRunId: 'run_child',
            nodeId: 'node_1',
            filePath: 'a.ts',
          },
        },
      ] as never,
      flowActions: [],
      toasts: [],
    })

    await useWorkbenchStore.getState().applyCurrentDiff()
    expect(applyDiff).not.toHaveBeenCalled()
    expect(useWorkbenchStore.getState().diffReviewOnlyReason).toMatch(/batch/i)
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
      client: {
        applyDiff,
        getProjectGraph: vi.fn(async () => ({ nodes: [], edges: [], fileIndex: [] })),
        getSemanticTree: vi.fn(async () => ({ roots: [] })),
        getCurrentWork: vi.fn(async () => null),
        listFileTimeline: vi.fn(async () => []),
      } as unknown as ProjectOSApi,
      project: { projectId: 'p', name: 'SYNTHETIC', rootPath: '/tmp' } as never,
      activeRunId: 'run_parent',
      locale: 'en',
      diffReviewOnlyReason: null,
      diffReady: true,
      generatedDiff: {
        runId: 'run_parent',
        summary: 'ready',
        files: [{ path: 'a.ts', operation: 'modify', before: 'a', after: 'b' }],
      } as never,
      delegatedRunTraces: {
        run_child: {
          events: [],
          transientTraces: [],
          parentRunId: 'run_parent',
          rootRunId: 'run_parent',
        } as never,
      },
      flowDelegationEvents: [
        {
          eventId: 'evt_del',
          runId: 'run_parent',
          timestamp: '2026-11-07T00:00:00.000Z',
          type: 'task_delegated',
          payload: {
            planId: 'plan_1',
            taskId: 'task_1',
            childRunId: 'run_child',
            nodeId: 'node_1',
            filePath: 'a.ts',
          },
        },
      ] as never,
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
      ] as never,
      toasts: [],
      messages: [],
      conversationCheckpoints: [],
      editorBuffers: {},
      selectedNodeId: null,
    })

    await useWorkbenchStore.getState().applyCurrentDiff()
    expect(applyDiff).toHaveBeenCalledWith('run_parent')
  })
})
