import { describe, expect, it } from 'vitest'

import type { AgentActionEvent, AgentRunEvent, ProjectOSApi } from '@contracts/index'
import { AgentRunEventSchema } from '@contracts/index'
import { agentActionMetadata } from '../components/AgentFlow/AgentActionRow'
import {
  checkpointPatchForAppliedResult,
  reduceRunEventState,
  type RunEventStoreSlice,
} from './handleRunEvent'

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
    flowStatus: 'idle',
    refinementConfirmed: false,
    selectedNodeId: null,
    highlightedFilePaths: [],
    diffReady: false,
    messages: [],
  }
}

function parse(event: unknown): AgentRunEvent {
  return AgentRunEventSchema.parse(event)
}

describe('Agent Flow action trace state', () => {
  it('stores typed action events without disrupting legacy step events', () => {
    const action = parse({
      eventId: 'evt_action',
      runId: 'run_trace',
      timestamp: '2026-07-18T00:00:00.000Z',
      type: 'file_read',
      phaseId: 'step_inspect',
      payload: { path: 'app/login/page.tsx', byteLength: 42, status: 'ok' },
    })
    const actionPatch = reduceRunEventState(baseState(), action)
    expect(actionPatch.flowActions).toEqual([action])
    expect(actionPatch.flowActions?.[0]?.phaseId).toBe('step_inspect')

    const stateWithAction = { ...baseState(), ...actionPatch }
    const step = parse({
      eventId: 'evt_step',
      runId: 'run_trace',
      timestamp: '2026-07-18T00:00:01.000Z',
      type: 'step_started',
      step: {
        id: 'step_understand',
        label: 'Understand',
        kind: 'understand',
        status: 'running',
        relatedNodeIds: [],
        relatedFiles: [],
      },
    })
    const stepPatch = reduceRunEventState(stateWithAction, step)
    expect(stepPatch.flowSteps).toHaveLength(1)
    expect(stepPatch.flowActions).toBeUndefined()
    expect(stateWithAction.flowActions).toEqual([action])
  })

  it('formats action metadata without inventing source content', () => {
    const action = AgentRunEventSchema.parse({
      eventId: 'evt_diff',
      runId: 'run_trace',
      timestamp: '2026-07-18T00:00:00.000Z',
      type: 'diff_proposed',
      payload: {
        files: [{ path: 'app/login/page.tsx', operation: 'modify' }],
      },
    })
    if (action.type !== 'diff_proposed') throw new Error('Expected action event')

    expect(agentActionMetadata(action)).toEqual(['modify · app/login/page.tsx'])
  })

  it('returns no metadata for an unknown future action type', () => {
    expect(agentActionMetadata({
      type: 'future_action',
      payload: {},
    } as unknown as AgentActionEvent)).toEqual([])
  })

  it('formats only the bounded edit-plan projection', () => {
    const action = AgentRunEventSchema.parse({
      eventId: 'evt_plan',
      runId: 'run_trace',
      timestamp: '2026-07-18T00:00:00.000Z',
      type: 'edit_plan_created',
      phaseId: 'step_locate',
      payload: {
        path: 'app/login/page.tsx',
        objective: 'Update login',
        anchors: ['submit handler'],
        acceptanceCriteria: ['Login uses the requested behavior'],
        rationale: 'This file owns the interaction.',
        changeRequired: true,
      },
    })
    if (action.type !== 'edit_plan_created') throw new Error('Expected edit plan action')

    expect(agentActionMetadata(action)).toEqual([
      'objective · Update login',
      'anchor · submit handler',
      'acceptance · Login uses the requested behavior',
      'rationale · This file owns the interaction.',
    ])
  })

  it('renders honest greenfield checkpoint progress and partial-failure context', () => {
    const action = parse({
      eventId: 'evt_initialization_progress',
      runId: 'run_trace',
      timestamp: '2026-07-18T00:00:00.000Z',
      type: 'initialization_tranche_progress',
      payload: {
        planId: 'plan_greenfield',
        trancheId: 'tranche_2',
        order: 2,
        totalTranches: 3,
        status: 'failed',
        nodesCreated: 0,
        filesCreated: 0,
        committedTrancheIds: ['tranche_1'],
        reason: 'Effective graph changed before transaction commit',
      },
    })
    if (action.type !== 'initialization_tranche_progress') {
      throw new Error('Expected initialization progress action')
    }

    expect(agentActionMetadata(action)).toEqual([
      'tranche 2/3 · failed',
      'created · 0 nodes / 0 files',
      'committed checkpoints · 1',
      'reason · Effective graph changed before transaction commit',
    ])
  })

  it('records automatic apply and verification state without hiding undo metadata', () => {
    const apply = parse({
      eventId: 'evt_apply',
      runId: 'run_trace',
      timestamp: '2026-07-18T00:00:00.000Z',
      type: 'apply_result',
      phaseId: 'step_apply',
      payload: {
        filesWritten: ['app/login/page.tsx'],
        backupId: 'backup-automatic',
        outcome: 'applied',
      },
    })
    const appliedPatch = reduceRunEventState(baseState(), apply)
    if (apply.type !== 'apply_result') throw new Error('expected apply_result')
    const checkpoint = checkpointPatchForAppliedResult(baseState(), apply)
    expect(checkpoint?.conversationCheckpoints).toEqual([
      expect.objectContaining({
        backupId: 'backup-automatic',
        runId: 'run_trace',
        filesChanged: ['app/login/page.tsx'],
      }),
    ])
    expect(checkpoint?.messages[0]?.checkpointId).toBe(checkpoint?.conversationCheckpoints[0]?.id)
    expect(checkpointPatchForAppliedResult(
      { ...baseState(), conversationCheckpoints: checkpoint?.conversationCheckpoints },
      apply,
    )).toBeUndefined()

    expect(appliedPatch.applyResult).toEqual({
      runId: 'run_trace',
      applied: true,
      filesChanged: ['app/login/page.tsx'],
      verificationStatus: 'not_run',
      outcome: 'applied',
      backupId: 'backup-automatic',
    })

    const verifiedState = { ...baseState(), ...appliedPatch }
    const verification = parse({
      eventId: 'evt_verification',
      runId: 'run_trace',
      timestamp: '2026-07-18T00:00:01.000Z',
      type: 'verification_completed',
      payload: { status: 'failed' },
    })
    const verificationPatch = reduceRunEventState(verifiedState, verification)
    expect(verificationPatch.verificationResult).toEqual({
      runId: 'run_trace',
      status: 'failed',
      results: [],
    })
    expect(verificationPatch.applyResult).toMatchObject({
      backupId: 'backup-automatic',
      verificationStatus: 'failed',
    })
    expect(verificationPatch).toMatchObject({
      centerTab: 'code',
      codeSubTab: 'diff',
      messages: [{
        id: 'automatic_apply_run_trace',
        role: 'assistant',
        format: 'markdown',
      }],
    })
    expect(verificationPatch.messages?.[0]?.content).toContain('Changed and verified')
  })

  it('stores durable delegation events separately from the parent action trace', () => {
    const delegated = parse({
      eventId: 'evt_delegated',
      runId: 'run_parent',
      timestamp: '2026-07-18T00:00:00.000Z',
      type: 'task_delegated',
      payload: {
        planId: 'plan_one',
        taskId: 'task_1',
        childRunId: 'run_child',
        nodeId: 'feat_login',
        filePath: 'app/login/page.tsx',
      },
    })

    const patch = reduceRunEventState(baseState(), delegated)
    expect(patch.flowDelegationEvents).toEqual([delegated])
    expect(patch.flowActions).toBeUndefined()
    const deduplicated = reduceRunEventState(
      { ...baseState(), flowDelegationEvents: [delegated] },
      delegated,
    )
    expect(deduplicated.flowDelegationEvents).toEqual([delegated])
  })

  it('deduplicates correction events by their durable event id', () => {
    const correction = parse({
      eventId: 'evt_correction',
      runId: 'run_trace',
      timestamp: '2026-07-18T00:00:00.000Z',
      type: 'correction_added',
      payload: {
        stepId: 'step_understand',
        message: 'Keep the existing public API.',
      },
    })
    const state = {
      ...baseState(),
      flowSteps: [{
        id: 'step_understand',
        label: 'Understand',
        kind: 'understand' as const,
        status: 'running' as const,
        relatedNodeIds: [],
        relatedFiles: [],
      }],
    }

    const first = reduceRunEventState(state, correction)
    const second = reduceRunEventState({ ...state, ...first }, correction)

    expect(first.flowCorrections).toEqual([
      expect.objectContaining({
        id: correction.eventId,
        stepId: 'step_understand',
        message: 'Keep the existing public API.',
      }),
    ])
    expect(second.flowCorrections).toEqual(first.flowCorrections)
  })
})
