import { describe, expect, it } from 'vitest'
import type { AgentActionEvent, AgentDelegationEvent, AgentFlowStep } from '@contracts/index'
import {
  buildHistoryEntryFromTask,
  projectAgentPool,
  summarizeActionEvent,
  type AgentPoolTask,
} from './projectAgentPool'

function step(partial: Partial<AgentFlowStep> & Pick<AgentFlowStep, 'id' | 'label'>): AgentFlowStep {
  return {
    kind: 'locate_plan',
    status: 'running',
    relatedNodeIds: [],
    relatedFiles: [],
    ...partial,
  }
}

function fileRead(path: string): AgentActionEvent {
  return {
    eventId: `ev-${path}`,
    runId: 'run-1',
    timestamp: '2026-01-01T00:00:01.000Z',
    type: 'file_read',
    payload: { path, byteLength: 12, status: 'ok' },
  }
}

function delegated(taskId: string, childRunId: string, filePath: string): AgentDelegationEvent {
  return {
    eventId: `del-${taskId}`,
    runId: 'run-root',
    timestamp: '2026-01-01T00:00:02.000Z',
    type: 'task_delegated',
    payload: {
      planId: 'plan-1',
      taskId,
      childRunId,
      nodeId: 'node-1',
      filePath,
    },
  }
}

const emptyOverlay = {
  removedTaskIds: new Set<string>(),
  reviewingTaskIds: new Set<string>(),
  continuingTaskIds: new Set<string>(),
  historyByTaskId: {},
}

describe('projectAgentPool', () => {
  it('projects a single root task when there is no delegation', () => {
    const rows = projectAgentPool({
      activeRunId: 'run-1',
      flowStatus: 'running',
      steps: [step({ id: 's1', label: 'Locate plan' })],
      flowActions: [fileRead('src/a.ts')],
      flowDelegationEvents: [],
      delegatedRunTraces: {},
      modelLabel: 'Fable 5.1',
      modelId: 'model-1',
      chatSessionId: 'chat-1',
      overlay: emptyOverlay,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.taskId).toBe('root:run-1')
    expect(rows[0]?.currentAction).toContain('src/a.ts')
    expect(rows[0]?.modelLabel).toBe('Fable 5.1')
    expect(rows[0]?.source).toBe('root')
  })

  it('projects delegated tasks alongside the root', () => {
    const rows = projectAgentPool({
      activeRunId: 'run-root',
      flowStatus: 'running',
      steps: [step({ id: 's1', label: 'Delegate' })],
      flowActions: [],
      flowDelegationEvents: [
        delegated('task-a', 'child-a', 'src/a.ts'),
        delegated('task-b', 'child-b', 'src/b.ts'),
      ],
      delegatedRunTraces: {
        'child-a': {
          taskId: 'task-a',
          filePath: 'src/a.ts',
          events: [fileRead('src/a.ts')],
        },
      },
      modelLabel: 'Fable 5.1',
      modelId: null,
      chatSessionId: 'chat-1',
      overlay: emptyOverlay,
    })
    expect(rows.map((row) => row.taskId)).toEqual([
      'root:run-root',
      'task-a',
      'task-b',
    ])
    expect(rows.find((row) => row.taskId === 'task-a')?.currentAction).toContain('src/a.ts')
  })

  it('hides removed tasks and marks reviewing / history overlays', () => {
    const rows = projectAgentPool({
      activeRunId: 'run-1',
      flowStatus: 'complete',
      steps: [step({ id: 's1', label: 'Done step', status: 'complete' })],
      flowActions: [fileRead('src/a.ts')],
      flowDelegationEvents: [],
      delegatedRunTraces: {},
      modelLabel: 'Fable 5.1',
      modelId: null,
      chatSessionId: 'chat-1',
      overlay: {
        removedTaskIds: new Set(),
        reviewingTaskIds: new Set(['root:run-1']),
        continuingTaskIds: new Set(),
        historyByTaskId: {
          'root:run-1': [
            {
              id: 'h1',
              runId: 'run-1',
              title: 'Done step',
              currentAction: 'Earlier action',
              completedAt: '2026-01-01T00:00:00.000Z',
              flowSteps: [],
            },
          ],
        },
      },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('reviewing')
    expect(rows[0]?.history).toHaveLength(1)

    const afterAccept = projectAgentPool({
      activeRunId: 'run-1',
      flowStatus: 'complete',
      steps: [step({ id: 's1', label: 'Done step', status: 'complete' })],
      flowActions: [],
      flowDelegationEvents: [],
      delegatedRunTraces: {},
      modelLabel: 'Fable 5.1',
      modelId: null,
      chatSessionId: 'chat-1',
      overlay: {
        removedTaskIds: new Set(['root:run-1']),
        reviewingTaskIds: new Set(),
        continuingTaskIds: new Set(),
        historyByTaskId: {},
      },
    })
    expect(afterAccept).toHaveLength(0)
  })

  it('federates working sessions and compose subagents', () => {
    const rows = projectAgentPool({
      activeRunId: null,
      flowStatus: 'idle',
      steps: [],
      flowActions: [],
      flowDelegationEvents: [],
      delegatedRunTraces: {},
      modelLabel: 'Fable 5.1',
      modelId: null,
      chatSessionId: 'chat-active',
      overlay: emptyOverlay,
      workingSessions: [
        { id: 'chat-active', title: 'Active', status: 'running' },
        { id: 'chat-other', title: 'Other session', status: 'running' },
      ],
      composeSubagents: [
        {
          slotId: 'slot-1',
          name: 'Explorer',
          brief: 'Map the repo',
          link: { slotId: 'slot-1', status: 'running', runId: 'compose-run' },
        },
      ],
    })
    expect(rows.some((row) => row.taskId === 'session:chat-other')).toBe(true)
    expect(rows.some((row) => row.taskId === 'session:chat-active')).toBe(false)
    const compose = rows.find((row) => row.taskId === 'compose:slot-1')
    expect(compose?.title).toBe('Explorer')
    expect(compose?.source).toBe('compose')
  })

  it('builds history entries from the current task snapshot', () => {
    const task: AgentPoolTask = {
      taskId: 'task-1',
      title: 'Edit file',
      modelLabel: 'Fable',
      modelId: null,
      status: 'reviewing',
      currentAction: 'Proposed diff',
      runId: 'run-9',
      chatSessionId: 'chat-1',
      source: 'delegation',
      history: [],
      requirementSummary: 'Edit file',
      acceptanceCriteria: ['ok'],
      flowSteps: [{ id: 's1', label: 'Generate', status: 'complete' }],
      loopSpecId: null,
    }
    const entry = buildHistoryEntryFromTask(task, '2026-02-01T00:00:00.000Z')
    expect(entry.runId).toBe('run-9')
    expect(entry.flowSteps).toHaveLength(1)
    expect(entry.completedAt).toBe('2026-02-01T00:00:00.000Z')
  })

  it('summarizes action events for the life-line label', () => {
    expect(summarizeActionEvent(fileRead('a.ts'))).toContain('a.ts')
  })
})
