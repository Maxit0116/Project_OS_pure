import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ContextPayload, ProjectOSApi } from '@contracts/index'
import { createMockSampleWorkspace } from '../../../client/mock-project-os-api-client.js'
import { useWorkbenchStore } from './workbenchStore'

const originalClient = useWorkbenchStore.getState().client

afterEach(() => {
  useWorkbenchStore.setState({
    client: originalClient,
    project: null,
    graph: null,
    tree: null,
    context: null,
    contextLoading: false,
    selectedNodeId: null,
    selectedFilePath: null,
    globalAgentActive: false,
    pendingFileOwnerChoice: null,
    fileScopeError: null,
    highlightedFilePaths: [],
    chatMode: 'ask',
    rightPanelTab: 'chat',
    rightPanelOpen: false,
    centerTab: 'function-map',
  })
})

describe('openNodeAgentChat', () => {
  it('clears global scope when a real node agent is opened', async () => {
    const workspace = createMockSampleWorkspace()
    const node = workspace.graph.nodes.find((candidate) => candidate.id === 'feat_login')!
    const getNodeContext = vi.fn(async (): Promise<ContextPayload> => ({
      scope: 'feature',
      projectId: workspace.project.projectId,
      nodeId: node.id,
      title: node.name,
      summary: node.summary,
      linkedFiles: node.linkedFiles,
      upstream: node.upstream,
      downstream: node.downstream,
      recentChanges: [],
      rawContextMarkdown: node.summary,
    }))
    useWorkbenchStore.setState({
      client: { getNodeContext } as unknown as ProjectOSApi,
      project: workspace.project,
      graph: workspace.graph,
      tree: workspace.semanticTree,
      globalAgentActive: true,
    })

    await useWorkbenchStore.getState().openNodeAgentChat(node.id)

    expect(useWorkbenchStore.getState()).toMatchObject({
      globalAgentActive: false,
      selectedNodeId: node.id,
    })
  })

  it('atomically selects node scope and opens Ask in the chat panel', async () => {
    const workspace = createMockSampleWorkspace()
    const node = workspace.graph.nodes.find((candidate) => candidate.id === 'feat_login')!
    let resolveContext!: (context: ContextPayload) => void
    const getNodeContext = vi.fn(
      () => new Promise<ContextPayload>((resolve) => {
        resolveContext = resolve
      }),
    )
    useWorkbenchStore.setState({
      client: { getNodeContext } as unknown as ProjectOSApi,
      project: workspace.project,
      graph: workspace.graph,
      tree: workspace.semanticTree,
      selectedNodeId: 'feat_home',
      selectedFilePath: 'app/home/page.tsx',
      pendingFileOwnerChoice: {
        filePath: 'app/home/page.tsx',
        candidateNodeIds: ['feat_home', 'feat_login'],
      },
      fileScopeError: 'not_mapped',
      chatMode: 'change',
      rightPanelTab: 'harness',
      rightPanelOpen: false,
      centerTab: 'function-map',
      contextLoading: false,
    })

    const transitions: Array<ReturnType<typeof snapshotTransition>> = []
    const unsubscribe = useWorkbenchStore.subscribe((state) => {
      transitions.push(snapshotTransition(state))
    })
    const pending = useWorkbenchStore.getState().openNodeAgentChat(node.id)

    expect(transitions).toHaveLength(1)
    expect(transitions[0]).toEqual({
      selectedNodeId: node.id,
      selectedFilePath: null,
      pendingFileOwnerChoice: null,
      fileScopeError: null,
      chatMode: 'ask',
      rightPanelTab: 'chat',
      rightPanelOpen: true,
      centerTab: 'function-map',
      contextLoading: true,
    })
    expect(useWorkbenchStore.getState().highlightedFilePaths).toEqual(
      node.linkedFiles.map((file) => file.path),
    )
    expect(getNodeContext).toHaveBeenCalledWith(workspace.project.projectId, node.id)

    resolveContext({
      scope: 'feature',
      projectId: workspace.project.projectId,
      nodeId: node.id,
      title: node.name,
      summary: node.summary,
      linkedFiles: node.linkedFiles,
      upstream: node.upstream,
      downstream: node.downstream,
      recentChanges: [],
      rawContextMarkdown: `# ${node.name}`,
    })
    await pending
    unsubscribe()

    expect(useWorkbenchStore.getState()).toMatchObject({
      contextLoading: false,
      context: { nodeId: node.id },
    })
  })

  it('does not mutate state or load context for an unknown node', async () => {
    const { getNodeContext } = setReadyNodeAgentState()
    const before = useWorkbenchStore.getState()
    const listener = vi.fn()
    const unsubscribe = useWorkbenchStore.subscribe(listener)

    await useWorkbenchStore.getState().openNodeAgentChat('missing-node')
    unsubscribe()

    expect(useWorkbenchStore.getState()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
    expect(getNodeContext).not.toHaveBeenCalled()
  })

  it('does not mutate state or load context for a code-level node', async () => {
    const { getNodeContext } = setReadyNodeAgentState({ includeCodeNode: true })
    const before = useWorkbenchStore.getState()
    const listener = vi.fn()
    const unsubscribe = useWorkbenchStore.subscribe(listener)

    await useWorkbenchStore.getState().openNodeAgentChat('code-node')
    unsubscribe()

    expect(useWorkbenchStore.getState()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
    expect(getNodeContext).not.toHaveBeenCalled()
  })
})

function setReadyNodeAgentState(options: { includeCodeNode?: boolean } = {}) {
  const workspace = createMockSampleWorkspace()
  const graph = structuredClone(workspace.graph)
  if (options.includeCodeNode) {
    const component = graph.nodes.find((node) => node.level === 'component')!
    graph.nodes.push({
      ...component,
      id: 'code-node',
      level: 'code',
      elementType: 'code_element',
    })
  }
  const getNodeContext = vi.fn()
  useWorkbenchStore.setState({
    client: { getNodeContext } as unknown as ProjectOSApi,
    project: workspace.project,
    graph,
    tree: workspace.semanticTree,
    selectedNodeId: 'feat_home',
    selectedFilePath: 'app/home/page.tsx',
    chatMode: 'change',
    rightPanelTab: 'harness',
    rightPanelOpen: false,
    contextLoading: false,
  })
  return { getNodeContext }
}

function snapshotTransition(state: ReturnType<typeof useWorkbenchStore.getState>) {
  return {
    selectedNodeId: state.selectedNodeId,
    selectedFilePath: state.selectedFilePath,
    pendingFileOwnerChoice: state.pendingFileOwnerChoice,
    fileScopeError: state.fileScopeError,
    chatMode: state.chatMode,
    rightPanelTab: state.rightPanelTab,
    rightPanelOpen: state.rightPanelOpen,
    centerTab: state.centerTab,
    contextLoading: state.contextLoading,
  }
}
