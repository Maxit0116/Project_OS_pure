import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ContextPayload, ProjectOSApi } from '@contracts/index'
import { createMockSampleWorkspace } from '../../../client/mock-project-os-api-client.js'
import { initialEditorLayout } from '../components/CodeEditor/editorPaneHelpers'
import { useWorkbenchStore } from './workbenchStore'

const FILE_PATH = 'app/login/page.tsx'

const originalClient = useWorkbenchStore.getState().client

function fileContext(workspace: ReturnType<typeof createMockSampleWorkspace>): ContextPayload {
  const node = workspace.graph.nodes.find((candidate) => candidate.id === 'feat_login')!
  return {
    scope: 'file',
    projectId: workspace.project.projectId,
    nodeId: node.id,
    filePath: FILE_PATH,
    title: FILE_PATH,
    summary: node.summary,
    linkedFiles: node.linkedFiles,
    upstream: node.upstream,
    downstream: node.downstream,
    recentChanges: [],
    rawContextMarkdown: node.summary,
  }
}

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
    editorBuffers: {},
    editorSavedBuffers: {},
    ...initialEditorLayout(),
  })
})

describe('workbenchStore.selectFile', () => {
  it('skips getFileContent when the file is already loaded from disk', async () => {
    const workspace = createMockSampleWorkspace()
    const getFileContext = vi.fn(async () => fileContext(workspace))
    const getFileContent = vi.fn(async () => 'disk content')

    useWorkbenchStore.setState({
      client: { getFileContext, getFileContent } as unknown as ProjectOSApi,
      project: workspace.project,
      graph: workspace.graph,
      tree: workspace.semanticTree,
      editorBuffers: { [FILE_PATH]: 'cached buffer' },
      editorSavedBuffers: { [FILE_PATH]: 'cached buffer' },
      context: fileContext(workspace),
    })

    await useWorkbenchStore.getState().selectFile(FILE_PATH)

    expect(getFileContent).not.toHaveBeenCalled()
    expect(useWorkbenchStore.getState().editorBuffers[FILE_PATH]).toBe('cached buffer')
    expect(useWorkbenchStore.getState().selectedFilePath).toBe(FILE_PATH)
    expect(useWorkbenchStore.getState().contextLoading).toBe(false)
  })

  it('does not overwrite a dirty buffer when re-selecting the same file', async () => {
    const workspace = createMockSampleWorkspace()
    const getFileContext = vi.fn(async () => fileContext(workspace))
    const getFileContent = vi.fn(async () => 'disk content')

    useWorkbenchStore.setState({
      client: { getFileContext, getFileContent } as unknown as ProjectOSApi,
      project: workspace.project,
      graph: workspace.graph,
      tree: workspace.semanticTree,
      editorBuffers: { [FILE_PATH]: 'edited content' },
      editorSavedBuffers: { [FILE_PATH]: 'saved content' },
      context: fileContext(workspace),
    })

    await useWorkbenchStore.getState().selectFile(FILE_PATH)

    expect(getFileContent).not.toHaveBeenCalled()
    expect(useWorkbenchStore.getState().editorBuffers[FILE_PATH]).toBe('edited content')
  })

  it('switches to the code tab from function-map, spatial captures, or browser', async () => {
    const workspace = createMockSampleWorkspace()
    const context = fileContext(workspace)
    const getFileContext = vi.fn(async () => context)
    const getFileContent = vi.fn(async () => 'disk content')

    for (const centerTab of ['function-map', 'spatial-captures', 'browser'] as const) {
      useWorkbenchStore.setState({
        client: { getFileContext, getFileContent } as unknown as ProjectOSApi,
        project: workspace.project,
        graph: workspace.graph,
        tree: workspace.semanticTree,
        editorBuffers: { [FILE_PATH]: 'cached buffer' },
        editorSavedBuffers: { [FILE_PATH]: 'cached buffer' },
        context,
        centerTab,
        selectedFilePath: null,
      })

      await useWorkbenchStore.getState().selectFile(FILE_PATH)

      expect(useWorkbenchStore.getState()).toMatchObject({
        centerTab: 'code',
        codeSubTab: 'editor',
        selectedFilePath: FILE_PATH,
      })
    }
  })

  it('does not show context loading when file context is already loaded', async () => {
    const workspace = createMockSampleWorkspace()
    const context = fileContext(workspace)
    const getFileContext = vi.fn(async () => context)
    const getFileContent = vi.fn(async () => 'disk content')

    useWorkbenchStore.setState({
      client: { getFileContext, getFileContent } as unknown as ProjectOSApi,
      project: workspace.project,
      graph: workspace.graph,
      tree: workspace.semanticTree,
      context,
    })

    await useWorkbenchStore.getState().selectFile(FILE_PATH)

    expect(getFileContext).not.toHaveBeenCalled()
    expect(useWorkbenchStore.getState().contextLoading).toBe(false)
  })
})
