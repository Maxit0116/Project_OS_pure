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
})
