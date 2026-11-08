import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectGraph, SemanticTree } from '@contracts/index'
import type { ProjectOSApi } from '@contracts/api'

import { useWorkbenchStore } from './workbenchStore'

const graphAfter = { nodes: [{ id: 'feat_team', name: 'Team & Roles' }] } as unknown as ProjectGraph
const graphBefore = { nodes: [] } as unknown as ProjectGraph
const tree = { roots: [] } as unknown as SemanticTree

function setup(overrides: Partial<ProjectOSApi> = {}, state: Record<string, unknown> = {}) {
  const client = {
    assignFileOwner: vi.fn(async () => graphAfter),
    getProjectGraph: vi.fn(async () => graphAfter),
    getSemanticTree: vi.fn(async () => tree),
    ...overrides,
  } as unknown as ProjectOSApi
  const selectFile = vi.fn(async () => undefined)
  useWorkbenchStore.setState({
    client,
    project: { projectId: 'project_1' } as never,
    graph: graphBefore,
    tree: null,
    selectedFilePath: 'lib/validators.ts',
    selectedNodeId: null,
    fileScopeError: 'not_mapped',
    locale: 'en',
    toasts: [],
    error: null,
    selectFile,
    ...state,
  } as never)
  return { client, selectFile }
}

describe('assignFileOwner', () => {
  beforeEach(() => {
    useWorkbenchStore.setState({ toasts: [], error: null } as never)
  })

  it('links the unowned file, reloads the graph and tree, and selects the file under its new owner', async () => {
    const { client, selectFile } = setup()

    await useWorkbenchStore.getState().assignFileOwner('feat_team')

    expect(client.assignFileOwner).toHaveBeenCalledWith('project_1', 'lib/validators.ts', 'feat_team')
    expect(useWorkbenchStore.getState().graph).toBe(graphAfter)
    expect(useWorkbenchStore.getState().tree).toBe(tree)
    expect(selectFile).toHaveBeenCalledWith('lib/validators.ts', 'feat_team')
    expect(useWorkbenchStore.getState().toasts.at(-1)?.message).toMatch(/lib\/validators\.ts.*Team & Roles|Team & Roles.*lib\/validators\.ts/u)
  })

  it('does nothing for a file that already has an owner', async () => {
    const { client } = setup({}, { fileScopeError: null })

    await useWorkbenchStore.getState().assignFileOwner('feat_team')

    expect(client.assignFileOwner).not.toHaveBeenCalled()
  })

  it('shows the failure and leaves the graph as it was when the server refuses', async () => {
    const { selectFile } = setup({
      assignFileOwner: vi.fn(async () => { throw new Error('file_already_owned') }),
    })

    await useWorkbenchStore.getState().assignFileOwner('feat_team')

    expect(useWorkbenchStore.getState().graph).toBe(graphBefore)
    expect(useWorkbenchStore.getState().error).toBeTruthy()
    expect(selectFile).not.toHaveBeenCalled()
  })
})
