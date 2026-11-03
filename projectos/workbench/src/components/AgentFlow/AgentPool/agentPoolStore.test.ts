import { beforeEach, describe, expect, it } from 'vitest'
import { useAgentPoolStore } from './agentPoolStore'
import type { AgentPoolTask } from './projectAgentPool'

const sampleTask: AgentPoolTask = {
  taskId: 'task-1',
  definitionId: 'def_task_task-1',
  title: 'Edit login',
  modelLabel: 'Fable',
  modelId: 'm1',
  status: 'running',
  currentAction: 'Reading file',
  runId: 'run-1',
  chatSessionId: 'chat-1',
  source: 'delegation',
  history: [],
  requirementSummary: 'Fix login',
  acceptanceCriteria: ['Works'],
  flowSteps: [{ id: 's1', label: 'Locate', status: 'complete' }],
  spans: [
    {
      id: 'span:agent',
      kind: 'agent',
      label: 'Edit login',
      status: 'running',
      startMs: 0,
    },
  ],
  majorActions: [],
  traceSpans: [],
  trace: null,
  originMs: Date.parse('2026-01-01T00:00:00.000Z'),
  poolRunId: 'pool_test',
  loopSpecId: null,
  acceptance: 'none',
}

describe('agentPoolStore', () => {
  beforeEach(() => {
    useAgentPoolStore.setState({
      removedTaskIds: [],
      reviewingTaskId: null,
      continuingTaskIds: [],
      historyByTaskId: {},
      acceptanceByTaskId: {},
      expandedTaskIds: [],
      historyExpandedTaskIds: [],
      composeSubagents: [],
      reviewingTaskSnapshot: null,
      continueFeedbackByTaskId: {},
      poolRunIdByRootRunId: {},
      activePoolRunId: null,
    })
  })

  it('starts review, accepts with durable acceptance, and continues with history', () => {
    useAgentPoolStore.getState().startReview(sampleTask)
    expect(useAgentPoolStore.getState().reviewingTaskId).toBe('task-1')
    expect(useAgentPoolStore.getState().reviewingTaskSnapshot?.title).toBe('Edit login')

    useAgentPoolStore.getState().continueTask('task-1', 'tighten copy')
    const afterContinue = useAgentPoolStore.getState()
    expect(afterContinue.reviewingTaskId).toBeNull()
    expect(afterContinue.historyByTaskId['task-1']).toHaveLength(1)
    expect(afterContinue.acceptanceByTaskId['task-1']).toBe('rejected')
    expect(afterContinue.continuingTaskIds).toContain('task-1')
    expect(afterContinue.continueFeedbackByTaskId['task-1']).toBe('tighten copy')
    expect(afterContinue.historyExpandedTaskIds).toContain('task-1')

    useAgentPoolStore.getState().startReview({
      ...sampleTask,
      currentAction: 'Second pass',
    })
    useAgentPoolStore.getState().acceptTask('task-1')
    expect(useAgentPoolStore.getState().removedTaskIds).toContain('task-1')
    expect(useAgentPoolStore.getState().acceptanceByTaskId['task-1']).toBe('accepted')
    expect(useAgentPoolStore.getState().reviewingTaskSnapshot).toBeNull()
  })

  it('expands lanes independently', () => {
    useAgentPoolStore.getState().toggleExpandedTaskId('a')
    useAgentPoolStore.getState().toggleExpandedTaskId('b')
    expect(useAgentPoolStore.getState().expandedTaskIds).toEqual(['a', 'b'])
    useAgentPoolStore.getState().toggleExpandedTaskId('a')
    expect(useAgentPoolStore.getState().expandedTaskIds).toEqual(['b'])
  })

  it('creates an independent poolRunId per root run', () => {
    const first = useAgentPoolStore.getState().ensurePoolRunId('run_a', 'sess')
    const again = useAgentPoolStore.getState().ensurePoolRunId('run_a', 'sess')
    const second = useAgentPoolStore.getState().ensurePoolRunId('run_b', 'sess')
    expect(first).toBeTruthy()
    expect(first).toBe(again)
    expect(second).not.toBe(first)
    expect(first?.startsWith('pool_')).toBe(true)
  })

  it('hydrates durable definition history into the local overlay', async () => {
    const original = useAgentPoolStore.getState().loadDefinitionHistory
    useAgentPoolStore.setState({
      loadDefinitionHistory: async () => [
        {
          runId: 'run-old',
          definitionId: 'def_task_task-1',
          poolRunId: 'pool_1',
          status: 'complete',
          startedAt: '2026-01-01T00:00:00.000Z',
          endedAt: '2026-01-01T00:01:00.000Z',
          acceptance: 'rejected',
          title: 'Older pass',
          attempt: 1,
        },
      ],
    })

    try {
      await useAgentPoolStore.getState().hydrateTaskHistoryFromDisk({
        taskId: 'task-1',
        definitionId: 'def_task_task-1',
        activeRunId: 'run-1',
      })

      const history = useAgentPoolStore.getState().historyByTaskId['task-1']
      expect(history).toHaveLength(1)
      expect(history?.[0]?.runId).toBe('run-old')
      expect(history?.[0]?.title).toBe('Older pass')
    } finally {
      useAgentPoolStore.setState({ loadDefinitionHistory: original })
    }
  })
})
