import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  AgentAnswerResult,
  AgentRun,
  AgentRunEvent,
  AgentTransientTrace,
  ProjectOSApi,
} from '@contracts/index'
import { emptyComposerDraft } from '@contracts/index'
import { createMockSampleWorkspace, MockProjectOSApiClient } from '../../../client/mock-project-os-api-client.js'
import { ProjectOSError } from '../../../errors.js'
import { useChatSessionStore } from './chatSessionStore'
import { canSubmitAgentPrompt, useWorkbenchStore } from './workbenchStore'

const mockClient = new MockProjectOSApiClient()
useWorkbenchStore.setState({ client: mockClient })
const originalClient = mockClient

afterEach(() => {
  useWorkbenchStore.setState({
    client: originalClient,
    project: null,
    graph: null,
    tree: null,
    messages: [],
    pendingRefinement: null,
    refinementConfirmed: false,
    refineLoading: false,
    composerDraft: emptyComposerDraft(),
    activeRunId: null,
    selectedNodeId: null,
    selectedFilePath: null,
    globalAgentActive: false,
    pendingFileOwnerChoice: null,
    fileScopeError: null,
    chatMode: 'ask',
    projectDescription: null,
    projectDescriptionSaving: false,
    latestAskTrace: null,
    agentFlowSubject: 'run',
    flowActions: [],
    flowDelegationEvents: [],
    delegatedRunTraces: {},
    flowTransientTraces: [],
    flowSteps: [],
    runDisposable: null,
    currentWork: null,
  })
})

function setReadyScope(client: ProjectOSApi, mode: 'ask' | 'change' | 'plan' | 'debug' = 'ask') {
  const workspace = createMockSampleWorkspace()
  useWorkbenchStore.setState({
    client,
    project: workspace.project,
    graph: workspace.graph,
    tree: workspace.semanticTree,
    selectedNodeId: 'feat_login',
    selectedFilePath: 'app/login/page.tsx',
    globalAgentActive: false,
    pendingFileOwnerChoice: null,
    fileScopeError: null,
    chatMode: mode,
    messages: [],
    locale: 'en',
  })
}

describe('agent conversation routing', () => {
  it('treats clearSelection as whole-project scope for Ask', async () => {
    const workspace = createMockSampleWorkspace()
    const askAgent = vi.fn(async (): Promise<AgentAnswerResult> => ({
      id: 'answer-global-clear',
      projectId: workspace.project.projectId,
      scope: { kind: 'global' },
      answer: 'Whole project answer.',
      backend: 'model',
      modelProfileId: 'model-1',
      contextBundleHash: `sha256:${'e'.repeat(64)}`,
      contextSummary: {
        files: [],
        synopsisPresent: true,
        bundleHash: `sha256:${'e'.repeat(64)}`,
      },
      responseLanguage: { tag: 'und', source: 'undetermined', validation: 'not_checkable' },
      createdAt: '2026-07-19T00:00:00.000Z',
    }))
    useWorkbenchStore.setState({
      client: { askAgent } as unknown as ProjectOSApi,
      project: workspace.project,
      graph: workspace.graph,
      tree: workspace.semanticTree,
      selectedNodeId: 'feat_login',
      selectedFilePath: 'app/login/page.tsx',
      globalAgentActive: false,
      chatMode: 'ask',
    })

    useWorkbenchStore.getState().clearSelection()
    expect(useWorkbenchStore.getState()).toMatchObject({
      globalAgentActive: true,
      selectedNodeId: null,
      selectedFilePath: null,
    })
    expect(canSubmitAgentPrompt(useWorkbenchStore.getState())).toBe(true)

    await useWorkbenchStore.getState().sendPrompt('Summarize the project')

    expect(askAgent).toHaveBeenCalledWith({
      projectId: workspace.project.projectId,
      scope: { kind: 'global' },
      question: 'Summarize the project',
      language: { mode: 'auto' },
      exploration: { maxRounds: 2 },
    })
  })

  it('routes blank-canvas global Ask without node or file scope', async () => {
    const workspace = createMockSampleWorkspace()
    const askAgent = vi.fn(async (): Promise<AgentAnswerResult> => ({
      id: 'answer-global',
      projectId: workspace.project.projectId,
      scope: { kind: 'global' },
      answer: 'This project is a graph-driven SaaS starter.',
      backend: 'model',
      modelProfileId: 'model-1',
      contextBundleHash: `sha256:${'e'.repeat(64)}`,
      contextSummary: {
        files: [],
        synopsisPresent: true,
        bundleHash: `sha256:${'e'.repeat(64)}`,
      },
      responseLanguage: { tag: 'und', source: 'undetermined', validation: 'not_checkable' },
      createdAt: '2026-07-19T00:00:00.000Z',
    }))
    useWorkbenchStore.setState({
      client: { askAgent } as unknown as ProjectOSApi,
      project: workspace.project,
      graph: workspace.graph,
      tree: workspace.semanticTree,
      selectedNodeId: 'feat_login',
      selectedFilePath: 'app/login/page.tsx',
      chatMode: 'change',
    })

    useWorkbenchStore.getState().openGlobalAgentChat()
    useWorkbenchStore.setState({ chatMode: 'ask' })
    expect(useWorkbenchStore.getState()).toMatchObject({
      globalAgentActive: true,
      selectedNodeId: null,
      selectedFilePath: null,
      chatMode: 'ask',
      rightPanelTab: 'chat',
      rightPanelOpen: true,
    })
    expect(canSubmitAgentPrompt(useWorkbenchStore.getState())).toBe(true)

    await useWorkbenchStore.getState().sendPrompt('What is this project?')

    expect(askAgent).toHaveBeenCalledWith({
      projectId: workspace.project.projectId,
      scope: { kind: 'global' },
      question: 'What is this project?',
      language: { mode: 'auto' },
      exploration: { maxRounds: 2 },
    })
    expect(useWorkbenchStore.getState().latestAskTrace).toMatchObject({
      status: 'complete',
      scope: { kind: 'global' },
    })
  })

  it('tracks Ask in Agent Flow without mutating run events or current work', async () => {
    let resolveAnswer!: (answer: AgentAnswerResult) => void
    const askAgent = vi.fn(() => new Promise<AgentAnswerResult>((resolve) => {
      resolveAnswer = resolve
    }))
    setReadyScope({ askAgent } as unknown as ProjectOSApi)
    const existingAction = {
      eventId: 'event-existing',
      runId: 'run-existing',
      timestamp: '2026-07-18T00:00:00.000Z',
      type: 'decision_summary' as const,
      payload: { summary: 'Existing run action' },
    }
    const existingCurrentWork = createMockSampleWorkspace().currentWork
    useWorkbenchStore.setState({
      flowActions: [existingAction],
      currentWork: existingCurrentWork,
      centerTab: 'function-map',
      agentFlowSubject: 'run',
      latestAskTrace: null,
    })

    const pending = useWorkbenchStore.getState().sendPrompt('What does this file do?')
    await vi.waitFor(() => expect(askAgent).toHaveBeenCalledOnce())

    expect(useChatSessionStore.getState().agentFlowOpen).toBe(true)
    expect(useWorkbenchStore.getState()).toMatchObject({
      centerTab: 'function-map',
      agentFlowSubject: 'ask',
      latestAskTrace: {
        status: 'running',
        scope: { kind: 'file', nodeId: 'feat_login', selectedFilePath: 'app/login/page.tsx' },
      },
    })
    expect(useWorkbenchStore.getState().flowActions).toEqual([existingAction])
    expect(useWorkbenchStore.getState().currentWork).toBe(existingCurrentWork)

    const answer: AgentAnswerResult = {
      id: 'answer-traced',
      projectId: 'sample-graph-saas',
      scope: { kind: 'file', nodeId: 'feat_login', selectedFilePath: 'app/login/page.tsx' },
      answer: 'The login page renders the sign-in form.',
      backend: 'model',
      modelProfileId: 'model-1',
      contextBundleHash: `sha256:${'c'.repeat(64)}`,
      contextSummary: {
        files: [],
        synopsisPresent: true,
        childrenCoverage: { totalCount: 0, includedCount: 0, omittedCount: 0 },
        bundleHash: `sha256:${'c'.repeat(64)}`,
      },
      responseLanguage: { tag: 'en', source: 'detected', validation: 'passed' },
      createdAt: '2026-07-18T00:00:00.000Z',
    }
    resolveAnswer(answer)
    await pending

    expect(useWorkbenchStore.getState().latestAskTrace).toEqual({
      status: 'complete',
      scope: answer.scope,
      result: answer,
    })
    expect(useWorkbenchStore.getState().flowActions).toEqual([existingAction])
    expect(useWorkbenchStore.getState().currentWork).toBe(existingCurrentWork)
    expect(JSON.stringify(useWorkbenchStore.getState().currentWork)).not.toContain('answer-traced')
  })

  it('routes Ask directly to askAgent and appends the answer without refinement', async () => {
    const askAgent = vi.fn(async () => ({
      id: 'answer-1',
      projectId: 'sample-graph-saas',
      scope: { kind: 'file', nodeId: 'feat_login', selectedFilePath: 'app/login/page.tsx' },
      answer: 'The login page renders the sign-in form.',
      backend: 'model' as const,
      modelProfileId: 'model-1',
      contextBundleHash: `sha256:${'a'.repeat(64)}`,
      contextSummary: {
        files: [],
        synopsisPresent: true,
        childrenCoverage: { totalCount: 0, includedCount: 0, omittedCount: 0 },
        bundleHash: `sha256:${'a'.repeat(64)}`,
      },
      responseLanguage: { tag: 'en', source: 'detected' as const, validation: 'passed' as const },
      createdAt: '2026-07-18T00:00:00.000Z',
    }))
    const refinePrompt = vi.fn()
    setReadyScope({ askAgent, refinePrompt } as unknown as ProjectOSApi)

    await useWorkbenchStore.getState().sendPrompt('What does this file do?')

    expect(askAgent).toHaveBeenCalledWith({
      projectId: useWorkbenchStore.getState().project!.projectId,
      scope: { kind: 'file', nodeId: 'feat_login', selectedFilePath: 'app/login/page.tsx' },
      question: 'What does this file do?',
      language: { mode: 'auto' },
      exploration: { maxRounds: 2 },
    })
    expect(refinePrompt).not.toHaveBeenCalled()
    expect(useWorkbenchStore.getState().messages).toMatchObject([
      { role: 'user', content: 'What does this file do?' },
      { id: 'answer-1', role: 'assistant', content: 'The login page renders the sign-in form.' },
    ])
    expect(useWorkbenchStore.getState().pendingRefinement).toBeNull()
  })

  it('attaches a subtle notice to a fail-open Ask answer', async () => {
    const askAgent = vi.fn(async (): Promise<AgentAnswerResult> => ({
      id: 'answer-language-mismatch',
      projectId: 'sample-graph-saas',
      scope: { kind: 'node', nodeId: 'feat_login' },
      answer: 'The retried answer remains in English.',
      backend: 'model',
      modelProfileId: 'model-1',
      contextBundleHash: `sha256:${'d'.repeat(64)}`,
      contextSummary: {
        files: [],
        synopsisPresent: true,
        childrenCoverage: { totalCount: 0, includedCount: 0, omittedCount: 0 },
        bundleHash: `sha256:${'d'.repeat(64)}`,
      },
      responseLanguage: {
        tag: 'zh',
        source: 'detected',
        validation: 'mismatch_after_retry',
      },
      createdAt: '2026-07-18T00:00:00.000Z',
    }))
    setReadyScope({ askAgent } as unknown as ProjectOSApi)
    useWorkbenchStore.setState({ selectedFilePath: null, locale: 'en' })

    await useWorkbenchStore.getState().sendPrompt('请回答这个问题')

    expect(useWorkbenchStore.getState().messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'The retried answer remains in English.',
      notice: 'The answer may not use the requested language. The model was retried once.',
    })
    expect(useWorkbenchStore.getState().latestAskTrace).toMatchObject({
      status: 'complete',
      result: {
        responseLanguage: { validation: 'mismatch_after_retry' },
      },
    })
  })

  it('keeps Change on the existing refinement path', async () => {
    const askAgent = vi.fn()
    const refinePrompt = vi.fn(async () => ({
      id: 'ref-1',
      understood: 'Change the login heading',
      ambiguities: [],
      suggestions: [],
      affectedNodeIds: ['feat_login'],
      affectedFiles: ['app/login/page.tsx'],
      confidence: 1,
      mode: 'model' as const,
    }))
    setReadyScope({ askAgent, refinePrompt } as unknown as ProjectOSApi, 'change')

    await useWorkbenchStore.getState().sendPrompt('Change the heading')

    expect(refinePrompt).toHaveBeenCalledOnce()
    expect(askAgent).not.toHaveBeenCalled()
    expect(useWorkbenchStore.getState().pendingRefinement?.id).toBe('ref-1')
  })

  it('starts an automatic Change without leaving a confirmation card', async () => {
    const run = {
      runId: 'run-automatic',
      projectId: 'sample-graph-saas',
      kind: 'feature_change' as const,
      status: 'running' as const,
      relatedNodeIds: ['feat_login'],
      relatedFiles: ['app/login/page.tsx'],
      startedAt: '2026-07-19T00:00:00.000Z',
    }
    const firstEvent: AgentRunEvent = {
      eventId: 'event-automatic',
      runId: run.runId,
      timestamp: run.startedAt,
      type: 'step_started',
      step: {
        id: 'step-context',
        label: 'Context prepared',
        kind: 'context_prepared',
        status: 'running',
        relatedNodeIds: ['feat_login'],
        relatedFiles: ['app/login/page.tsx'],
      },
    }
    const refinePrompt = vi.fn(async () => ({
      id: 'ref-automatic',
      understood: 'Change the login heading',
      ambiguities: [],
      suggestions: [],
      affectedNodeIds: ['feat_login'],
      affectedFiles: ['app/login/page.tsx'],
      confidence: 1,
      mode: 'model' as const,
      executionPolicy: 'automatic' as const,
    }))
    const confirmExecution = vi.fn(async () => run)
    const client = {
      refinePrompt,
      confirmExecution,
      getAgentRunEvents: vi.fn(async () => [firstEvent]),
      streamAgentRun: vi.fn(() => ({ dispose: vi.fn() })),
    } as unknown as ProjectOSApi
    setReadyScope(client, 'change')

    await useWorkbenchStore.getState().sendPrompt('Change the heading')

    expect(confirmExecution).toHaveBeenCalledWith('ref-automatic')
    expect(useChatSessionStore.getState().agentFlowOpen).toBe(true)
    expect(useWorkbenchStore.getState()).toMatchObject({
      pendingRefinement: null,
      activeRunId: 'run-automatic',
      agentFlowSubject: 'run',
    })
  })

  it('revises the original request without confirming or starting a run', async () => {
    const confirmExecution = vi.fn()
    const refinePrompt = vi.fn(async () => ({
      id: 'ref-revise',
      understood: 'Change the login heading',
      ambiguities: [],
      suggestions: ['Keep the heading level'],
      affectedNodeIds: ['feat_login'],
      affectedFiles: ['app/login/page.tsx'],
      confidence: 1,
      mode: 'model' as const,
    }))
    setReadyScope({ refinePrompt, confirmExecution } as unknown as ProjectOSApi, 'change')
    await useWorkbenchStore.getState().sendPrompt('Use a friendlier login heading')

    useWorkbenchStore.getState().reviseRefinement()

    expect(useWorkbenchStore.getState()).toMatchObject({
      composerDraft: emptyComposerDraft('Use a friendlier login heading'),
      pendingRefinement: null,
      refinementConfirmed: false,
      refineLoading: false,
      activeRunId: null,
    })
    expect(confirmExecution).not.toHaveBeenCalled()
  })

  it('submits node-scoped Ask without requiring a file owner', async () => {
    const askAgent = vi.fn(async () => ({
      id: 'answer-node',
      projectId: 'sample-graph-saas',
      scope: { kind: 'node' as const, nodeId: 'feat_login' },
      answer: 'This node owns the login experience.',
      backend: 'model' as const,
      modelProfileId: 'model-1',
      contextBundleHash: `sha256:${'b'.repeat(64)}`,
      contextSummary: {
        files: [],
        synopsisPresent: true,
        childrenCoverage: { totalCount: 0, includedCount: 0, omittedCount: 0 },
        bundleHash: `sha256:${'b'.repeat(64)}`,
      },
      responseLanguage: { tag: 'en', source: 'detected' as const, validation: 'passed' as const },
      createdAt: '2026-07-18T00:00:00.000Z',
    }))
    const workspace = createMockSampleWorkspace()
    useWorkbenchStore.setState({
      client: { askAgent } as unknown as ProjectOSApi,
      project: workspace.project,
      selectedNodeId: 'feat_login',
      selectedFilePath: null,
      pendingFileOwnerChoice: null,
      fileScopeError: null,
      chatMode: 'ask',
    })

    expect(canSubmitAgentPrompt(useWorkbenchStore.getState())).toBe(true)
    await useWorkbenchStore.getState().sendPrompt('Question')
    expect(askAgent).toHaveBeenCalledWith(expect.objectContaining({
      scope: { kind: 'node', nodeId: 'feat_login' },
    }))
  })

  it('allows node-scoped Change to enter the planner without inventing a file scope', async () => {
    const refinePrompt = vi.fn(async () => ({
      id: 'refinement-node-plan',
      understood: 'Change the node',
      ambiguities: [],
      suggestions: [],
      affectedNodeIds: ['feat_login'],
      affectedFiles: [],
      confidence: 1,
      mode: 'model' as const,
      executionPolicy: 'review_first' as const,
    }))
    const workspace = createMockSampleWorkspace()
    useWorkbenchStore.setState({
      client: { refinePrompt } as unknown as ProjectOSApi,
      project: workspace.project,
      selectedNodeId: 'feat_login',
      selectedFilePath: null,
      pendingFileOwnerChoice: null,
      fileScopeError: null,
      chatMode: 'change',
    })

    expect(canSubmitAgentPrompt(useWorkbenchStore.getState())).toBe(true)
    await useWorkbenchStore.getState().sendPrompt('Change it')
    expect(refinePrompt).toHaveBeenCalledWith(expect.objectContaining({
      nodeId: 'feat_login',
      filePath: undefined,
      rawPrompt: 'Change it',
    }))
  })

  it('allows global Plan and Agent(change) submit without a selected node', async () => {
    const createPlan = vi.fn(async () => ({
      version: '0.1.0' as const,
      id: 'plan-global',
      projectId: 'sample-graph-saas',
      scope: { kind: 'global' as const },
      objective: 'Plan the change',
      steps: [
        {
          id: 's1',
          description: 'Step',
          affectedFiles: [],
          acceptanceCriteria: ['done'],
        },
      ],
      todos: [],
      ambiguities: [],
      rationale: 'Global plan',
      status: 'ready' as const,
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    }))
    const refinePrompt = vi.fn(async () => ({
      id: 'refinement-global',
      understood: 'Change globally',
      ambiguities: [],
      suggestions: [],
      affectedNodeIds: [],
      affectedFiles: [],
      confidence: 1,
      mode: 'model' as const,
      executionPolicy: 'review_first' as const,
    }))
    const workspace = createMockSampleWorkspace()
    useWorkbenchStore.setState({
      client: { createPlan, refinePrompt } as unknown as ProjectOSApi,
      project: workspace.project,
      graph: workspace.graph,
      selectedNodeId: null,
      selectedFilePath: null,
      pendingFileOwnerChoice: null,
      fileScopeError: null,
      globalAgentActive: true,
      chatMode: 'plan',
    })
    expect(canSubmitAgentPrompt(useWorkbenchStore.getState())).toBe(true)
    await useWorkbenchStore.getState().sendPrompt('Design a multi-file auth refactor')
    expect(createPlan).toHaveBeenCalled()

    useWorkbenchStore.setState({ chatMode: 'change', pendingPlan: null })
    expect(canSubmitAgentPrompt(useWorkbenchStore.getState())).toBe(true)
    await useWorkbenchStore.getState().sendPrompt('Apply a small global improvement')
    expect(refinePrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        rawPrompt: 'Apply a small global improvement',
      }),
    )
  })

  it('turns an ambiguous backend owner response into an explicit chooser', async () => {
    const askAgent = vi.fn(async () => {
      throw new ProjectOSError('ownership_ambiguous', 'Choose an owner', {
        details: {
          selectedFilePath: 'app/login/page.tsx',
          candidateNodeIds: ['feat_login', 'feat_home'],
        },
      })
    })
    setReadyScope({ askAgent } as unknown as ProjectOSApi)

    await useWorkbenchStore.getState().sendPrompt('Question')

    expect(useWorkbenchStore.getState().selectedNodeId).toBeNull()
    expect(useWorkbenchStore.getState().pendingFileOwnerChoice).toEqual({
      filePath: 'app/login/page.tsx',
      candidateNodeIds: ['feat_login', 'feat_home'],
    })
    useWorkbenchStore.getState().chooseFileOwner('feat_home')
    expect(useWorkbenchStore.getState()).toMatchObject({
      selectedNodeId: 'feat_home',
      selectedFilePath: 'app/login/page.tsx',
      pendingFileOwnerChoice: null,
    })
  })

  it('turns an ambiguous Change confirmation into a chooser and discards the stale refinement', async () => {
    const confirmExecution = vi.fn(async () => {
      throw new ProjectOSError('ownership_ambiguous', 'Choose an owner', {
        details: {
          selectedFilePath: 'app/login/page.tsx',
          candidateNodeIds: ['feat_login', 'feat_home'],
        },
      })
    })
    setReadyScope({ confirmExecution } as unknown as ProjectOSApi, 'change')
    useWorkbenchStore.setState({
      pendingRefinement: {
        id: 'ref-ambiguous',
        understood: 'Change the page',
        ambiguities: [],
        suggestions: [],
        affectedNodeIds: [],
        affectedFiles: [],
        confidence: 1,
        mode: 'model',
      },
    })

    await useWorkbenchStore.getState().confirmRefinement()

    expect(useWorkbenchStore.getState()).toMatchObject({
      selectedNodeId: null,
      pendingRefinement: null,
      refinementConfirmed: false,
      pendingFileOwnerChoice: {
        filePath: 'app/login/page.tsx',
        candidateNodeIds: ['feat_login', 'feat_home'],
      },
    })
  })

  it('switches Agent Flow back to the run subject when Change is confirmed', async () => {
    const run = {
      runId: 'run-change',
      projectId: 'sample-graph-saas',
      kind: 'feature_change' as const,
      status: 'running' as const,
      relatedNodeIds: ['feat_login'],
      relatedFiles: ['app/login/page.tsx'],
      startedAt: '2026-07-18T00:00:00.000Z',
    }
    const firstEvent: AgentRunEvent = {
      eventId: 'event-change',
      runId: run.runId,
      timestamp: run.startedAt,
      type: 'step_started',
      step: {
        id: 'step-understand',
        label: 'Understand',
        kind: 'understand',
        status: 'running',
        inputSummary: 'Change the page',
        relatedNodeIds: ['feat_login'],
        relatedFiles: ['app/login/page.tsx'],
      },
    }
    const transientTrace: AgentTransientTrace = {
      traceId: 'trace-change',
      runId: run.runId,
      timestamp: run.startedAt,
      type: 'provider_reasoning',
      phaseId: 'step-understand',
      content: 'Redacted provider trace',
      source: 'provider_supplied',
      truncated: false,
    }
    const client = {
      confirmExecution: vi.fn(async () => run),
      getAgentRunEvents: vi.fn(async () => [firstEvent]),
      streamAgentRun: vi.fn((_runId, _eventCallback, traceCallback) => {
        traceCallback?.(transientTrace)
        return { dispose: vi.fn() }
      }),
    } as unknown as ProjectOSApi
    setReadyScope(client, 'change')
    useWorkbenchStore.setState({
      agentFlowSubject: 'ask',
      latestAskTrace: {
        status: 'running',
        scope: { kind: 'file', nodeId: 'feat_login', selectedFilePath: 'app/login/page.tsx' },
      },
      pendingRefinement: {
        id: 'ref-change',
        understood: 'Change the page',
        ambiguities: [],
        suggestions: [],
        affectedNodeIds: ['feat_login'],
        affectedFiles: ['app/login/page.tsx'],
        confidence: 1,
        mode: 'model',
      },
    })

    await useWorkbenchStore.getState().confirmRefinement()

    expect(useWorkbenchStore.getState()).toMatchObject({
      agentFlowSubject: 'run',
      activeRunId: 'run-change',
      flowStatus: 'running',
      flowTransientTraces: [transientTrace],
    })
  })

  it('subscribes recursively to every delegated run in a deep agent hierarchy', async () => {
    const startedAt = '2026-07-18T00:00:00.000Z'
    const rootRun: AgentRun = {
      runId: 'run-global',
      projectId: 'sample-graph-saas',
      kind: 'feature_change',
      status: 'running',
      relatedNodeIds: [],
      relatedFiles: [],
      scope: { kind: 'global' },
      role: 'global',
      startedAt,
    }
    const runs: Record<string, AgentRun> = {
      'run-context': plannerRun('run-context', 'run-global', 'run-global', 'context_product', 'context', 'context_planner'),
      'run-container': plannerRun('run-container', 'run-context', 'run-global', 'container_web', 'container', 'container_planner'),
      'run-component': plannerRun('run-component', 'run-container', 'run-global', 'component_login', 'component', 'node_planner'),
      'run-leaf': {
        runId: 'run-leaf',
        projectId: 'sample-graph-saas',
        kind: 'feature_change',
        status: 'running',
        relatedNodeIds: ['component_login'],
        relatedFiles: ['app/login/page.tsx'],
        scope: { kind: 'leaf-file', nodeId: 'component_login', filePath: 'app/login/page.tsx' },
        parentRunId: 'run-component',
        rootRunId: 'run-global',
        role: 'leaf_file_editor',
        startedAt,
      },
    }
    const rootStep: AgentRunEvent = {
      eventId: 'root_step',
      runId: rootRun.runId,
      timestamp: startedAt,
      type: 'step_started',
      step: {
        id: 'root_plan',
        label: 'Plan delegation',
        kind: 'plan_delegation',
        status: 'running',
        relatedNodeIds: [],
        relatedFiles: [],
      },
    }
    const rootDelegation = plannerDelegation('run-global', 'run-context', 'task-context', 'context_product', 'context')
    const nestedEvents: Record<string, AgentRunEvent[]> = {
      'run-context': [plannerDelegation('run-context', 'run-container', 'task-container', 'container_web', 'container')],
      'run-container': [plannerDelegation('run-container', 'run-component', 'task-component', 'component_login', 'component')],
      'run-component': [leafDelegation('run-component', 'run-leaf', 'task-leaf', 'component_login', 'app/login/page.tsx')],
      'run-leaf': [{
        eventId: 'leaf_step',
        runId: 'run-leaf',
        timestamp: startedAt,
        type: 'step_started',
        step: {
          id: 'leaf_context',
          label: 'Context prepared',
          kind: 'context_prepared',
          status: 'running',
          relatedNodeIds: ['component_login'],
          relatedFiles: ['app/login/page.tsx'],
        },
      }],
    }
    const streamAgentRun = vi.fn((
      runId: string,
      eventCallback: (event: AgentRunEvent) => void,
    ) => {
      for (const event of nestedEvents[runId] ?? []) eventCallback(event)
      return { dispose: vi.fn() }
    })
    const client = {
      confirmExecution: vi.fn(async () => rootRun),
      getAgentRunEvents: vi.fn(async () => [rootStep, rootDelegation]),
      getAgentRun: vi.fn(async (runId: string) => runs[runId]),
      streamAgentRun,
    } as unknown as ProjectOSApi
    setReadyScope(client, 'change')
    useWorkbenchStore.setState({
      pendingRefinement: {
        id: 'ref-hierarchy',
        understood: 'Change the login page',
        ambiguities: [],
        suggestions: [],
        affectedNodeIds: ['component_login'],
        affectedFiles: ['app/login/page.tsx'],
        confidence: 1,
        mode: 'model',
      },
    })

    await useWorkbenchStore.getState().confirmRefinement()
    await vi.waitFor(() => {
      expect(Object.keys(useWorkbenchStore.getState().delegatedRunTraces)).toHaveLength(4)
    })

    expect(streamAgentRun.mock.calls.map(([runId]) => runId)).toEqual([
      'run-global',
      'run-context',
      'run-container',
      'run-component',
      'run-leaf',
    ])
    expect(useWorkbenchStore.getState().delegatedRunTraces).toMatchObject({
      'run-context': { parentRunId: 'run-global', rootRunId: 'run-global', scopeKind: 'context', role: 'context_planner' },
      'run-container': { parentRunId: 'run-context', rootRunId: 'run-global', scopeKind: 'container', role: 'container_planner' },
      'run-component': { parentRunId: 'run-container', rootRunId: 'run-global', scopeKind: 'component', role: 'node_planner' },
      'run-leaf': { parentRunId: 'run-component', rootRunId: 'run-global', scopeKind: 'leaf-file', role: 'leaf_file_editor' },
    })
    useWorkbenchStore.getState().runDisposable?.dispose()
  })

  it('disables the scope when the backend reports no owner', async () => {
    const askAgent = vi.fn(async () => {
      throw new ProjectOSError('file_owner_not_found', 'No owner')
    })
    setReadyScope({ askAgent } as unknown as ProjectOSApi)

    await useWorkbenchStore.getState().sendPrompt('Question')

    expect(useWorkbenchStore.getState()).toMatchObject({
      selectedNodeId: null,
      fileScopeError: 'not_mapped',
      pendingFileOwnerChoice: null,
    })
    expect(canSubmitAgentPrompt(useWorkbenchStore.getState())).toBe(false)
  })

  it('persists a sanitized system message when Ask fails', async () => {
    const askAgent = vi.fn(async () => {
      throw new ProjectOSError('agent_answer_unavailable', 'Provider rejected apiKey=secret-token')
    })
    setReadyScope({ askAgent } as unknown as ProjectOSApi)

    await useWorkbenchStore.getState().sendPrompt('Question')

    const failure = useWorkbenchStore.getState().messages.at(-1)
    expect(failure).toMatchObject({ role: 'system' })
    expect(failure?.content).toContain('Ask failed')
    expect(failure?.content).toContain('apiKey=[redacted]')
    expect(failure?.content).not.toContain('secret-token')
    expect(useWorkbenchStore.getState().latestAskTrace).toMatchObject({
      status: 'error',
      scope: { kind: 'file', nodeId: 'feat_login', selectedFilePath: 'app/login/page.tsx' },
      message: expect.stringContaining('apiKey=[redacted]'),
    })
    expect(JSON.stringify(useWorkbenchStore.getState().latestAskTrace)).not.toContain('secret-token')
  })

  it('clears the transient Ask trace when loading and resetting a workspace', async () => {
    useWorkbenchStore.setState({
      client: originalClient,
      latestAskTrace: {
        status: 'running',
        scope: { kind: 'node', nodeId: 'feat_login' },
      },
      agentFlowSubject: 'ask',
    })

    await useWorkbenchStore.getState().openSampleWorkspace()
    expect(useWorkbenchStore.getState()).toMatchObject({
      latestAskTrace: null,
      agentFlowSubject: 'run',
    })

    useWorkbenchStore.setState({
      latestAskTrace: {
        status: 'running',
        scope: { kind: 'node', nodeId: 'feat_login' },
      },
      agentFlowSubject: 'ask',
    })
    await useWorkbenchStore.getState().resetDemo()
    expect(useWorkbenchStore.getState()).toMatchObject({
      latestAskTrace: null,
      agentFlowSubject: 'run',
    })
  })

  it('routes Plan to createPlan and shows a pending plan card', async () => {
    const createPlan = vi.fn(async () => ({
      version: '0.1.0' as const,
      id: 'plan_1',
      projectId: 'sample-graph-saas',
      scope: {
        kind: 'file' as const,
        nodeId: 'feat_login',
        selectedFilePath: 'app/login/page.tsx',
      },
      objective: 'Add plan mode',
      steps: [],
      todos: [],
      ambiguities: [],
      rationale: 'Because',
      status: 'ready' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }))
    setReadyScope({ createPlan } as unknown as ProjectOSApi, 'plan')

    await useWorkbenchStore.getState().sendPrompt('Plan this feature')

    expect(createPlan).toHaveBeenCalledOnce()
    expect(useWorkbenchStore.getState().pendingPlan?.id).toBe('plan_1')
    expect(useWorkbenchStore.getState().agentFlowSubject).toBe('plan')
  })

  it('builds a plan into the Change refinement path', async () => {
    const buildPlan = vi.fn(async () => ({
      id: 'ref-plan',
      understood: 'Built from plan',
      ambiguities: [],
      suggestions: [],
      affectedNodeIds: ['feat_login'],
      affectedFiles: ['app/login/page.tsx'],
      confidence: 1,
      mode: 'model' as const,
      sourcePlanId: 'plan_1',
      executionPolicy: 'review_first' as const,
    }))
    useWorkbenchStore.setState({
      client: { buildPlan } as unknown as ProjectOSApi,
      pendingPlan: {
        version: '0.1.0',
        id: 'plan_1',
        projectId: 'sample-graph-saas',
        scope: {
          kind: 'file',
          nodeId: 'feat_login',
          selectedFilePath: 'app/login/page.tsx',
        },
        objective: 'Plan this',
        steps: [
          {
            id: 'step_1',
            description: 'Update login',
            affectedFiles: ['app/login/page.tsx'],
            acceptanceCriteria: ['Login works'],
          },
        ],
        todos: [],
        ambiguities: [],
        rationale: 'Because',
        status: 'ready',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    })

    await useWorkbenchStore.getState().confirmPlanBuild()

    expect(buildPlan).toHaveBeenCalledWith('plan_1')
    expect(useWorkbenchStore.getState().pendingRefinement?.id).toBe('ref-plan')
    expect(useWorkbenchStore.getState().chatMode).toBe('change')
    expect(useWorkbenchStore.getState().refinementConfirmed).toBe(true)
  })

  it('starts a debug session from Debug mode', async () => {
    const startDebugSession = vi.fn(async () => ({
      version: '0.1.0' as const,
      sessionId: 'debug_1',
      projectId: 'sample-graph-saas',
      scope: { kind: 'node' as const, nodeId: 'feat_login' },
      bugDescription: 'Auth callback failed',
      reproSteps: ['Reproduce'],
      hypotheses: [],
      instrumentation: [],
      logEntries: [],
      phase: 'hypothesize' as const,
      verification: { status: 'not_run' as const },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }))
    useWorkbenchStore.setState({
      client: { startDebugSession } as unknown as ProjectOSApi,
      project: createMockSampleWorkspace().project,
      selectedNodeId: 'feat_login',
      selectedFilePath: null,
      pendingFileOwnerChoice: null,
      fileScopeError: null,
      chatMode: 'debug',
      globalAgentActive: false,
    })

    await useWorkbenchStore.getState().sendPrompt('Auth callback failed')

    expect(startDebugSession).toHaveBeenCalledOnce()
    expect(useWorkbenchStore.getState().debugSession?.sessionId).toBe('debug_1')
    expect(useWorkbenchStore.getState().agentFlowSubject).toBe('debug')
  })
})

function plannerRun(
  runId: string,
  parentRunId: string,
  rootRunId: string,
  nodeId: string,
  kind: 'context' | 'container' | 'component',
  role: 'context_planner' | 'container_planner' | 'node_planner',
): AgentRun {
  return {
    runId,
    projectId: 'sample-graph-saas',
    kind: 'feature_change',
    status: 'running',
    relatedNodeIds: [nodeId],
    relatedFiles: [],
    scope: { kind, nodeId },
    parentRunId,
    rootRunId,
    role,
    startedAt: '2026-07-18T00:00:00.000Z',
  }
}

function plannerDelegation(
  runId: string,
  childRunId: string,
  taskId: string,
  nodeId: string,
  level: 'context' | 'container' | 'component',
): AgentRunEvent {
  return {
    eventId: `${runId}_${taskId}`,
    runId,
    timestamp: '2026-07-18T00:00:00.000Z',
    type: 'task_delegated',
    payload: {
      planId: `${runId}_plan`,
      taskId,
      childRunId,
      targetKind: 'planner',
      nodeId,
      level,
    },
  }
}

function leafDelegation(
  runId: string,
  childRunId: string,
  taskId: string,
  nodeId: string,
  filePath: string,
): AgentRunEvent {
  return {
    eventId: `${runId}_${taskId}`,
    runId,
    timestamp: '2026-07-18T00:00:00.000Z',
    type: 'task_delegated',
    payload: {
      planId: `${runId}_plan`,
      taskId,
      childRunId,
      targetKind: 'leaf-file',
      nodeId,
      filePath,
    },
  }
}
