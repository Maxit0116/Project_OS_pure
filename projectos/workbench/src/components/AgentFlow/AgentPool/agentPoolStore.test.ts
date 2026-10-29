import { beforeEach, describe, expect, it } from 'vitest'
import { useAgentPoolStore } from './agentPoolStore'
import type { AgentPoolTask } from './projectAgentPool'

const sampleTask: AgentPoolTask = {
  taskId: 'task-1',
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
  loopSpecId: null,
}

describe('agentPoolStore', () => {
  beforeEach(() => {
    useAgentPoolStore.setState({
      removedTaskIds: [],
      reviewingTaskId: null,
      continuingTaskIds: [],
      historyByTaskId: {},
      expandedTaskId: null,
      historyExpandedTaskId: null,
      composeSubagents: [],
      reviewingTaskSnapshot: null,
      continueFeedbackByTaskId: {},
    })
  })

  it('starts review, accepts to remove, and continues with history', () => {
    useAgentPoolStore.getState().startReview(sampleTask)
    expect(useAgentPoolStore.getState().reviewingTaskId).toBe('task-1')
    expect(useAgentPoolStore.getState().reviewingTaskSnapshot?.title).toBe('Edit login')

    useAgentPoolStore.getState().continueTask('task-1', 'tighten copy')
    const afterContinue = useAgentPoolStore.getState()
    expect(afterContinue.reviewingTaskId).toBeNull()
    expect(afterContinue.historyByTaskId['task-1']).toHaveLength(1)
    expect(afterContinue.continuingTaskIds).toContain('task-1')
    expect(afterContinue.continueFeedbackByTaskId['task-1']).toBe('tighten copy')
    expect(afterContinue.historyExpandedTaskId).toBe('task-1')

    useAgentPoolStore.getState().startReview({
      ...sampleTask,
      currentAction: 'Second pass',
    })
    useAgentPoolStore.getState().acceptTask('task-1')
    expect(useAgentPoolStore.getState().removedTaskIds).toContain('task-1')
    expect(useAgentPoolStore.getState().reviewingTaskSnapshot).toBeNull()
  })
})
