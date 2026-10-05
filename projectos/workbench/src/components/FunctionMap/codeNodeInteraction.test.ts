import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ContextPayload, ProjectOSApi } from '@contracts/index'
import { createMockSampleWorkspace } from '../../../../client/mock-project-os-api-client.js'
import { canSubmitAgentPrompt, useWorkbenchStore } from '../../state/workbenchStore'
import {
  codeNodeDisplayTitle,
  codeNodeFilePath,
  focusCodeNodeForMap,
  isCodeElementNode,
  openCodeNodeFile,
  type CodeNodeTarget,
} from './codeNodeInteraction'

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
    centerTab: 'function-map',
    codeSubTab: 'editor',
  })
})

describe('code-node selection paths', () => {
  it('uses file purpose as the display title and keeps the path separate', () => {
    const node = {
      id: 'code-file-login',
      type: 'capability' as const,
      name: 'app/login/page.tsx',
      status: 'active' as const,
      description: '展示登录页面',
      summary: '展示登录页面',
      responsibility: '展示登录页面',
      elementType: 'code_element' as const,
      level: 'code' as const,
      linkedFiles: [{ path: 'app/login/page.tsx', role: 'primary' as const }],
      upstream: [],
      downstream: [],
      confidence: 1,
      tags: [],
      parentId: 'feat_login',
      children: [],
      refs: [],
      depth: 3,
    }

    expect(isCodeElementNode(node)).toBe(true)
    expect(codeNodeDisplayTitle(node)).toBe('展示登录页面')
    expect(codeNodeFilePath(node)).toBe('app/login/page.tsx')
  })

  it('keeps plain focus node-planner scoped and grants direct file scope only through open file', async () => {
    const workspace = createMockSampleWorkspace()
    const owner = workspace.graph.nodes.find((node) => node.id === 'feat_login')!
    const target: CodeNodeTarget = {
      nodeId: 'code-file-login',
      filePath: 'app/login/page.tsx',
      parentNodeId: owner.id,
    }
    const getNodeContext = vi.fn(async () => nodeContext(
      workspace.project.projectId,
      owner.id,
      owner.name,
    ))
    const getFileContext = vi.fn(async () => ({
      ...nodeContext(workspace.project.projectId, owner.id, target.filePath),
      scope: 'file' as const,
      filePath: target.filePath,
    }))
    useWorkbenchStore.setState({
      client: { getNodeContext, getFileContext } as unknown as ProjectOSApi,
      project: workspace.project,
      graph: workspace.graph,
      tree: workspace.semanticTree,
      selectedNodeId: 'feat_home',
      selectedFilePath: 'app/home/page.tsx',
      pendingFileOwnerChoice: null,
      fileScopeError: null,
      chatMode: 'change',
      centerTab: 'function-map',
    })
    const focusCodeNode = vi.fn()
    const selectFile = vi.fn(useWorkbenchStore.getState().selectFile)

    await focusCodeNodeForMap(target, {
      focusCodeNode,
      selectNode: useWorkbenchStore.getState().selectNode,
    })

    expect(focusCodeNode).toHaveBeenCalledWith(target.nodeId)
    expect(selectFile).not.toHaveBeenCalled()
    expect(useWorkbenchStore.getState()).toMatchObject({
      selectedNodeId: owner.id,
      selectedFilePath: null,
      centerTab: 'function-map',
    })
    expect(canSubmitAgentPrompt(useWorkbenchStore.getState())).toBe(true)
    expect(useWorkbenchStore.getState().selectedFilePath).toBeNull()

    await openCodeNodeFile(target, selectFile)

    expect(selectFile).toHaveBeenCalledWith(target.filePath, owner.id)
    expect(useWorkbenchStore.getState()).toMatchObject({
      selectedNodeId: owner.id,
      selectedFilePath: target.filePath,
      centerTab: 'code',
      codeSubTab: 'editor',
    })
    expect(canSubmitAgentPrompt(useWorkbenchStore.getState())).toBe(true)
  })

  it('opens the file-agent chat with the exact file write scope', async () => {
    const workspace = createMockSampleWorkspace()
    const owner = workspace.graph.nodes.find((node) => node.id === 'feat_login')!
    const path = 'app/login/page.tsx'
    const getFileContext = vi.fn(async () => ({
      ...nodeContext(workspace.project.projectId, owner.id, path),
      scope: 'file' as const,
      filePath: path,
    }))
    useWorkbenchStore.setState({
      client: { getFileContext } as unknown as ProjectOSApi,
      project: workspace.project,
      graph: workspace.graph,
      tree: workspace.semanticTree,
      chatMode: 'change',
      rightPanelTab: 'harness',
      rightPanelOpen: false,
    })

    await useWorkbenchStore.getState().openFileAgentChat(path, owner.id)

    expect(useWorkbenchStore.getState()).toMatchObject({
      selectedNodeId: owner.id,
      selectedFilePath: path,
      globalAgentActive: false,
      chatMode: 'ask',
      centerTab: 'function-map',
      rightPanelTab: 'chat',
      rightPanelOpen: true,
    })
    expect(canSubmitAgentPrompt(useWorkbenchStore.getState())).toBe(true)
  })
})

function nodeContext(
  projectId: string,
  nodeId: string,
  title: string,
): ContextPayload {
  return {
    scope: 'feature',
    projectId,
    nodeId,
    title,
    summary: title,
    linkedFiles: [],
    upstream: [],
    downstream: [],
    recentChanges: [],
    rawContextMarkdown: `# ${title}`,
  }
}
