import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  AgentRun,
  AgentRunEvent,
  ContextPayload,
  MapArtifact,
  ProjectOSApi,
} from '@contracts/index'
import { createMockSampleWorkspace } from '../../../client/mock-project-os-api-client.js'
import { RealProjectOSApiClient } from '../../../client/real-project-os-api-client.js'
import { IpcTransport } from '../../../client/transport/IpcTransport.js'
import { useWorkbenchStore } from './workbenchStore'

const originalClient = useWorkbenchStore.getState().client

afterEach(() => {
  useWorkbenchStore.getState().runDisposable?.dispose()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  useWorkbenchStore.setState({
    client: originalClient,
    project: null,
    graph: null,
    tree: null,
    context: null,
    contextLoading: false,
    error: null,
    selectedNodeId: null,
    selectedFilePath: null,
    editorBuffers: {},
    activeRunId: null,
    runDisposable: null,
    flowSteps: [],
    flowActions: [],
    flowDelegationEvents: [],
    flowCorrections: [],
    flowStatus: 'idle',
    generatedDiff: null,
    currentWork: null,
    toasts: [],
    mapContent: null,
    settings: null,
  })
})

describe('selection request ordering', () => {
  it('keeps the newest node context when older work resolves last and clears a prior error', async () => {
    const workspace = createMockSampleWorkspace()
    const login = deferred<ContextPayload>()
    const dashboard = deferred<ContextPayload>()
    const client = {
      getNodeContext: vi.fn((_projectId: string, nodeId: string) =>
        nodeId === 'feat_login' ? login.promise : dashboard.promise),
    } as unknown as ProjectOSApi
    setWorkspace(client)
    useWorkbenchStore.setState({ error: 'Old selection failed' })

    const older = useWorkbenchStore.getState().selectNode('feat_login')
    const newer = useWorkbenchStore.getState().selectNode('feat_dashboard')
    dashboard.resolve(contextFor('Dashboard', { nodeId: 'feat_dashboard' }))
    await newer
    login.resolve(contextFor('Login', { nodeId: 'feat_login' }))
    await older

    expect(useWorkbenchStore.getState()).toMatchObject({
      selectedNodeId: 'feat_dashboard',
      context: { nodeId: 'feat_dashboard', title: 'Dashboard' },
      contextLoading: false,
      error: null,
    })
    expect(useWorkbenchStore.getState().project?.projectId).toBe(workspace.project.projectId)
  })

  it('keeps the newest file context when file selections resolve out of order', async () => {
    const login = deferred<ContextPayload>()
    const dashboard = deferred<ContextPayload>()
    const client = {
      getFileContext: vi.fn((_projectId: string, filePath: string) =>
        filePath === 'app/login/page.tsx' ? login.promise : dashboard.promise),
    } as unknown as ProjectOSApi
    setWorkspace(client)

    const older = useWorkbenchStore.getState().selectFile(
      'app/login/page.tsx',
      'feat_login',
    )
    const newer = useWorkbenchStore.getState().selectFile(
      'app/dashboard/page.tsx',
      'feat_dashboard',
    )
    dashboard.resolve(contextFor('Dashboard file', {
      nodeId: 'feat_dashboard',
      filePath: 'app/dashboard/page.tsx',
    }))
    await newer
    login.resolve(contextFor('Login file', {
      nodeId: 'feat_login',
      filePath: 'app/login/page.tsx',
    }))
    await older

    expect(useWorkbenchStore.getState()).toMatchObject({
      selectedNodeId: 'feat_dashboard',
      selectedFilePath: 'app/dashboard/page.tsx',
      context: {
        nodeId: 'feat_dashboard',
        filePath: 'app/dashboard/page.tsx',
      },
      contextLoading: false,
    })
  })

  it('does not seed a real-workspace editor with sample fixture content', async () => {
    vi.stubGlobal('window', { projectOS: {} })
    const content = deferred<string>()
    const client = {
      getFileContext: vi.fn(async () => contextFor('Real file', {
        nodeId: 'feat_login',
        filePath: 'app/login/page.tsx',
      })),
      getFileContent: vi.fn(() => content.promise),
    } as unknown as ProjectOSApi
    setWorkspace(client)

    const selection = useWorkbenchStore.getState().selectFile(
      'app/login/page.tsx',
      'feat_login',
    )
    expect(useWorkbenchStore.getState().editorBuffers['app/login/page.tsx'])
      .toBeUndefined()

    content.resolve('export default function RealLogin() { return null }\n')
    await selection

    expect(useWorkbenchStore.getState().editorBuffers['app/login/page.tsx'])
      .toBe('export default function RealLogin() { return null }\n')
  })
})

describe('run event polling fallback', () => {
  it('replays missing events through the streamed-event side effects', async () => {
    const workspace = createMockSampleWorkspace()
    const run = runFixture('run-poll-recovery')
    const events: AgentRunEvent[] = [
      stepStarted(run.runId),
      {
        eventId: 'evt_poll_diff',
        runId: run.runId,
        timestamp: run.startedAt,
        type: 'diff_ready',
        payload: { files: ['app/login/page.tsx'] },
      },
      {
        eventId: 'evt_poll_apply',
        runId: run.runId,
        timestamp: run.startedAt,
        type: 'apply_result',
        payload: {
          filesWritten: ['app/login/page.tsx'],
          outcome: 'applied',
          backupId: 'backup-poll',
        },
      },
      {
        eventId: 'evt_poll_complete',
        runId: run.runId,
        timestamp: run.startedAt,
        type: 'run_completed',
      },
    ]
    const getDiff = vi.fn(async () => ({
      runId: run.runId,
      summary: 'Recovered diff',
      files: [],
    }))
    const getCurrentWork = vi.fn(async () => workspace.currentWork)
    const getProjectGraph = vi.fn(async () => workspace.graph)
    const getSemanticTree = vi.fn(async () => workspace.semanticTree)
    const client = {
      confirmExecution: vi.fn(async () => run),
      streamAgentRun: vi.fn(() => ({ dispose: vi.fn() })),
      getAgentRunEvents: vi.fn(async () => events),
      getDiff,
      getCurrentWork,
      getProjectGraph,
      getSemanticTree,
    } as unknown as ProjectOSApi
    setWorkspace(client)
    useWorkbenchStore.setState({ pendingRefinement: refinementFixture() })

    await useWorkbenchStore.getState().confirmRefinement()

    await vi.waitFor(() => {
      expect(getDiff).toHaveBeenCalledWith(run.runId)
      expect(getCurrentWork).toHaveBeenCalledWith(workspace.project.projectId)
      expect(getProjectGraph).toHaveBeenCalledWith(workspace.project.projectId)
      expect(getSemanticTree).toHaveBeenCalledWith(workspace.project.projectId)
      expect(useWorkbenchStore.getState().generatedDiff?.runId).toBe(run.runId)
      expect(useWorkbenchStore.getState().currentWork).toEqual(workspace.currentWork)
      expect(useWorkbenchStore.getState().flowStatus).toBe('complete')
    })
    expect(useWorkbenchStore.getState().toasts.map((toast) => toast.type)).toEqual(
      expect.arrayContaining(['success', 'info']),
    )
  })

  it('surfaces a step failure recovered only by polling', async () => {
    const run = runFixture('run-poll-failure')
    const client = {
      confirmExecution: vi.fn(async () => run),
      streamAgentRun: vi.fn(() => ({ dispose: vi.fn() })),
      getAgentRunEvents: vi.fn(async () => [
        stepStarted(run.runId),
        {
          eventId: 'evt_poll_failed',
          runId: run.runId,
          timestamp: run.startedAt,
          type: 'step_failed',
          payload: { message: 'Recovered failure' },
        } satisfies AgentRunEvent,
      ]),
    } as unknown as ProjectOSApi
    setWorkspace(client)
    useWorkbenchStore.setState({ pendingRefinement: refinementFixture() })

    await useWorkbenchStore.getState().confirmRefinement()

    expect(useWorkbenchStore.getState().flowStatus).toBe('error')
    expect(useWorkbenchStore.getState().toasts).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'error', message: 'Recovered failure' })]),
    )
  })
})

describe('active run result binding', () => {
  it('does not install a diff that resolves after the active run changed', async () => {
    const oldDiff = deferred<{ runId: string; summary: string; files: [] }>()
    const client = {
      getDiff: vi.fn(() => oldDiff.promise),
    } as unknown as ProjectOSApi
    setWorkspace(client)
    useWorkbenchStore.setState({ activeRunId: 'run-old', generatedDiff: null })

    const pending = useWorkbenchStore.getState().loadDiff()
    useWorkbenchStore.setState({ activeRunId: 'run-new' })
    oldDiff.resolve({ runId: 'run-old', summary: 'Stale diff', files: [] })
    await pending

    expect(useWorkbenchStore.getState().activeRunId).toBe('run-new')
    expect(useWorkbenchStore.getState().generatedDiff).toBeNull()
  })
})

describe('map artifact update concurrency', () => {
  it('merges overlapping responses into the latest map content', async () => {
    const first = noteArtifact('artifact-a', 0)
    const second = noteArtifact('artifact-b', 10)
    const firstResponse = deferred<MapArtifact>()
    const secondResponse = deferred<MapArtifact>()
    const client = {
      updateMapArtifact: vi.fn((_projectId: string, artifactId: string) =>
        artifactId === first.id ? firstResponse.promise : secondResponse.promise),
    } as unknown as ProjectOSApi
    setWorkspace(client)
    useWorkbenchStore.setState({
      mapContent: {
        version: '0.2.0',
        projectId: useWorkbenchStore.getState().project!.projectId,
        artifacts: [first, second],
        workGroups: [],
        workGroupSeq: 0,
      },
    })

    const updateFirst = useWorkbenchStore.getState().updateMapArtifact(first.id, {
      position: { x: 100, y: 100 },
    })
    const updateSecond = useWorkbenchStore.getState().updateMapArtifact(second.id, {
      position: { x: 200, y: 200 },
    })
    secondResponse.resolve({ ...second, position: { x: 200, y: 200 } })
    await updateSecond
    firstResponse.resolve({ ...first, position: { x: 100, y: 100 } })
    await updateFirst

    expect(useWorkbenchStore.getState().mapContent?.artifacts).toEqual([
      expect.objectContaining({ id: first.id, position: { x: 100, y: 100 } }),
      expect.objectContaining({ id: second.id, position: { x: 200, y: 200 } }),
    ])
  })
})

describe('IPC invoke deadline', () => {
  it('rejects a hung request and lets selection clear its loading flag', async () => {
    vi.stubGlobal('window', {
      projectOS: {
        invoke: vi.fn(() => new Promise<never>(() => undefined)),
      },
    })
    const client = new RealProjectOSApiClient({
      transport: new IpcTransport(10),
    })
    setWorkspace(client)

    await useWorkbenchStore.getState().selectNode('feat_login')

    expect(useWorkbenchStore.getState().contextLoading).toBe(false)
    expect(useWorkbenchStore.getState().error).toContain('timed out')
  })
})

function setWorkspace(client: ProjectOSApi): void {
  const workspace = createMockSampleWorkspace()
  useWorkbenchStore.setState({
    client,
    project: workspace.project,
    graph: workspace.graph,
    tree: workspace.semanticTree,
    context: null,
    contextLoading: false,
    error: null,
    locale: 'en',
    selectedNodeId: null,
    selectedFilePath: null,
    editorBuffers: {},
    activeRunId: null,
    runDisposable: null,
    flowSteps: [],
    flowActions: [],
    flowDelegationEvents: [],
    flowCorrections: [],
    flowStatus: 'idle',
    generatedDiff: null,
    currentWork: null,
    toasts: [],
    mapContent: workspace.mapContent,
    settings: workspace.settings,
  })
}

function contextFor(
  title: string,
  identity: { nodeId: string; filePath?: string },
): ContextPayload {
  return {
    scope: identity.filePath ? 'file' : 'feature',
    projectId: createMockSampleWorkspace().project.projectId,
    nodeId: identity.nodeId,
    ...(identity.filePath ? { filePath: identity.filePath } : {}),
    title,
    summary: title,
    linkedFiles: [],
    upstream: [],
    downstream: [],
    recentChanges: [],
    rawContextMarkdown: title,
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function runFixture(runId: string): AgentRun {
  return {
    runId,
    projectId: createMockSampleWorkspace().project.projectId,
    kind: 'feature_change',
    status: 'running',
    relatedNodeIds: ['feat_login'],
    relatedFiles: ['app/login/page.tsx'],
    startedAt: '2026-07-21T00:00:00.000Z',
  }
}

function stepStarted(runId: string): AgentRunEvent {
  return {
    eventId: `${runId}_step`,
    runId,
    timestamp: '2026-07-21T00:00:00.000Z',
    type: 'step_started',
    step: {
      id: `${runId}_understand`,
      label: 'Understand',
      kind: 'understand',
      status: 'running',
      relatedNodeIds: ['feat_login'],
      relatedFiles: ['app/login/page.tsx'],
    },
  }
}

function refinementFixture() {
  return {
    id: 'ref-poll',
    understood: 'Change the login page',
    ambiguities: [],
    suggestions: [],
    affectedNodeIds: ['feat_login'],
    affectedFiles: ['app/login/page.tsx'],
    confidence: 1,
    mode: 'model' as const,
  }
}

function noteArtifact(id: string, x: number): MapArtifact {
  return {
    id,
    type: 'note',
    scope: 'project',
    position: { x, y: 0 },
    size: { width: 280, height: 160 },
    note: { document: { type: 'doc', content: [{ type: 'paragraph' }] } },
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
  }
}
