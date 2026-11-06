import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProjectOSApi, StructureScanProgressEvent } from '@contracts/index'
import { createPlannedStructureScanSteps } from '@contracts/index'
import { createMockSampleWorkspace } from '../../../client/mock-project-os-api-client.js'
import { getStoreMessage } from '../i18n/storeMessages'
import { useWorkbenchStore } from './workbenchStore'

afterEach(() => {
  useWorkbenchStore.getState().structureScanDisposable?.dispose()
  useWorkbenchStore.setState({
    project: null,
    graph: null,
    tree: null,
    context: null,
    messages: [],
    toasts: [],
    error: null,
    structureRescanLoading: false,
    structureScanProgress: null,
    structureScanDisposable: null,
  })
})

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

function scanEvent(
  type: 'scan_completed' | 'scan_failed',
  projectId: string,
): StructureScanProgressEvent {
  return {
    type,
    scanId: 'scan_test',
    projectId,
    timestamp: new Date().toISOString(),
    ...(type === 'scan_failed' ? { message: 'provider failed' } : {}),
  } as StructureScanProgressEvent
}

describe('structure rescan reliability', () => {
  it('keeps a newer draft and map when the pending scan fails', async () => {
    const workspace = createMockSampleWorkspace()
    const scan = deferred<typeof workspace.graph>()
    const client = {
      analyzeWorkspace: vi.fn(() => scan.promise),
      getSemanticTree: vi.fn(),
      streamStructureScan: vi.fn(() => ({ dispose() {} })),
      getStructureScanProgress: vi.fn(async () => null),
    } as unknown as ProjectOSApi
    useWorkbenchStore.setState({
      client,
      project: workspace.project,
      graph: workspace.graph,
      tree: workspace.semanticTree,
      locale: 'en',
      structureRescanLoading: false,
      toasts: [],
      messages: [],
      context: null,
    })
    const pending = useWorkbenchStore.getState().rescanStructureGraph()
    expect(useWorkbenchStore.getState().structureRescanLoading).toBe(true)
    const draft = {
      ...useWorkbenchStore.getState().composerDraft,
      text: 'Edited while the scan is running',
    }
    useWorkbenchStore.setState({
      composerDraft: draft,
      messages: [{
        id: 'msg_new',
        role: 'user',
        content: 'Sent while the scan is running',
        timestamp: '2026-11-06T00:00:00.000Z',
      }],
      context: {
        scope: 'feature',
        projectId: workspace.project.projectId,
        nodeId: 'feat_login',
        title: 'Kept',
        summary: 'Kept',
        linkedFiles: [],
        upstream: [],
        downstream: [],
        recentChanges: [],
        rawContextMarkdown: 'Kept',
      },
    })
    scan.reject(new Error('Model provider request failed (HTTP 503)'))
    await pending

    const state = useWorkbenchStore.getState()
    expect(state.structureRescanLoading).toBe(false)
    expect(state.graph).toEqual(workspace.graph)
    expect(state.composerDraft.text).toBe('Edited while the scan is running')
    expect(state.messages.map((message) => message.content)).toEqual([
      'Sent while the scan is running',
    ])
    expect(state.context?.title).toBe('Kept')
    expect(state.error).toBeNull()
    expect(state.toasts.filter((toast) => toast.type === 'success')).toHaveLength(0)
    expect(state.toasts.some((toast) => toast.type === 'warning' && toast.message.includes('HTTP 503'))).toBe(true)
    expect(client.getSemanticTree).not.toHaveBeenCalled()
  })

  it('adopts the saved graph when only the semantic-tree read fails', async () => {
    const workspace = createMockSampleWorkspace()
    const scanned = { ...workspace.graph, projectName: 'Scanned map' }
    const client = {
      analyzeWorkspace: vi.fn(async () => scanned),
      getSemanticTree: vi.fn(async () => {
        throw new Error('semantic tree read failed')
      }),
      streamStructureScan: vi.fn(() => ({ dispose() {} })),
      getStructureScanProgress: vi.fn(async () => null),
    } as unknown as ProjectOSApi
    useWorkbenchStore.setState({
      client,
      project: workspace.project,
      graph: workspace.graph,
      tree: workspace.semanticTree,
      locale: 'en',
      structureRescanLoading: false,
      toasts: [],
      composerDraft: {
        ...useWorkbenchStore.getState().composerDraft,
        text: 'Keep this draft',
      },
    })
    await useWorkbenchStore.getState().rescanStructureGraph()
    const state = useWorkbenchStore.getState()
    expect(client.analyzeWorkspace).toHaveBeenCalledOnce()
    expect(client.getSemanticTree).toHaveBeenCalledOnce()
    expect(state.graph).toEqual(scanned)
    expect(state.tree).toBe(workspace.semanticTree)
    expect(state.composerDraft.text).toBe('Keep this draft')
    expect(state.structureRescanLoading).toBe(false)
    expect(state.error).toBe(getStoreMessage('en', 'map.rescanTreeRefreshFailed', {
      reason: 'semantic tree read failed',
    }))
    expect(state.error).not.toContain('kept the current map')
    expect(state.toasts.some((toast) => toast.type === 'success')).toBe(false)
    expect(getStoreMessage('zh', 'map.rescanTreeRefreshFailed', { reason: '读取失败' }))
      .toContain('语义树未能刷新')
  })

  it('drops a late direct result and a late progress reload after the workspace changes', async () => {
    const workspace = createMockSampleWorkspace()
    const scan = deferred<typeof workspace.graph>()
    let emit: (event: StructureScanProgressEvent) => void = () => undefined
    const client = {
      analyzeWorkspace: vi.fn(() => scan.promise),
      getSemanticTree: vi.fn(async () => workspace.semanticTree),
      getProjectGraph: vi.fn(async () => ({ ...workspace.graph, projectName: 'Poison reload' })),
      streamStructureScan: vi.fn((_projectId: string, cb: (event: StructureScanProgressEvent) => void) => {
        emit = cb
        return { dispose() {} }
      }),
      getStructureScanProgress: vi.fn(async () => null),
    } as unknown as ProjectOSApi
    useWorkbenchStore.setState({
      client,
      project: workspace.project,
      graph: workspace.graph,
      tree: workspace.semanticTree,
      locale: 'en',
      structureRescanLoading: false,
      toasts: [],
      composerDraft: {
        ...useWorkbenchStore.getState().composerDraft,
        text: 'first draft',
      },
    })
    const pending = useWorkbenchStore.getState().rescanStructureGraph()
    const replacement = { ...workspace.graph, projectName: 'Replacement map' }
    useWorkbenchStore.setState({
      project: { ...workspace.project, projectId: 'proj_replaced' },
      graph: replacement,
      composerDraft: {
        ...useWorkbenchStore.getState().composerDraft,
        text: 'newer draft',
      },
      messages: [{
        id: 'msg_keep',
        role: 'user',
        content: 'newer message',
        timestamp: '2026-11-06T00:00:00.000Z',
      }],
    })
    scan.resolve({ ...workspace.graph, projectName: 'Stale scan' })
    emit(scanEvent('scan_completed', workspace.project.projectId))
    await pending
    await Promise.resolve()

    const state = useWorkbenchStore.getState()
    expect(state.project?.projectId).toBe('proj_replaced')
    expect(state.graph?.projectName).toBe('Replacement map')
    expect(state.composerDraft.text).toBe('newer draft')
    expect(state.messages.map((message) => message.content)).toEqual(['newer message'])
    expect(state.toasts.some((toast) => toast.type === 'success')).toBe(false)
    expect(client.getProjectGraph).not.toHaveBeenCalled()
  })

  it('drops a late scan after reset and reopen of the same project, then accepts only the newer scan', async () => {
    const workspace = createMockSampleWorkspace()
    const reopened = { ...workspace.graph, projectName: 'Reopened map' }
    const scans: Array<ReturnType<typeof deferred<typeof workspace.graph>>> = []
    const client = {
      analyzeWorkspace: vi.fn(() => {
        const next = deferred<typeof workspace.graph>()
        scans.push(next)
        return next.promise
      }),
      getSemanticTree: vi.fn(async () => workspace.semanticTree),
      getProjectGraph: vi.fn(async () => reopened),
      getMapContent: vi.fn(async () => workspace.mapContent),
      getCurrentWork: vi.fn(async () => workspace.currentWork),
      streamStructureScan: vi.fn(() => ({ dispose() {} })),
      getStructureScanProgress: vi.fn(async () => null),
      getChatSessionIndex: vi.fn(async () => ({
        version: '0.2.0',
        pinnedIds: [],
        heads: [],
      })),
      upsertChatSession: vi.fn(async () => undefined),
      setLastActiveChatSession: vi.fn(async () => undefined),
      deleteChatSession: vi.fn(async () => undefined),
      setChatSessionPinned: vi.fn(async () => undefined),
      openWorkspace: vi.fn(async () => workspace.project),
      getProjectDescription: vi.fn(async () => workspace.projectDescription),
      getSettings: vi.fn(async () => workspace.settings),
      listWorkspaceDirectory: vi.fn(async () => []),
    } as unknown as ProjectOSApi
    useWorkbenchStore.setState({
      client,
      project: workspace.project,
      graph: workspace.graph,
      tree: workspace.semanticTree,
      locale: 'en',
      structureRescanLoading: false,
      toasts: [],
    })
    const projectId = workspace.project.projectId
    const first = useWorkbenchStore.getState().rescanStructureGraph()
    await useWorkbenchStore.getState().resetDemo()
    expect(useWorkbenchStore.getState().project?.projectId).toBe(projectId)
    expect(useWorkbenchStore.getState().graph).toEqual(reopened)
    expect(useWorkbenchStore.getState().structureRescanLoading).toBe(false)
    scans[0]?.resolve({ ...workspace.graph, projectName: 'Stale after reset' })
    await first
    expect(useWorkbenchStore.getState().graph?.projectName).toBe('Reopened map')

    client.openWorkspace.mockImplementation(async () => useWorkbenchStore.getState().project)
    const openedAgain = { ...workspace.graph, projectName: 'Opened again' }
    client.getProjectGraph.mockResolvedValueOnce(openedAgain)
    const second = useWorkbenchStore.getState().rescanStructureGraph()
    expect(useWorkbenchStore.getState().structureRescanLoading).toBe(true)
    const opening = useWorkbenchStore.getState().openWorkspace(workspace.project.workspaceRoot)
    scans[1]?.resolve({ ...workspace.graph, projectName: 'In flight during reopen' })
    await second
    await opening
    expect(useWorkbenchStore.getState().project?.projectId).toBe(projectId)
    expect(useWorkbenchStore.getState().graph?.projectName).toBe('Opened again')
    expect(useWorkbenchStore.getState().structureRescanLoading).toBe(false)
    expect(useWorkbenchStore.getState().toasts.some((toast) => toast.type === 'success')).toBe(false)

    const thirdGraph = { ...workspace.graph, projectName: 'Newer scan' }
    const third = useWorkbenchStore.getState().rescanStructureGraph()
    scans[2]?.resolve(thirdGraph)
    await third
    expect(useWorkbenchStore.getState().graph).toEqual(thirdGraph)
    expect(useWorkbenchStore.getState().structureRescanLoading).toBe(false)
    expect(useWorkbenchStore.getState().toasts.filter((toast) => toast.type === 'success')).toHaveLength(1)
  })

  it('toasts success once when the progress event and the direct result both finish', async () => {
    const workspace = createMockSampleWorkspace()
    let emit: (event: StructureScanProgressEvent) => void = () => undefined
    const scanned = { ...workspace.graph, projectName: 'Once' }
    const client = {
      analyzeWorkspace: vi.fn(async () => {
        emit(scanEvent('scan_completed', workspace.project.projectId))
        return scanned
      }),
      getSemanticTree: vi.fn(async () => workspace.semanticTree),
      getProjectGraph: vi.fn(async () => scanned),
      streamStructureScan: vi.fn((_projectId: string, cb: (event: StructureScanProgressEvent) => void) => {
        emit = cb
        return { dispose() {} }
      }),
      getStructureScanProgress: vi.fn(async () => null),
    } as unknown as ProjectOSApi
    useWorkbenchStore.setState({
      client,
      project: workspace.project,
      graph: workspace.graph,
      tree: workspace.semanticTree,
      locale: 'en',
      structureRescanLoading: false,
      toasts: [],
    })
    await useWorkbenchStore.getState().rescanStructureGraph()
    await Promise.resolve()
    const state = useWorkbenchStore.getState()
    expect(state.graph).toEqual(scanned)
    expect(state.structureRescanLoading).toBe(false)
    expect(state.toasts.filter((toast) => toast.type === 'success')).toHaveLength(1)
  })

  it('ignores an old scan id on the subscription attached by same-project reopen', async () => {
    const workspace = createMockSampleWorkspace()
    const reopened = { ...workspace.graph, projectName: 'Reopened map' }
    const fresh = { ...workspace.graph, projectName: 'Fresh scan' }
    const listeners: Array<(event: StructureScanProgressEvent) => void> = []
    const analyze = deferred<typeof workspace.graph>()
    const client = {
      openWorkspace: vi.fn(async () => workspace.project),
      analyzeWorkspace: vi.fn(() => analyze.promise),
      getProjectGraph: vi.fn(async () => reopened),
      getSemanticTree: vi.fn(async () => workspace.semanticTree),
      getMapContent: vi.fn(async () => workspace.mapContent),
      getCurrentWork: vi.fn(async () => workspace.currentWork),
      getProjectDescription: vi.fn(async () => workspace.projectDescription),
      getSettings: vi.fn(async () => workspace.settings),
      listWorkspaceDirectory: vi.fn(async () => []),
      getStructureScanProgress: vi.fn(async () => null),
      getChatSessionIndex: vi.fn(async () => ({
        version: '0.2.0',
        pinnedIds: [],
        heads: [],
      })),
      getChatSession: vi.fn(async () => null),
      upsertChatSession: vi.fn(async () => undefined),
      setLastActiveChatSession: vi.fn(async () => undefined),
      setChatSessionPinned: vi.fn(async () => undefined),
      deleteChatSession: vi.fn(async () => undefined),
      streamStructureScan: vi.fn((_projectId: string, cb: (event: StructureScanProgressEvent) => void) => {
        listeners.push(cb)
        return {
          dispose() {
            const index = listeners.indexOf(cb)
            if (index >= 0) listeners.splice(index, 1)
          },
        }
      }),
    } as unknown as ProjectOSApi
    useWorkbenchStore.setState({
      client,
      project: workspace.project,
      graph: workspace.graph,
      tree: workspace.semanticTree,
      locale: 'en',
      structureRescanLoading: false,
      structureScanProgress: null,
      toasts: [],
    })

    await useWorkbenchStore.getState().openWorkspace(workspace.project.workspaceRoot)
    useWorkbenchStore.setState({
      toasts: [],
      messages: [{
        id: 'msg_keep',
        role: 'user',
        content: 'draft message',
        timestamp: '2026-11-06T00:00:00.000Z',
      }],
      composerDraft: {
        ...useWorkbenchStore.getState().composerDraft,
        text: 'kept draft',
      },
    })
    const attached = listeners.at(-1)
    expect(attached).toBeTypeOf('function')
    const projectId = workspace.project.projectId
    const stamp = new Date().toISOString()
    for (const type of ['scan_cancelled', 'scan_failed', 'scan_completed'] as const) {
      attached?.({
        type,
        scanId: 'scan_before_reopen',
        projectId,
        timestamp: stamp,
        ...(type === 'scan_failed' ? { message: 'old failure sk-proj-old-secret' } : {}),
      } as StructureScanProgressEvent)
    }
    await Promise.resolve()

    let state = useWorkbenchStore.getState()
    expect(state.project?.projectId).toBe(projectId)
    expect(state.graph?.projectName).toBe('Reopened map')
    expect(state.tree).toBe(workspace.semanticTree)
    expect(state.composerDraft.text).toBe('kept draft')
    expect(state.messages.map((message) => message.content)).toEqual(['draft message'])
    expect(state.structureRescanLoading).toBe(false)
    expect(state.structureScanProgress).toBeNull()
    expect(state.error).toBeNull()
    expect(state.toasts.some((toast) => toast.type === 'info' || toast.type === 'warning' || toast.type === 'success')).toBe(false)
    expect(JSON.stringify(state.toasts)).not.toContain('sk-proj-old-secret')

    client.getProjectGraph.mockResolvedValue(fresh)
    const pending = useWorkbenchStore.getState().rescanStructureGraph()
    expect(useWorkbenchStore.getState().structureRescanLoading).toBe(true)
    const active = listeners.at(-1)
    expect(active).not.toBe(attached)
    active?.({
      type: 'scan_cancelled',
      scanId: 'scan_before_reopen',
      projectId,
      timestamp: stamp,
    })
    expect(useWorkbenchStore.getState().structureRescanLoading).toBe(true)
    active?.({
      type: 'scan_planned',
      scanId: 'scan_fresh',
      projectId,
      timestamp: stamp,
      mode: 'regenerate',
      steps: createPlannedStructureScanSteps(),
    })
    active?.({
      type: 'scan_completed',
      scanId: 'scan_fresh',
      projectId,
      timestamp: stamp,
    })
    analyze.resolve(fresh)
    await pending
    await Promise.resolve()

    state = useWorkbenchStore.getState()
    expect(state.graph).toEqual(fresh)
    expect(state.structureRescanLoading).toBe(false)
    expect(state.composerDraft.text).toBe('kept draft')
    expect(state.toasts.filter((toast) => toast.type === 'success')).toHaveLength(1)
    expect(state.toasts.some((toast) => toast.message.includes('cancelled'))).toBe(false)
  })

  it('waits for server scan cancellation before reset reads the map', async () => {
    const workspace = createMockSampleWorkspace()
    let releaseCancel: (() => void) | undefined
    const cancel = new Promise<boolean>((resolve) => {
      releaseCancel = () => resolve(true)
    })
    let graphReads = 0
    const client = {
      cancelStructureScan: vi.fn(() => cancel),
      getProjectGraph: vi.fn(async () => {
        graphReads += 1
        return workspace.graph
      }),
      getSemanticTree: vi.fn(async () => workspace.semanticTree),
      getMapContent: vi.fn(async () => workspace.mapContent),
      getCurrentWork: vi.fn(async () => workspace.currentWork),
      getChatSessionIndex: vi.fn(async () => ({
        version: '0.2.0',
        pinnedIds: [],
        heads: [],
      })),
      getChatSession: vi.fn(async () => null),
      upsertChatSession: vi.fn(async () => undefined),
      setLastActiveChatSession: vi.fn(async () => undefined),
      setChatSessionPinned: vi.fn(async () => undefined),
      deleteChatSession: vi.fn(async () => undefined),
    } as unknown as ProjectOSApi
    useWorkbenchStore.setState({
      client,
      project: workspace.project,
      graph: { ...workspace.graph, projectName: 'Before reset' },
      tree: workspace.semanticTree,
      locale: 'en',
      structureRescanLoading: true,
      toasts: [],
    })
    const pending = useWorkbenchStore.getState().resetDemo()
    await Promise.resolve()
    expect(client.cancelStructureScan).toHaveBeenCalledOnce()
    expect(graphReads).toBe(0)
    releaseCancel?.()
    await pending
    expect(graphReads).toBe(1)
    expect(useWorkbenchStore.getState().graph).toEqual(workspace.graph)
    expect(useWorkbenchStore.getState().structureRescanLoading).toBe(false)
  })

  function resetClient(
    workspace: ReturnType<typeof createMockSampleWorkspace>,
    overrides: Record<string, unknown> = {},
  ): ProjectOSApi {
    return {
      cancelStructureScan: vi.fn(async () => true),
      getProjectGraph: vi.fn(async () => workspace.graph),
      getSemanticTree: vi.fn(async () => workspace.semanticTree),
      getMapContent: vi.fn(async () => workspace.mapContent),
      getCurrentWork: vi.fn(async () => workspace.currentWork),
      getProjectDescription: vi.fn(async () => workspace.projectDescription),
      getSettings: vi.fn(async () => workspace.settings),
      listWorkspaceDirectory: vi.fn(async () => []),
      openWorkspace: vi.fn(async () => workspace.project),
      streamStructureScan: vi.fn(() => ({ dispose() {} })),
      getStructureScanProgress: vi.fn(async () => null),
      getChatSessionIndex: vi.fn(async () => ({
        version: '0.2.0',
        pinnedIds: [],
        heads: [],
      })),
      getChatSession: vi.fn(async () => null),
      upsertChatSession: vi.fn(async () => undefined),
      setLastActiveChatSession: vi.fn(async () => undefined),
      setChatSessionPinned: vi.fn(async () => undefined),
      deleteChatSession: vi.fn(async () => undefined),
      ...overrides,
    } as unknown as ProjectOSApi
  }

  function keepNewerInputs(): void {
    const projectId = useWorkbenchStore.getState().project?.projectId ?? 'proj'
    useWorkbenchStore.setState({
      composerDraft: {
        ...useWorkbenchStore.getState().composerDraft,
        text: 'newer draft',
      },
      messages: [{
        id: 'msg_newer',
        role: 'user',
        content: 'newer message',
        timestamp: '2026-11-06T00:00:00.000Z',
      }],
      context: {
        scope: 'feature',
        projectId,
        nodeId: 'feat_login',
        title: 'Kept context',
        summary: 'Kept',
        linkedFiles: [],
        upstream: [],
        downstream: [],
        recentChanges: [],
        rawContextMarkdown: 'Kept',
      },
      error: null,
    })
  }

  function expectNewerWorkspaceKept(graphName: string): void {
    const state = useWorkbenchStore.getState()
    expect(state.graph?.projectName).toBe(graphName)
    expect(state.composerDraft.text).toBe('newer draft')
    expect(state.messages.map((message) => message.content)).toEqual(['newer message'])
    expect(state.context?.title).toBe('Kept context')
    expect(state.error).toBeNull()
    expect(JSON.stringify(state)).not.toContain('sk-proj-')
  }

  it('does not let a reset waiting on cancel overwrite a workspace opened during the wait', async () => {
    const workspace = createMockSampleWorkspace()
    const cancel = deferred<boolean>()
    const opened = { ...workspace.graph, projectName: 'Opened during cancel' }
    const stale = { ...workspace.graph, projectName: 'Stale reset' }
    let graphReads = 0
    const client = resetClient(workspace, {
      cancelStructureScan: vi.fn(() => cancel.promise),
      openWorkspace: vi.fn(async () => ({
        ...workspace.project,
        projectId: 'proj_opened',
        workspaceRoot: '/tmp/opened-during-cancel',
      })),
      getProjectGraph: vi.fn(async () => {
        graphReads += 1
        return graphReads === 1 ? opened : stale
      }),
      getProjectDescription: vi.fn(async () => ({
        ...workspace.projectDescription,
        projectId: 'proj_opened',
      })),
    })
    useWorkbenchStore.setState({
      client,
      project: workspace.project,
      graph: { ...workspace.graph, projectName: 'Before reset' },
      tree: workspace.semanticTree,
      locale: 'en',
      error: null,
      toasts: [],
    })
    const pending = useWorkbenchStore.getState().resetDemo()
    await Promise.resolve()
    expect(client.cancelStructureScan).toHaveBeenCalledOnce()
    await useWorkbenchStore.getState().openWorkspace('/tmp/opened-during-cancel')
    keepNewerInputs()
    cancel.resolve(true)
    await pending
    expect(useWorkbenchStore.getState().project?.projectId).toBe('proj_opened')
    expectNewerWorkspaceKept('Opened during cancel')
  })

  it('does not apply reset reads that resolve after a workspace switch', async () => {
    const workspace = createMockSampleWorkspace()
    const graphRead = deferred<typeof workspace.graph>()
    const opened = { ...workspace.graph, projectName: 'Opened during reads' }
    let graphReads = 0
    const client = resetClient(workspace, {
      openWorkspace: vi.fn(async () => ({
        ...workspace.project,
        projectId: 'proj_during_reads',
        workspaceRoot: '/tmp/opened-during-reads',
      })),
      getProjectGraph: vi.fn(() => {
        graphReads += 1
        if (graphReads === 1) return graphRead.promise
        return Promise.resolve(opened)
      }),
      getProjectDescription: vi.fn(async () => ({
        ...workspace.projectDescription,
        projectId: 'proj_during_reads',
      })),
    })
    useWorkbenchStore.setState({
      client,
      project: workspace.project,
      graph: { ...workspace.graph, projectName: 'Before reset' },
      tree: workspace.semanticTree,
      locale: 'en',
      error: null,
      toasts: [],
    })
    const pending = useWorkbenchStore.getState().resetDemo()
    await vi.waitFor(() => expect(graphReads).toBe(1))
    await useWorkbenchStore.getState().openWorkspace('/tmp/opened-during-reads')
    keepNewerInputs()
    graphRead.resolve({ ...workspace.graph, projectName: 'Stale read' })
    await pending
    expect(useWorkbenchStore.getState().project?.projectId).toBe('proj_during_reads')
    expectNewerWorkspaceKept('Opened during reads')
  })

  it('does not record a reset cancellation or read failure after the workspace changed', async () => {
    const workspace = createMockSampleWorkspace()
    const cancel = deferred<boolean>()
    const graphRead = deferred<typeof workspace.graph>()
    const opened = { ...workspace.graph, projectName: 'Opened before rejection' }
    let graphReads = 0
    const client = resetClient(workspace, {
      cancelStructureScan: vi.fn(() => cancel.promise),
      openWorkspace: vi.fn(async () => ({
        ...workspace.project,
        projectId: 'proj_after_reject',
        workspaceRoot: '/tmp/opened-before-reject',
      })),
      getProjectGraph: vi.fn(() => {
        graphReads += 1
        if (graphReads === 1) return Promise.resolve(opened)
        return graphRead.promise
      }),
      getProjectDescription: vi.fn(async () => ({
        ...workspace.projectDescription,
        projectId: 'proj_after_reject',
      })),
    })
    useWorkbenchStore.setState({
      client,
      project: workspace.project,
      graph: { ...workspace.graph, projectName: 'Before reset' },
      tree: workspace.semanticTree,
      locale: 'en',
      error: null,
      toasts: [],
    })
    const pendingCancel = useWorkbenchStore.getState().resetDemo()
    await Promise.resolve()
    await useWorkbenchStore.getState().openWorkspace('/tmp/opened-before-reject')
    keepNewerInputs()
    cancel.reject(new Error('cancel failed sk-proj-reset-secret'))
    await pendingCancel
    expectNewerWorkspaceKept('Opened before rejection')

    const readClient = resetClient(workspace, {
      openWorkspace: vi.fn(async () => ({
        ...workspace.project,
        projectId: 'proj_read_reject',
        workspaceRoot: '/tmp/opened-before-read-reject',
      })),
      getProjectGraph: vi.fn(() => {
        graphReads += 1
        if (graphReads === 2) return graphRead.promise
        return Promise.resolve({ ...workspace.graph, projectName: 'Opened before read rejection' })
      }),
      getProjectDescription: vi.fn(async () => ({
        ...workspace.projectDescription,
        projectId: 'proj_read_reject',
      })),
    })
    useWorkbenchStore.setState({
      client: readClient,
      project: workspace.project,
      graph: { ...workspace.graph, projectName: 'Before read reset' },
      tree: workspace.semanticTree,
      locale: 'en',
      error: null,
      toasts: [],
      messages: [],
      context: null,
    })
    const pendingRead = useWorkbenchStore.getState().resetDemo()
    await vi.waitFor(() => expect(graphReads).toBe(2))
    await useWorkbenchStore.getState().openWorkspace('/tmp/opened-before-read-reject')
    keepNewerInputs()
    graphRead.reject(new Error('read failed sk-proj-read-secret'))
    await pendingRead
    expect(useWorkbenchStore.getState().project?.projectId).toBe('proj_read_reject')
    expectNewerWorkspaceKept('Opened before read rejection')
  })

  it('does not let an older same-project reset overwrite a reopen or a newer reset', async () => {
    const workspace = createMockSampleWorkspace()
    const cancel = deferred<boolean>()
    const reopened = { ...workspace.graph, projectName: 'Same id reopened' }
    const stale = { ...workspace.graph, projectName: 'Same id stale reset' }
    let graphReads = 0
    const client = resetClient(workspace, {
      cancelStructureScan: vi.fn(() => cancel.promise),
      getProjectGraph: vi.fn(async () => {
        graphReads += 1
        return graphReads === 1 ? reopened : stale
      }),
    })
    useWorkbenchStore.setState({
      client,
      project: workspace.project,
      graph: { ...workspace.graph, projectName: 'Before reset' },
      tree: workspace.semanticTree,
      locale: 'en',
      error: null,
      toasts: [],
    })
    const pending = useWorkbenchStore.getState().resetDemo()
    await Promise.resolve()
    await useWorkbenchStore.getState().openWorkspace(workspace.project.workspaceRoot)
    expect(useWorkbenchStore.getState().project?.projectId).toBe(workspace.project.projectId)
    keepNewerInputs()
    cancel.resolve(true)
    await pending
    expect(useWorkbenchStore.getState().project?.projectId).toBe(workspace.project.projectId)
    expectNewerWorkspaceKept('Same id reopened')

    const firstCancel = deferred<boolean>()
    const secondCancel = deferred<boolean>()
    let cancelCalls = 0
    let resetReads = 0
    const newer = { ...workspace.graph, projectName: 'Newer reset' }
    const older = { ...workspace.graph, projectName: 'Older reset' }
    const resetAgain = resetClient(workspace, {
      cancelStructureScan: vi.fn(() => {
        cancelCalls += 1
        return cancelCalls === 1 ? firstCancel.promise : secondCancel.promise
      }),
      getProjectGraph: vi.fn(async () => {
        resetReads += 1
        return resetReads === 1 ? newer : older
      }),
    })
    useWorkbenchStore.setState({
      client: resetAgain,
      project: workspace.project,
      graph: { ...workspace.graph, projectName: 'Before paired reset' },
      tree: workspace.semanticTree,
      locale: 'en',
      error: null,
      toasts: [],
      messages: [],
      context: null,
    })
    const first = useWorkbenchStore.getState().resetDemo()
    await vi.waitFor(() => expect(cancelCalls).toBe(1))
    const second = useWorkbenchStore.getState().resetDemo()
    await vi.waitFor(() => expect(cancelCalls).toBe(2))
    secondCancel.resolve(true)
    await second
    keepNewerInputs()
    firstCancel.resolve(true)
    await first
    expect(useWorkbenchStore.getState().project?.projectId).toBe(workspace.project.projectId)
    expectNewerWorkspaceKept('Newer reset')
  })

  it('does not let reset chat hydration overwrite inputs from a workspace switch', async () => {
    const workspace = createMockSampleWorkspace()
    const indexRead = deferred<{ version: '0.2.0'; pinnedIds: string[]; heads: [] }>()
    let indexCalls = 0
    let graphReads = 0
    const opened = { ...workspace.graph, projectName: 'Opened during chat reset' }
    const client = resetClient(workspace, {
      openWorkspace: vi.fn(async () => ({
        ...workspace.project,
        projectId: 'proj_during_chat_reset',
        workspaceRoot: '/tmp/during-chat-reset',
      })),
      getProjectGraph: vi.fn(async () => {
        graphReads += 1
        return graphReads === 1
          ? { ...workspace.graph, projectName: 'Reset map' }
          : opened
      }),
      getProjectDescription: vi.fn(async () => ({
        ...workspace.projectDescription,
        projectId: 'proj_during_chat_reset',
      })),
      getChatSessionIndex: vi.fn(() => {
        indexCalls += 1
        if (indexCalls === 1) return indexRead.promise
        return Promise.resolve({ version: '0.2.0' as const, pinnedIds: [], heads: [] })
      }),
    })
    useWorkbenchStore.setState({
      client,
      project: workspace.project,
      graph: { ...workspace.graph, projectName: 'Before reset' },
      tree: workspace.semanticTree,
      locale: 'en',
      error: null,
      toasts: [],
    })
    const pending = useWorkbenchStore.getState().resetDemo()
    await vi.waitFor(() => expect(indexCalls).toBe(1))
    await useWorkbenchStore.getState().openWorkspace('/tmp/during-chat-reset')
    keepNewerInputs()
    indexRead.resolve({ version: '0.2.0', pinnedIds: [], heads: [] })
    await pending
    expect(useWorkbenchStore.getState().project?.projectId).toBe('proj_during_chat_reset')
    expectNewerWorkspaceKept('Opened during chat reset')
  })

  it('still applies a reset and reports a read failure when the workspace stays current', async () => {
    const workspace = createMockSampleWorkspace()
    const reloaded = { ...workspace.graph, projectName: 'Reloaded by reset' }
    const client = resetClient(workspace, {
      getProjectGraph: vi.fn(async () => reloaded),
    })
    useWorkbenchStore.setState({
      client,
      project: workspace.project,
      graph: { ...workspace.graph, projectName: 'Before reset' },
      tree: workspace.semanticTree,
      locale: 'en',
      error: 'previous error',
      toasts: [],
      structureRescanLoading: true,
    })
    await useWorkbenchStore.getState().resetDemo()
    expect(useWorkbenchStore.getState().graph).toEqual(reloaded)
    expect(useWorkbenchStore.getState().error).toBeNull()
    expect(useWorkbenchStore.getState().structureRescanLoading).toBe(false)
    expect(useWorkbenchStore.getState().project?.projectId).toBe(workspace.project.projectId)

    const failing = resetClient(workspace, {
      getProjectGraph: vi.fn(async () => {
        throw new Error('disk unavailable')
      }),
    })
    useWorkbenchStore.setState({
      client: failing,
      project: workspace.project,
      graph: reloaded,
      tree: workspace.semanticTree,
      locale: 'en',
      error: null,
      toasts: [],
    })
    await useWorkbenchStore.getState().resetDemo()
    expect(useWorkbenchStore.getState().graph).toEqual(reloaded)
    expect(useWorkbenchStore.getState().error).toBe('disk unavailable')
    expect(useWorkbenchStore.getState().project?.projectId).toBe(workspace.project.projectId)
  })
})
