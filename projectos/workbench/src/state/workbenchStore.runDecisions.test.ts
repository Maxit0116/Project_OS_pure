import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectOSApi, RunDecision } from '@contracts/index'
import { createMockSampleWorkspace } from '../../../client/mock-project-os-api-client.js'
import { useWorkbenchStore } from './workbenchStore'

const originalClient = useWorkbenchStore.getState().client
const decision: RunDecision = {
  version: '0.1.0',
  id: 'decision_1',
  projectId: 'sample-graph-saas',
  rootRunId: 'run_1',
  runId: 'run_1',
  kind: 'budget',
  question: 'Continue with a larger budget?',
  options: [{ id: 'continue', label: 'Continue' }, { id: 'stop', label: 'Stop' }],
  status: 'pending',
  revision: 1,
  createdAt: '2026-10-27T00:00:00.000Z',
}

afterEach(() => {
  useWorkbenchStore.setState({
    client: originalClient,
    project: null,
    activeRunId: null,
    decisionRootRunId: null,
    runDecisions: [],
    decisionResolvingIds: [],
    error: null,
  })
})

describe('run decisions state', () => {
  it('loads and resolves the canonical decision without optimistic approval', async () => {
    const workspace = createMockSampleWorkspace()
    const listRunDecisions = vi.fn(async () => [decision])
    const resolveRunDecision = vi.fn(async () => ({
      ...decision,
      status: 'resolved' as const,
      revision: 2,
      answer: { optionId: 'continue' },
      resolvedAt: '2026-10-27T00:01:00.000Z',
    }))
    useWorkbenchStore.setState({
      client: { listRunDecisions, resolveRunDecision } as unknown as ProjectOSApi,
      project: workspace.project,
      activeRunId: 'run_1',
      runDecisions: [],
      decisionResolvingIds: [],
    })

    await useWorkbenchStore.getState().loadRunDecisions()
    expect(useWorkbenchStore.getState().runDecisions).toEqual([decision])
    await useWorkbenchStore.getState().resolveRunDecision(decision, 'continue')

    expect(resolveRunDecision).toHaveBeenCalledWith(
      workspace.project.projectId,
      decision.id,
      decision.revision,
      { optionId: 'continue' },
      'resolved',
    )
    expect(useWorkbenchStore.getState().runDecisions[0]).toMatchObject({
      status: 'resolved',
      revision: 2,
    })
    expect(useWorkbenchStore.getState().decisionResolvingIds).toEqual([])
  })

  it('discards an out-of-order decision response for a no-longer-inspected run', async () => {
    const workspace = createMockSampleWorkspace()
    const finish = new Map<string, (decisions: RunDecision[]) => void>()
    const listRunDecisions = vi.fn((projectId: string, rootRunId: string) => new Promise<RunDecision[]>((resolve) => {
      finish.set(rootRunId, resolve)
    }))
    useWorkbenchStore.setState({
      client: { listRunDecisions } as unknown as ProjectOSApi,
      project: workspace.project,
      activeRunId: 'root_active',
      decisionRootRunId: null,
      runDecisions: [],
      decisionResolvingIds: [],
      notifyOnPendingDecision: false,
    })

    const firstRequest = useWorkbenchStore.getState().loadRunDecisions('root_history_a')
    const secondRequest = useWorkbenchStore.getState().loadRunDecisions('root_history_b')
    const decisionA = { ...decision, id: 'decision_history_a', rootRunId: 'root_history_a', runId: 'root_history_a' }
    const decisionB = { ...decision, id: 'decision_history_b', rootRunId: 'root_history_b', runId: 'root_history_b' }
    finish.get('root_history_b')!([decisionB])
    await secondRequest
    finish.get('root_history_a')!([decisionA])
    await firstRequest

    expect(useWorkbenchStore.getState().activeRunId).toBe('root_active')
    expect(useWorkbenchStore.getState().decisionRootRunId).toBe('root_history_b')
    expect(useWorkbenchStore.getState().runDecisions).toEqual([decisionB])
  })
})
