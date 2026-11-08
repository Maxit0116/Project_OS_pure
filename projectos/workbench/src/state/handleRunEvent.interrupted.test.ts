import { describe, expect, it, vi } from 'vitest'

import type { AgentRunEvent, ProjectOSApi } from '@contracts/index'
import { AgentRunEventSchema } from '@contracts/index'
import { deriveChatSessionStatus } from './chatSessionSync'
import { reduceRunEventState, type RunEventStoreSlice } from './handleRunEvent'
import { reconcileStaleFlowStatus } from './workbenchStore'

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
    diffReady: false,
    messages: [],
    graph: null,
  }
}

const event = (type: 'run_interrupted' | 'run_cancelled'): AgentRunEvent =>
  AgentRunEventSchema.parse({ eventId: `evt_${type}`, runId: 'run_1', timestamp: '2026-11-05T00:00:00.000Z', type })

describe('a run the app lost versus one the person stopped', () => {
  it('shows an interrupted run as interrupted, not as an error', () => {
    // Observed live: after the app was killed mid-run and reopened, the flow said "error" and the word
    // "interrupted" appeared nowhere, though nothing had failed and nothing was re-applied.
    expect(reduceRunEventState(baseState(), event('run_interrupted')).flowStatus).toBe('interrupted')
  })

  it('keeps a cancelled run as it was', () => {
    expect(reduceRunEventState(baseState(), event('run_cancelled')).flowStatus).toBe('error')
  })

  it('lists an interrupted run as an error in the session list, which has no interrupted state', () => {
    expect(deriveChatSessionStatus({ flowStatus: 'interrupted', pendingRefinement: null, pendingPlan: null, refineLoading: false, activeRunId: null, messages: [] } as never)).toBe('error')
  })
})

describe('reconciling a flow status that was running when the app closed', () => {
  const clientWith = (status: string) => ({ getAgentRun: vi.fn(async () => ({ status })) }) as unknown as ProjectOSApi

  it.each([
    ['running', 'running'],
    ['queued', 'running'],
    ['awaiting_review', 'awaiting_review'],
    ['error', 'error'],
    ['interrupted', 'interrupted'],
    ['cancelled', 'idle'],
    ['complete', 'complete'],
  ] as const)('maps a run on disk that is %s to %s', async (runStatus, expected) => {
    // Interrupted and cancelled used to fall through to "complete", telling a person an unfinished run had finished.
    await expect(reconcileStaleFlowStatus(clientWith(runStatus), 'run_1', 'running')).resolves.toBe(expected)
  })

  it('leaves a status that was not running alone, and treats a missing run as idle', async () => {
    await expect(reconcileStaleFlowStatus(clientWith('complete'), 'run_1', 'error')).resolves.toBe('error')
    await expect(reconcileStaleFlowStatus(clientWith('complete'), null, 'running')).resolves.toBe('idle')
  })
})
