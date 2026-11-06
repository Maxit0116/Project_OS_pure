import { afterEach, describe, expect, it, vi } from 'vitest'

import { getStoreMessage } from '../i18n/storeMessages'

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

describe('structure rescan failure', () => {
  it('keeps the map and composer and does not toast success when analysis fails', async () => {
    const draft = {
      ...useWorkbenchStore.getState().composerDraft,
      text: 'Keep this prompt while the scan fails',
    }
    const client = {
      analyzeWorkspace: vi.fn(async () => {
        throw Object.assign(new Error('Model provider request failed (HTTP 503)'), {
          code: 'model_connection_failed',
        })
      }),
      getSemanticTree: vi.fn(),
    } as unknown as ProjectOSApi
    setWorkspace(client)
    const graphBefore = useWorkbenchStore.getState().graph
    useWorkbenchStore.setState({
      composerDraft: draft,
      messages: [{
        id: 'msg_keep',
        role: 'user',
        content: 'Keep this prompt while the scan fails',
        timestamp: '2026-11-06T00:00:00.000Z',
      }],
    })

    await useWorkbenchStore.getState().rescanStructureGraph()

    const state = useWorkbenchStore.getState()
    expect(client.analyzeWorkspace).toHaveBeenCalledOnce()
    expect(client.getSemanticTree).not.toHaveBeenCalled()
    expect(state.structureRescanLoading).toBe(false)
    expect(state.graph).toEqual(graphBefore)
    expect(state.composerDraft).toEqual(draft)
    expect(state.messages.map((message) => message.content)).toEqual([
      'Keep this prompt while the scan fails',
    ])
    expect(state.error).toContain('kept the current map')
    expect(state.error).toContain('HTTP 503')
    expect(state.toasts.some((toast) => toast.type === 'success')).toBe(false)
    expect(state.toasts.some((toast) => toast.type === 'warning' && toast.message.includes('HTTP 503'))).toBe(true)
  })

  it('keeps edits made while a scan is pending when that scan fails', async () => {
    const scan = deferred<never>()
    const client = {
      analyzeWorkspace: vi.fn(() => scan.promise),
      getSemanticTree: vi.fn(),
    } as unknown as ProjectOSApi
    setWorkspace(client)
    const graphBefore = useWorkbenchStore.getState().graph
    const context = contextFor('Kept context', { nodeId: 'feat_login' })
    useWorkbenchStore.setState({ context })
    const pending = useWorkbenchStore.getState().rescanStructureGraph()
    expect(useWorkbenchStore.getState().structureRescanLoading).toBe(true)

    const draft = {
      ...useWorkbenchStore.getState().composerDraft,
      text: 'Edited while the scan is still running',
    }
    useWorkbenchStore.setState({
      composerDraft: draft,
      messages: [{
        id: 'msg_newer',
        role: 'user',
        content: 'Sent while the scan is still running',
        timestamp: '2026-11-06T00:00:01.000Z',
      }],
    })
    scan.reject(new Error('Model provider request failed (HTTP 503)'))
    await pending

    const state = useWorkbenchStore.getState()
    expect(state.structureRescanLoading).toBe(false)
    expect(state.graph).toEqual(graphBefore)
    expect(state.context).toEqual(context)
    expect(state.composerDraft).toEqual(draft)
    expect(state.messages.map((message) => message.content)).toEqual([
      'Sent while the scan is still running',
    ])
    expect(state.error).toBe(getStoreMessage('en', 'map.rescanStructureFailed', {
      detail: 'Model provider request failed (HTTP 503)',
    }))
    expect(state.toasts.some((toast) => toast.type === 'success')).toBe(false)
    expect(client.getSemanticTree).not.toHaveBeenCalled()
  })

  it('adopts the scanned graph when only the tree refresh fails', async () => {
    const workspace = createMockSampleWorkspace()
    const scannedGraph = {
      ...workspace.graph,
      projectName: 'Scanned project',
    }
    const tree = deferred<typeof workspace.semanticTree>()
    const client = {
      analyzeWorkspace: vi.fn(async () => scannedGraph),
      getSemanticTree: vi.fn(() => tree.promise),
    } as unknown as ProjectOSApi
    setWorkspace(client)
    const treeBefore = useWorkbenchStore.getState().tree
    const draft = {
      ...useWorkbenchStore.getState().composerDraft,
      text: 'Keep this draft when the tree refresh fails',
    }
    useWorkbenchStore.setState({ composerDraft: draft })
    const pending = useWorkbenchStore.getState().rescanStructureGraph()
    tree.reject(new Error('semantic tree read failed'))
    await pending

    const state = useWorkbenchStore.getState()
    expect(client.analyzeWorkspace).toHaveBeenCalledOnce()
    expect(client.getSemanticTree).toHaveBeenCalledOnce()
    expect(state.graph).toEqual(scannedGraph)
    expect(state.tree).toBe(treeBefore)
    expect(state.composerDraft).toEqual(draft)
    expect(state.structureRescanLoading).toBe(false)
    expect(state.error).toBe(getStoreMessage('en', 'map.rescanTreeRefreshFailed', {
      detail: 'semantic tree read failed',
    }))
    expect(state.error).not.toContain('kept the current map')
    expect(state.toasts.some((toast) => toast.type === 'success')).toBe(false)
    expect(state.toasts.some((toast) => toast.type === 'warning')).toBe(true)
  })

  it('drops a late scan result after the workspace changes', async () => {
    const workspace = createMockSampleWorkspace()
    const other = createMockSampleWorkspace()
    const otherProject = {
      ...other.project,
      projectId: 'proj_other_workspace',
      displayName: 'Other workspace',
    }
    const scan = deferred<typeof workspace.graph>()
    const scanTree = vi.fn()
    const client = {
      analyzeWorkspace: vi.fn(() => scan.promise),
      getSemanticTree: vi.fn(async (projectId: string) => {
        if (projectId === otherProject.projectId) return other.semanticTree
        return scanTree()
      }),
      openWorkspace: vi.fn(async () => otherProject),
      getProjectGraph: vi.fn(async () => other.graph),
      getMapContent: vi.fn(async () => other.mapContent),
      getCurrentWork: vi.fn(async () => other.currentWork),
      getProjectDescription: vi.fn(async () => other.projectDescription),
      getSettings: vi.fn(async () => other.settings),
      getChatSessionIndex: vi.fn(async () => {
        throw new Error('sessions unavailable')
      }),
    } as unknown as ProjectOSApi
    setWorkspace(client)
    useWorkbenchStore.setState({
      composerDraft: {
        ...useWorkbenchStore.getState().composerDraft,
        text: 'Draft in the first workspace',
      },
    })
    const pending = useWorkbenchStore.getState().rescanStructureGraph()
    await useWorkbenchStore.getState().openWorkspace('/other')
    const afterOpen = useWorkbenchStore.getState()
    const poison = { ...workspace.graph, projectName: 'Must not land' }
    scan.resolve(poison)
    await pending

    const state = useWorkbenchStore.getState()
    expect(state.project?.projectId).toBe('proj_other_workspace')
    expect(state.graph).toEqual(afterOpen.graph)
    expect(state.tree).toEqual(afterOpen.tree)
    expect(state.composerDraft).toEqual(afterOpen.composerDraft)
    expect(state.messages).toEqual(afterOpen.messages)
    expect(state.context).toEqual(afterOpen.context)
    expect(state.structureRescanLoading).toBe(false)
    expect(state.error).toBe(afterOpen.error)
    expect(state.toasts.filter((toast) => toast.type === 'success')).toEqual(
      afterOpen.toasts.filter((toast) => toast.type === 'success'),
    )
    expect(state.toasts.filter((toast) => toast.type === 'warning')).toEqual(
      afterOpen.toasts.filter((toast) => toast.type === 'warning'),
    )
    expect(scanTree).not.toHaveBeenCalled()
  })

  it('drops a late scan result after reset and reopen of the same project', async () => {
    const workspace = createMockSampleWorkspace()
    const reopenedGraph = { ...workspace.graph, projectName: 'Reopened map' }
    const scan = deferred<typeof workspace.graph>()
    const client = {
      analyzeWorkspace: vi.fn(() => scan.promise),
      getSemanticTree: vi.fn(async () => workspace.semanticTree),
      getProjectGraph: vi.fn(async () => reopenedGraph),
      getMapContent: vi.fn(async () => workspace.mapContent),
      getCurrentWork: vi.fn(async () => workspace.currentWork),
      getChatSessionIndex: vi.fn(async () => ({
        version: '0.2.0',
        pinnedIds: [],
        heads: [],
      })),
      upsertChatSession: vi.fn(async () => undefined),
      setLastActiveChatSession: vi.fn(async () => undefined),
      deleteChatSession: vi.fn(async () => undefined),
      openWorkspace: vi.fn(async () => workspace.project),
      getProjectDescription: vi.fn(async () => workspace.projectDescription),
      getSettings: vi.fn(async () => workspace.settings),
    } as unknown as ProjectOSApi
    setWorkspace(client)
    const sameProject = useWorkbenchStore.getState().project
    client.openWorkspace.mockImplementation(async () => sameProject)
    const pending = useWorkbenchStore.getState().rescanStructureGraph()
    await useWorkbenchStore.getState().resetDemo()
    const afterReset = useWorkbenchStore.getState()
    expect(afterReset.project?.projectId).toBe(sameProject?.projectId)
    expect(afterReset.graph).toEqual(reopenedGraph)
    expect(afterReset.structureRescanLoading).toBe(false)

    scan.resolve({ ...workspace.graph, projectName: 'Stale scan' })
    await pending
    expect(useWorkbenchStore.getState().graph).toEqual(afterReset.graph)
    expect(useWorkbenchStore.getState().composerDraft).toEqual(afterReset.composerDraft)
    expect(useWorkbenchStore.getState().messages).toEqual(afterReset.messages)
    expect(useWorkbenchStore.getState().error).toBe(afterReset.error)
    expect(useWorkbenchStore.getState().toasts.filter((toast) => toast.type !== 'info')).toEqual(
      afterReset.toasts.filter((toast) => toast.type !== 'info'),
    )

    const reopenScan = deferred<typeof workspace.graph>()
    client.analyzeWorkspace.mockImplementationOnce(() => reopenScan.promise)
    const reopenedAgain = { ...workspace.graph, projectName: 'Opened again' }
    client.getProjectGraph.mockResolvedValueOnce(reopenedAgain)
    client.getSemanticTree.mockResolvedValue(workspace.semanticTree)
    const second = useWorkbenchStore.getState().rescanStructureGraph()
    expect(useWorkbenchStore.getState().structureRescanLoading).toBe(true)
    const opening = useWorkbenchStore.getState().openWorkspace(workspace.project.workspaceRoot)
    reopenScan.resolve({ ...workspace.graph, projectName: 'In flight during reopen' })
    await second
    await opening
    expect(useWorkbenchStore.getState().project?.projectId).toBe(sameProject?.projectId)
    expect(useWorkbenchStore.getState().graph?.projectName).toBe('Opened again')
    expect(useWorkbenchStore.getState().structureRescanLoading).toBe(false)
    expect(useWorkbenchStore.getState().toasts.some((toast) => toast.type === 'success' && toast.message.includes('updated'))).toBe(false)
  })

  it('ignores an older scan when a newer scan is in flight', async () => {
    const workspace = createMockSampleWorkspace()
    const scans: Array<ReturnType<typeof deferred<typeof workspace.graph>>> = []
    const trees: Array<ReturnType<typeof deferred<typeof workspace.semanticTree>>> = []
    let deferTrees = false
    const client = {
      analyzeWorkspace: vi.fn(() => {
        const next = deferred<typeof workspace.graph>()
        scans.push(next)
        return next.promise
      }),
      getSemanticTree: vi.fn(() => {
        if (!deferTrees) return Promise.resolve(workspace.semanticTree)
        const next = deferred<typeof workspace.semanticTree>()
        trees.push(next)
        return next.promise
      }),
      getProjectGraph: vi.fn(async () => workspace.graph),
      getMapContent: vi.fn(async () => workspace.mapContent),
      getCurrentWork: vi.fn(async () => workspace.currentWork),
      getChatSessionIndex: vi.fn(async () => ({
        version: '0.2.0',
        pinnedIds: [],
        heads: [],
      })),
      upsertChatSession: vi.fn(async () => undefined),
      setLastActiveChatSession: vi.fn(async () => undefined),
      deleteChatSession: vi.fn(async () => undefined),
    } as unknown as ProjectOSApi
    setWorkspace(client)
    const first = useWorkbenchStore.getState().rescanStructureGraph()
    await useWorkbenchStore.getState().resetDemo()
    const second = useWorkbenchStore.getState().rescanStructureGraph()
    expect(scans).toHaveLength(2)
    scans[0]?.resolve({ ...workspace.graph, projectName: 'Older scan' })
    await first
    expect(useWorkbenchStore.getState().graph?.projectName).not.toBe('Older scan')
    expect(trees).toHaveLength(0)

    const newerGraph = { ...workspace.graph, projectName: 'Newer scan' }
    deferTrees = true
    scans[1]?.resolve(newerGraph)
    await vi.waitFor(() => expect(trees).toHaveLength(1))
    trees[0]?.resolve(workspace.semanticTree)
    await second
    expect(useWorkbenchStore.getState().graph).toEqual(newerGraph)
    expect(useWorkbenchStore.getState().structureRescanLoading).toBe(false)
    expect(useWorkbenchStore.getState().toasts.some((toast) => toast.type === 'success')).toBe(true)
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
  reject: (error: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((next, fail) => {
    resolve = next
    reject = fail
  })
  return { promise, resolve, reject }
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
