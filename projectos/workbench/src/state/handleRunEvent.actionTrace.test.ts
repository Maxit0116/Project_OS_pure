import { describe, expect, it } from 'vitest'

import type {
  AgentActionEvent,
  AgentRunEvent,
  ProjectGraph,
  ProjectOSApi,
} from '@contracts/index'
import { AgentRunEventSchema } from '@contracts/index'
import { agentActionMetadata } from '../components/AgentFlow/AgentActionRow'
import {
  checkpointPatchForAppliedResult,
  isAgentDelegationEvent,
  reduceRunEventState,
  type RunEventStoreSlice,
} from './handleRunEvent'

function graphWithMappedFile(path: string, nodeIds: string[]): ProjectGraph {
  return {
    version: '0.5.0',
    projectId: 'p_live',
    projectName: 'Live',
    projectType: 'nextjs-app',
    analyzedAt: '2026-10-20T00:00:00.000Z',
    analysisStatus: 'complete',
    nodes: [],
    edges: [],
    fileIndex: [{ path, nodeIds, type: 'page', imports: [], exports: [] }],
  }
}

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
    executionOverlay: null,
    diffReady: false,
    messages: [],
    graph: null,
  }
}

function parse(event: unknown): AgentRunEvent {
  return AgentRunEventSchema.parse(event)
}

describe('Live Graph execution overlay', () => {
  it('projects file_read onto mapped nodes from graph.fileIndex', () => {
    const state = {
      ...baseState(),
      graph: graphWithMappedFile('app/login/page.tsx', ['code_login']),
    }
    const action = parse({
      eventId: 'evt_live_read',
      runId: 'run_live',
      timestamp: '2026-10-20T00:00:00.000Z',
      type: 'file_read',
      payload: { path: 'app/login/page.tsx', byteLength: 12, status: 'ok' },
    })
    const patch = reduceRunEventState(state, action)
    expect(patch.executionOverlay?.activityIdsByNodeId.code_login?.length).toBe(1)
    expect(patch.executionOverlay?.unmappedActivityIds).toEqual([])
  })

  it('merges child run events into the same overlay without wiping parent activity', () => {
    const graph = graphWithMappedFile('app/login/page.tsx', ['code_login'])
    const parent = parse({
      eventId: 'evt_parent',
      runId: 'run_parent',
      timestamp: '2026-10-20T00:00:00.000Z',
      type: 'file_read',
      payload: { path: 'app/login/page.tsx', byteLength: 12, status: 'ok' },
    })
    const afterParent = reduceRunEventState({ ...baseState(), graph }, parent)
    const child = parse({
      eventId: 'evt_child',
      runId: 'run_child',
      timestamp: '2026-10-20T00:00:01.000Z',
      type: 'diff_proposed',
      payload: { files: [{ path: 'app/login/page.tsx', operation: 'modify' }] },
    })
    const afterChild = reduceRunEventState(
      { ...baseState(), graph, executionOverlay: afterParent.executionOverlay! },
      child,
    )
    expect(afterChild.executionOverlay?.runId).toBe('run_parent')
    expect(afterChild.executionOverlay?.runIds).toEqual(
      expect.arrayContaining(['run_parent', 'run_child']),
    )
    expect(afterChild.executionOverlay?.activityIdsByNodeId.code_login?.length).toBe(2)
  })
})

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

  it('surfaces diff_proposed as review-only Diff preview until diff_ready', () => {
    const proposed = AgentRunEventSchema.parse({
      eventId: 'evt_proposed',
      runId: 'run_leaf',
      timestamp: '2026-11-07T00:00:00.000Z',
      type: 'diff_proposed',
      payload: {
        files: [{ path: 'macos/Package.swift', operation: 'modify' }],
      },
    })
    const afterProposed = reduceRunEventState(baseState(), proposed)
    expect(afterProposed.diffReady).toBeUndefined()
    expect(afterProposed.diffReviewOnlyReason).toMatch(/validation/i)
    expect(afterProposed.centerTab).toBe('code')
    expect(afterProposed.codeSubTab).toBe('diff')

    const ready = AgentRunEventSchema.parse({
      eventId: 'evt_ready',
      runId: 'run_leaf',
      timestamp: '2026-11-07T00:00:01.000Z',
      type: 'diff_ready',
      payload: { fileCount: 1, paths: ['macos/Package.swift'] },
    })
    const afterReady = reduceRunEventState(
      { ...baseState(), ...afterProposed },
      ready,
    )
    expect(afterReady.diffReady).toBe(true)
    expect(afterReady.flowStatus).toBe('awaiting_review')
    expect(afterReady.diffReviewOnlyReason).toBeNull()
  })

  it('keeps Apply blocked until parent batch_validation_result is valid', () => {
    const task = {
      taskId: 'task_1',
      childRunId: 'run_child',
      path: 'macos/Package.swift',
      status: 'consistent' as const,
      criteria: [{ criterion: 'Append comment', status: 'satisfied' as const }],
    }
    const invalid = AgentRunEventSchema.parse({
      eventId: 'evt_batch_invalid',
      runId: 'run_parent',
      timestamp: '2026-11-07T00:00:02.000Z',
      type: 'batch_validation_result',
      payload: {
        planId: 'plan_1',
        verdict: 'invalid',
        tasks: [{ ...task, status: 'inconsistent' }],
        crossFileStatus: 'inconsistent',
        summary: 'Parent batch rejected',
        rationale: 'Criteria incomplete',
      },
    })
    const afterInvalid = reduceRunEventState(baseState(), invalid)
    expect(afterInvalid.diffReviewOnlyReason).toMatch(/batch/i)

    const valid = AgentRunEventSchema.parse({
      eventId: 'evt_batch_valid',
      runId: 'run_parent',
      timestamp: '2026-11-07T00:00:03.000Z',
      type: 'batch_validation_result',
      payload: {
        planId: 'plan_1',
        verdict: 'valid',
        tasks: [task],
        crossFileStatus: 'consistent',
        summary: 'Parent batch accepted',
        rationale: 'All parent criteria covered',
      },
    })
    const afterValid = reduceRunEventState(
      { ...baseState(), ...afterInvalid },
      valid,
    )
    expect(afterValid.diffReviewOnlyReason).toBeNull()
    expect(afterValid.diffReady).toBe(true)
    expect(afterValid.flowStatus).toBe('awaiting_review')
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
    // The test used to pin "Changed and verified" for a run whose verification FAILED. A summary must
    // only claim what was checked.
    expect(verificationPatch.messages?.[0]?.content).toContain('verification failed')
    expect(verificationPatch.messages?.[0]?.content).not.toContain('Changed and verified')
  })

  it.each([
    ['passed', 'Changed and verified', 'not verified'],
    ['failed', 'verification failed', 'Changed and verified'],
    ['not_run', 'Changed, not verified', 'Changed and verified'],
  ] as const)('words the automatic-apply summary for a %s verification only as far as it was checked', (status, shown, hidden) => {
    const apply = parse({
      eventId: 'evt_apply',
      runId: 'run_words',
      timestamp: '2026-07-18T00:00:00.000Z',
      type: 'apply_result',
      phaseId: 'step_apply',
      payload: { filesWritten: ['lib/data.ts'], backupId: 'backup-words', outcome: 'applied' },
    })
    const applied = { ...baseState(), ...reduceRunEventState(baseState(), apply) }
    const patch = reduceRunEventState(applied, parse({
      eventId: 'evt_verification',
      runId: 'run_words',
      timestamp: '2026-07-18T00:00:01.000Z',
      type: 'verification_completed',
      payload: { status },
    }))
    const content = patch.messages?.find((message) => message.id === 'automatic_apply_run_words')?.content ?? ''
    expect(content).toContain(shown)
    expect(content).not.toContain(hidden)
    // The raw enum value must not reach a person.
    expect(content).not.toContain('not_run')
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
    expect(isAgentDelegationEvent(delegated)).toBe(true)
    if (!isAgentDelegationEvent(delegated)) {
      throw new Error('expected task_delegated to be a delegation event')
    }

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
