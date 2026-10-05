import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapArtifact } from '@contracts/index'

const { workbenchState } = vi.hoisted(() => ({
  workbenchState: {
    project: null,
  } as { project: { workspaceRoot: string } | null },
}))

vi.mock('./workbenchStore', () => ({
  useWorkbenchStore: {
    getState: () => workbenchState,
  },
}))

import { useTerminalStore } from './terminalStore'
import { useBottomDockStore } from './bottomDockStore'

function terminalArtifact(
  id: string,
  terminal: { title?: string; cwd?: string } = {},
): MapArtifact {
  return {
    id,
    type: 'terminal',
    scope: 'project',
    position: { x: 0, y: 0 },
    size: { width: 420, height: 280 },
    terminal,
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
  }
}

describe('terminalStore cwd and session ownership', () => {
  beforeEach(() => {
    workbenchState.project = null
    useBottomDockStore.getState().resetState()
    useTerminalStore.getState().resetState()
  })

  it('prefers an explicit dock-tab cwd over the current workspace root', async () => {
    workbenchState.project = { workspaceRoot: '/workspace/current' }

    const tabId = await useTerminalStore.getState().createTab(undefined, '/workspace/explicit')

    expect(tabId).not.toBeNull()
    expect(useTerminalStore.getState().tabs[tabId!].cwd).toBe('/workspace/explicit')
  })

  it('resolves a new dock tab against the workspace active at creation time', async () => {
    workbenchState.project = { workspaceRoot: '/workspace/first' }
    const firstTabId = await useTerminalStore.getState().createTab()

    workbenchState.project = { workspaceRoot: '/workspace/second' }
    const secondTabId = await useTerminalStore.getState().createTab()

    expect(useTerminalStore.getState().tabs[firstTabId!].cwd).toBe('/workspace/first')
    expect(useTerminalStore.getState().tabs[secondTabId!].cwd).toBe('/workspace/second')
  })

  it('creates dock tabs in a pane and map sessions outside dock panes', async () => {
    workbenchState.project = { workspaceRoot: '/workspace/current' }
    const dockTabId = await useTerminalStore.getState().createTab()
    await useTerminalStore.getState().createMapSession('terminal-card', {
      title: 'API shell',
    })

    const state = useTerminalStore.getState()
    const mapTabId = state.mapSessions['terminal-card']

    expect(state.panes[0].tabIds).toContain(dockTabId)
    expect(state.panes[0].tabIds).not.toContain(mapTabId)
    expect(state.tabs[mapTabId]).toMatchObject({
      title: 'API shell',
      cwd: '/workspace/current',
    })
  })

  it('uses artifact cwd during sync and removes sessions for deleted artifacts', async () => {
    workbenchState.project = { workspaceRoot: '/workspace/current' }
    await useTerminalStore.getState().syncMapSessions([
      terminalArtifact('terminal-card', {
        title: 'Worker shell',
        cwd: '/workspace/artifact',
      }),
    ])

    const mapTabId = useTerminalStore.getState().mapSessions['terminal-card']
    expect(useTerminalStore.getState().tabs[mapTabId]).toMatchObject({
      title: 'Worker shell',
      cwd: '/workspace/artifact',
    })

    await useTerminalStore.getState().syncMapSessions([])

    expect(useTerminalStore.getState().mapSessions).toEqual({})
    expect(useTerminalStore.getState().tabs[mapTabId]).toBeUndefined()
  })

  it('disposes dock and map sessions before a workspace replacement', async () => {
    workbenchState.project = { workspaceRoot: '/workspace/first' }
    await useTerminalStore.getState().createTab()
    await useTerminalStore.getState().createMapSession('terminal-card')
    useTerminalStore.getState().openPanel()
    useTerminalStore.getState().setFocusedMapArtifact('terminal-card')

    await useTerminalStore.getState().disposeAllSessions()

    const reset = useTerminalStore.getState()
    expect(reset.tabs).toEqual({})
    expect(reset.mapSessions).toEqual({})
    expect(useBottomDockStore.getState().open).toBe(false)
    expect(reset.focusedMapArtifactId).toBeNull()
    expect(reset.panes).toHaveLength(1)
    expect(reset.panes[0].tabIds).toEqual([])

    workbenchState.project = { workspaceRoot: '/workspace/second' }
    const replacementTabId = await reset.createTab()
    expect(useTerminalStore.getState().tabs[replacementTabId!].cwd).toBe('/workspace/second')
  })
})
