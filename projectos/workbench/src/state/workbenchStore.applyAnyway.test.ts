import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentRunEvent, ApplyResult, ProjectGraph, ProjectOSApi, SemanticTree } from '@contracts/index'
import { AgentRunEventSchema } from '@contracts/index'

import { reduceRunEventState, type RunEventStoreSlice } from './handleRunEvent'
import { useWorkbenchStore } from './workbenchStore'

const applied: ApplyResult = {
  runId: 'run_1',
  applied: true,
  filesChanged: ['app/page.tsx'],
  verificationStatus: 'not_run',
  outcome: 'applied',
}

function setup(client: Partial<ProjectOSApi>, state: Record<string, unknown> = {}) {
  useWorkbenchStore.setState({
    client: {
      getProjectGraph: vi.fn(async () => ({ nodes: [] }) as unknown as ProjectGraph),
      getSemanticTree: vi.fn(async () => ({ roots: [] }) as unknown as SemanticTree),
      getCurrentWork: vi.fn(async () => ({}) as never),
      ...client,
    } as unknown as ProjectOSApi,
    project: { projectId: 'project_1' } as never,
    activeRunId: 'run_1',
    generatedDiff: null,
    diffReviewOnlyReason: null,
    diffUnmetRequirements: [],
    locale: 'en',
    toasts: [],
    error: null,
    ...state,
  } as never)
}

describe('apply anyway', () => {
  beforeEach(() => {
    useWorkbenchStore.setState({ toasts: [], error: null, diffUnmetRequirements: [] } as never)
  })

  it('uses the ordinary Apply unless the person chose apply anyway', async () => {
    const applyDiff = vi.fn(async () => applied)
    const applyDespiteUnmetRequirements = vi.fn(async () => applied)
    setup({ applyDiff, applyDespiteUnmetRequirements })

    await useWorkbenchStore.getState().applyCurrentDiff()

    expect(applyDiff).toHaveBeenCalledWith('run_1')
    expect(applyDespiteUnmetRequirements).not.toHaveBeenCalled()
  })

  it('calls the separate server method for apply anyway, and clears the unmet list once applied', async () => {
    const applyDiff = vi.fn(async () => applied)
    const applyDespiteUnmetRequirements = vi.fn(async () => applied)
    setup({ applyDiff, applyDespiteUnmetRequirements }, {
      diffUnmetRequirements: [{ path: 'app/page.tsx', problems: ['must say Welcome'] }],
    })

    await useWorkbenchStore.getState().applyCurrentDiff({ anyway: true })

    expect(applyDespiteUnmetRequirements).toHaveBeenCalledWith('run_1')
    expect(applyDiff).not.toHaveBeenCalled()
    expect(useWorkbenchStore.getState().diffUnmetRequirements).toEqual([])
    expect(useWorkbenchStore.getState().applyResult?.applied).toBe(true)
  })

  it('learns the requirements from a refused Apply when the screen did not know, and says it plainly', async () => {
    const refusal = Object.assign(
      new Error('The independent review says this change does not meet: app/page.tsx: must say Welcome'),
      { code: 'review_unmet_requirements' },
    )
    setup({ applyDiff: vi.fn(async () => { throw refusal }) })

    await useWorkbenchStore.getState().applyCurrentDiff()

    const state = useWorkbenchStore.getState()
    expect(state.diffUnmetRequirements).toEqual([{ path: 'app/page.tsx', problems: ['must say Welcome'] }])
    expect(state.error).toMatch(/does not meet a requirement \(app\/page\.tsx: must say Welcome\)/u)
    expect(state.error).toMatch(/Apply anyway/u)
    expect(state.error).not.toMatch(/independent review says this change does not meet:/u)
  })
})

describe('a held change reaches the screen with its unmet requirements', () => {
  const base = (): RunEventStoreSlice => ({
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
  })
  const diffReady = (payload: unknown): AgentRunEvent =>
    AgentRunEventSchema.parse({ eventId: 'evt_d', runId: 'run_1', timestamp: '2026-11-05T00:00:00.000Z', type: 'diff_ready', payload })

  it('puts the unmet requirements from diff_ready on the screen', () => {
    const patch = reduceRunEventState(base(), diffReady({
      fileCount: 1,
      paths: ['app/page.tsx'],
      unmetRequirements: [{ path: 'app/page.tsx', problems: ['must say Welcome'] }],
    }))
    expect(patch.diffReady).toBe(true)
    expect(patch.diffUnmetRequirements).toEqual([{ path: 'app/page.tsx', problems: ['must say Welcome'] }])
  })

  it('shows none for an ordinary change, and drops a malformed list', () => {
    expect(reduceRunEventState(base(), diffReady({ fileCount: 1, paths: ['a.ts'] })).diffUnmetRequirements).toEqual([])
    expect(reduceRunEventState(base(), diffReady({ unmetRequirements: 'oops' })).diffUnmetRequirements).toEqual([])
  })
})
