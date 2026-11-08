import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import type { AgentRunEvent, ProjectOSApi } from '@contracts/index'
import { AgentRunEventSchema } from '@contracts/index'
import { ProjectOSError } from '../../../errors.js'
import { DelegatedRunTree } from '../components/AgentFlow/AgentFlowPanel'
import { userFacingErrorMessage } from '../errors/userFacingError'
import { reduceRunEventState, type RunEventStoreSlice } from './handleRunEvent'
import { useWorkbenchStore } from './workbenchStore'

function baseState(): RunEventStoreSlice {
  return {
    client: {} as ProjectOSApi,
    project: null,
    harnessFixRunId: null,
    harnessRecord: null,
    locale: 'en',
    flashKey: 0,
    centerTab: 'function-map',
    codeSubTab: 'editor',
    flowSteps: [],
    flowActions: [],
    flowDelegationEvents: [],
    flowCorrections: [],
    flowStatus: 'running',
    refinementConfirmed: false,
    selectedNodeId: null,
    highlightedFilePaths: [],
    executionOverlay: null,
    activeRunId: 'run_root',
    diffReady: false,
    diffReviewOnlyReason: null,
    revokedApplyRunIds: [],
    error: null,
  } as RunEventStoreSlice
}

describe('cancel / Stop product DOM + state regressions (unpaid)', () => {
  afterEach(() => {
    useWorkbenchStore.setState({ locale: 'en' })
  })

  it('run_cancelled sets flowStatus cancelled (Ask/Agent Stop path)', () => {
    const cancelled = AgentRunEventSchema.parse({
      eventId: 'evt_cancel',
      runId: 'run_root',
      timestamp: '2026-11-08T00:00:00.000Z',
      type: 'run_cancelled',
    })
    const after = reduceRunEventState(baseState(), cancelled)
    expect(after.flowStatus).toBe('cancelled')
    expect(after.revokedApplyRunIds).toContain('run_root')
  })

  it('operation_cancelled surfaces Stop copy, not orchestration-failed', () => {
    const message = userFacingErrorMessage(
      new ProjectOSError('operation_cancelled', "Decision 'x' was declined; no files were written"),
      'en',
    )
    expect(message).toMatch(/Stopped/i)
    expect(message).not.toMatch(/declined; no files were written/i)
    expect(message).not.toMatch(/orchestration failed/i)
  })

  it('delegated sibling failureCategory cancelled renders stopped, not error', () => {
    const events: AgentRunEvent[] = [
      {
        eventId: 'evt_plan',
        runId: 'run_root',
        timestamp: '2026-07-20T00:00:01.000Z',
        type: 'plan_created',
        payload: {
          plan: {
            version: '0.1.0',
            planId: 'plan_root',
            projectId: 'project_one',
            parentRunId: 'run_root',
            nodeId: 'feat_login',
            contextBundleHash: `sha256:${'a'.repeat(64)}`,
            objective: 'Update login',
            tasks: [{
              taskId: 'task_1',
              filePath: 'app/login/page.tsx',
              objective: 'Update heading',
              acceptanceCriteria: ['Heading updated'],
            }],
            rationale: 'Owned by login feature.',
          },
        },
      } as AgentRunEvent,
      {
        eventId: 'evt_task',
        runId: 'run_root',
        timestamp: '2026-07-20T00:00:02.000Z',
        type: 'task_delegated',
        payload: {
          planId: 'plan_root',
          taskId: 'task_1',
          childRunId: 'run_leaf',
          nodeId: 'feat_login',
          filePath: 'app/login/page.tsx',
        },
      } as AgentRunEvent,
      {
        eventId: 'evt_started',
        runId: 'run_root',
        timestamp: '2026-07-20T00:00:03.000Z',
        type: 'child_run_started',
        payload: { planId: 'plan_root', taskId: 'task_1', childRunId: 'run_leaf' },
      } as AgentRunEvent,
      {
        eventId: 'evt_complete',
        runId: 'run_root',
        timestamp: '2026-07-20T00:00:04.000Z',
        type: 'child_run_completed',
        payload: {
          planId: 'plan_root',
          taskId: 'task_1',
          childRunId: 'run_leaf',
          status: 'error',
          failureCategory: 'cancelled',
        },
      } as AgentRunEvent,
    ]
    useWorkbenchStore.setState({ locale: 'en' })
    const html = renderToStaticMarkup(
      <DelegatedRunTree events={events as never} tracesByRun={{}} live={false} />,
    )
    expect(html).toContain('data-child-outcome="stopped"')
    expect(html).not.toContain('data-child-outcome="error"')
  })
})
