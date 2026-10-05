import { create } from 'zustand'
import type { MapArtifact } from '@contracts/index'
import { isDesktopApp } from '../data/clientMode'
import { useWorkbenchStore } from './workbenchStore'
import { useBottomDockStore } from './bottomDockStore'
import { createClientId } from '../utils/clientId'
import {
  DEFAULT_SHELL_TITLE,
  TERMINAL_OUTPUT_BUFFER_MAX,
  type TerminalPane,
  type TerminalSplitDirection,
  type TerminalTab,
} from '../components/Terminal/terminalTypes'

function tabId(): string {
  return createClientId()
}

function createPane(): TerminalPane {
  return { id: tabId(), tabIds: [], activeTabId: null }
}

function initialState() {
  const pane = createPane()
  return {
    splitDirection: null as TerminalSplitDirection | null,
    panes: [pane],
    tabs: {} as Record<string, TerminalTab>,
    focusedPaneId: pane.id,
    mapSessions: {} as Record<string, string>,
    focusedMapArtifactId: null as string | null,
  }
}

function shellTitle(existing: TerminalTab[]): string {
  const count = existing.filter((t) => t.title.startsWith(DEFAULT_SHELL_TITLE)).length
  if (count === 0) return DEFAULT_SHELL_TITLE
  return `${DEFAULT_SHELL_TITLE} (${count + 1})`
}

function appendToBuffer(current: string, chunk: string): string {
  const next = current + chunk
  if (next.length <= TERMINAL_OUTPUT_BUFFER_MAX) return next
  return next.slice(next.length - TERMINAL_OUTPUT_BUFFER_MAX)
}

const tabOutputBuffers = new Map<string, string>()

export function getTabOutputBuffer(tabId: string): string {
  return tabOutputBuffers.get(tabId) ?? ''
}

function setTabOutputBuffer(tabId: string, buffer: string): void {
  tabOutputBuffers.set(tabId, buffer)
}

function appendTabOutputBuffer(tabId: string, chunk: string): string {
  const next = appendToBuffer(getTabOutputBuffer(tabId), chunk)
  setTabOutputBuffer(tabId, next)
  return next
}

function clearTabOutputBuffer(tabId: string): void {
  tabOutputBuffers.delete(tabId)
}

function clearAllTabOutputBuffers(): void {
  tabOutputBuffers.clear()
}

function findPaneByTabId(panes: TerminalPane[], tabId: string): TerminalPane | undefined {
  return panes.find((pane) => pane.tabIds.includes(tabId))
}

function findTabByPtyId(tabs: Record<string, TerminalTab>, ptyId: string): TerminalTab | undefined {
  return Object.values(tabs).find((tab) => tab.ptyId === ptyId)
}

function findMapArtifactIdByTabId(
  mapSessions: Record<string, string>,
  tabId: string,
): string | undefined {
  return Object.entries(mapSessions).find(([, id]) => id === tabId)?.[0]
}

function hasDockTabs(state: ReturnType<typeof initialState>): boolean {
  return state.panes.some((pane) => pane.tabIds.length > 0)
}

function isTabVisible(
  state: ReturnType<typeof initialState>,
  tabId: string,
): boolean {
  const mapArtifactId = findMapArtifactIdByTabId(state.mapSessions, tabId)
  if (mapArtifactId) {
    return state.focusedMapArtifactId === mapArtifactId
  }
  if (!useBottomDockStore.getState().open) return false
  const pane = findPaneByTabId(state.panes, tabId)
  if (!pane) return false
  return pane.activeTabId === tabId
}

async function spawnPtyForTab(tabId: string, cwd: string): Promise<void> {
  if (!isDesktopApp() || !window.projectOS?.terminal || !cwd) return

  try {
    const ptyId = await window.projectOS.terminal.create(cwd)
    setTabState(tabId, (tab) => ({ ...tab, ptyId }))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const outputBuffer = appendTabOutputBuffer(tabId, `\r\n${detail}\r\n`)
    setTabState(tabId, (tab) => ({
      ...tab,
      outputBuffer,
    }))
  }
}

function setTabState(
  tabId: string,
  updater: (tab: TerminalTab) => TerminalTab,
): void {
  useTerminalStore.setState((s) => {
    const current = s.tabs[tabId]
    if (!current) return s
    return {
      tabs: {
        ...s.tabs,
        [tabId]: updater(current),
      },
    }
  })
}

let ipcSubscribed = false
let ipcDisposables: Array<{ dispose(): void }> = []

interface TerminalStore extends ReturnType<typeof initialState> {
  initIpcListeners: () => void
  disposeIpcListeners: () => void
  togglePanel: () => void
  openPanel: () => void
  closePanel: () => void
  createTab: (paneId?: string, cwd?: string) => Promise<string | null>
  closeTab: (tabId: string) => Promise<void>
  setActiveTab: (paneId: string, tabId: string) => void
  setFocusedPane: (paneId: string) => void
  killActiveTab: () => Promise<void>
  killPaneActiveTab: (paneId: string) => Promise<void>
  splitTerminal: (direction: TerminalSplitDirection) => Promise<void>
  cycleActiveTab: (direction: 1 | -1) => void
  disposeAllSessions: () => Promise<void>
  appendOutput: (ptyId: string, data: string) => void
  markPtyExit: (ptyId: string, exitCode: number) => void
  writeToActivePty: (data: string) => void
  getActivePtyId: () => string | null
  resetState: () => void
  createMapSession: (
    artifactId: string,
    options?: { title?: string; cwd?: string },
  ) => Promise<void>
  disposeMapSession: (artifactId: string) => Promise<void>
  syncMapSessions: (artifacts: MapArtifact[]) => Promise<void>
  getMapTabId: (artifactId: string) => string | undefined
  setFocusedMapArtifact: (artifactId: string | null) => void
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  ...initialState(),

  initIpcListeners: () => {
    if (ipcSubscribed || !isDesktopApp()) return
    const bridge = window.projectOS
    if (!bridge?.terminal) return

    ipcSubscribed = true
    ipcDisposables = [
      bridge.terminal.onData((ptyId, data) => {
        get().appendOutput(ptyId, data)
      }),
      bridge.terminal.onExit((ptyId, exitCode) => {
        get().markPtyExit(ptyId, exitCode)
      }),
    ]
  },

  disposeIpcListeners: () => {
    for (const disposable of ipcDisposables) {
      disposable.dispose()
    }
    ipcDisposables = []
    ipcSubscribed = false
  },

  togglePanel: () => useBottomDockStore.getState().togglePanel(),

  openPanel: () => useBottomDockStore.getState().openPanel('terminal'),

  closePanel: () => useBottomDockStore.getState().closePanel(),

  createTab: async (paneId, cwd) => {
    const state = get()
    const pane = state.panes.find((p) => p.id === (paneId ?? state.focusedPaneId)) ?? state.panes[0]
    if (!pane) return null

    const resolvedCwd =
      cwd ?? useWorkbenchStore.getState().project?.workspaceRoot ?? ''
    const id = tabId()
    const title = shellTitle(Object.values(state.tabs))
    const tab: TerminalTab = {
      id,
      ptyId: null,
      title,
      cwd: resolvedCwd,
      exited: false,
      exitCode: null,
      hasUnread: false,
      outputBuffer: '',
    }

    set((s) => ({
      tabs: { ...s.tabs, [id]: tab },
      panes: s.panes.map((p) =>
        p.id === pane.id
          ? { ...p, tabIds: [...p.tabIds, id], activeTabId: id }
          : p,
      ),
      focusedPaneId: pane.id,
    }))
    setTabOutputBuffer(id, '')

    if (resolvedCwd) {
      await spawnPtyForTab(id, resolvedCwd)
    }

    return id
  },

  closeTab: async (tabId) => {
    const state = get()
    const tab = state.tabs[tabId]
    if (!tab) return

    if (tab.ptyId && isDesktopApp() && window.projectOS?.terminal) {
      await window.projectOS.terminal.kill(tab.ptyId)
    }

    const pane = findPaneByTabId(state.panes, tabId)
    if (!pane) return

    const nextTabs = { ...state.tabs }
    delete nextTabs[tabId]

    let nextPanes = state.panes.map((p) => {
      if (p.id !== pane.id) return p
      const tabIds = p.tabIds.filter((id) => id !== tabId)
      let activeTabId = p.activeTabId
      if (activeTabId === tabId) {
        activeTabId = tabIds[tabIds.length - 1] ?? null
      }
      return { ...p, tabIds, activeTabId }
    })

    let splitDirection = state.splitDirection
    let focusedPaneId = state.focusedPaneId

    const emptyPane = nextPanes.find((p) => p.tabIds.length === 0)
    if (emptyPane && nextPanes.length > 1) {
      nextPanes = nextPanes.filter((p) => p.id !== emptyPane.id)
      splitDirection = null
      focusedPaneId = nextPanes[0]?.id ?? focusedPaneId
    }

    set({
      tabs: nextTabs,
      panes: nextPanes,
      splitDirection,
      focusedPaneId,
    })
    clearTabOutputBuffer(tabId)
  },

  setActiveTab: (paneId, tabId) => {
    set((s) => ({
      focusedPaneId: paneId,
      panes: s.panes.map((pane) => {
        if (pane.id !== paneId) return pane
        return {
          ...pane,
          activeTabId: tabId,
        }
      }),
      tabs: {
        ...s.tabs,
        [tabId]: s.tabs[tabId]
          ? { ...s.tabs[tabId], hasUnread: false }
          : s.tabs[tabId],
      },
    }))
  },

  setFocusedPane: (paneId) => set({ focusedPaneId: paneId }),

  killActiveTab: async () => {
    const state = get()
    const pane = state.panes.find((p) => p.id === state.focusedPaneId)
    if (!pane?.activeTabId) return
    await get().closeTab(pane.activeTabId)
  },

  killPaneActiveTab: async (paneId) => {
    const pane = get().panes.find((p) => p.id === paneId)
    if (!pane?.activeTabId) return
    await get().closeTab(pane.activeTabId)
  },

  splitTerminal: async (direction) => {
    const state = get()
    if (state.panes.length >= 2) return

    const newPane = createPane()
    set({
      splitDirection: direction,
      panes: [...state.panes, newPane],
      focusedPaneId: newPane.id,
    })
    await get().createTab(newPane.id)
  },

  cycleActiveTab: (direction) => {
    const state = get()
    const pane = state.panes.find((p) => p.id === state.focusedPaneId)
    if (!pane || pane.tabIds.length <= 1 || !pane.activeTabId) return

    const currentIndex = pane.tabIds.indexOf(pane.activeTabId)
    if (currentIndex < 0) return
    const nextIndex = (currentIndex + direction + pane.tabIds.length) % pane.tabIds.length
    get().setActiveTab(pane.id, pane.tabIds[nextIndex])
  },

  disposeAllSessions: async () => {
    const state = get()
    if (isDesktopApp() && window.projectOS?.terminal) {
      await Promise.all(
        Object.values(state.tabs).map(async (tab) => {
          if (tab.ptyId) {
            await window.projectOS!.terminal.kill(tab.ptyId)
          }
        }),
      )
    }
    get().resetState()
  },

  appendOutput: (ptyId, data) => {
    const tab = findTabByPtyId(get().tabs, ptyId)
    if (!tab) return

    const nextBuffer = appendTabOutputBuffer(tab.id, data)

    set((s) => {
      const current = s.tabs[tab.id]
      if (!current) return s

      const visible = isTabVisible(s, tab.id)
      if (visible) return s

      return {
        tabs: {
          ...s.tabs,
          [tab.id]: {
            ...current,
            outputBuffer: nextBuffer,
            hasUnread: true,
          },
        },
      }
    })
  },

  markPtyExit: (ptyId, exitCode) => {
    const tab = findTabByPtyId(get().tabs, ptyId)
    if (!tab) return

    const outputBuffer = appendTabOutputBuffer(tab.id, '\r\n\r\n[process exited]\r\n')

    set((s) => ({
      tabs: {
        ...s.tabs,
        [tab.id]: {
          ...s.tabs[tab.id],
          exited: true,
          exitCode,
          outputBuffer,
        },
      },
    }))
  },

  writeToActivePty: (data) => {
    const ptyId = get().getActivePtyId()
    if (!ptyId || !isDesktopApp() || !window.projectOS?.terminal) return
    window.projectOS.terminal.write(ptyId, data)
  },

  getActivePtyId: () => {
    const state = get()
    const pane = state.panes.find((p) => p.id === state.focusedPaneId)
    if (!pane?.activeTabId) return null
    return state.tabs[pane.activeTabId]?.ptyId ?? null
  },

  resetState: () => {
    const pane = createPane()
    clearAllTabOutputBuffers()
    useBottomDockStore.getState().resetState()
    set({
      splitDirection: null,
      panes: [pane],
      tabs: {},
      focusedPaneId: pane.id,
      mapSessions: {},
      focusedMapArtifactId: null,
    })
  },

  createMapSession: async (artifactId, options = {}) => {
    const state = get()
    if (state.mapSessions[artifactId]) return

    const resolvedCwd =
      options.cwd ?? useWorkbenchStore.getState().project?.workspaceRoot ?? ''
    const id = tabId()
    const title = options.title?.trim() || shellTitle(Object.values(state.tabs))
    const tab: TerminalTab = {
      id,
      ptyId: null,
      title,
      cwd: resolvedCwd,
      exited: false,
      exitCode: null,
      hasUnread: false,
      outputBuffer: '',
    }

    set((s) => ({
      tabs: { ...s.tabs, [id]: tab },
      mapSessions: { ...s.mapSessions, [artifactId]: id },
    }))
    setTabOutputBuffer(id, '')

    if (resolvedCwd) {
      await spawnPtyForTab(id, resolvedCwd)
    }
  },

  disposeMapSession: async (artifactId) => {
    const state = get()
    const sessionTabId = state.mapSessions[artifactId]
    if (!sessionTabId) return

    const tab = state.tabs[sessionTabId]
    if (tab?.ptyId && isDesktopApp() && window.projectOS?.terminal) {
      await window.projectOS.terminal.kill(tab.ptyId)
    }

    const nextTabs = { ...state.tabs }
    delete nextTabs[sessionTabId]
    const nextMapSessions = { ...state.mapSessions }
    delete nextMapSessions[artifactId]

    set({
      tabs: nextTabs,
      mapSessions: nextMapSessions,
      focusedMapArtifactId:
        state.focusedMapArtifactId === artifactId ? null : state.focusedMapArtifactId,
    })
    clearTabOutputBuffer(sessionTabId)
  },

  syncMapSessions: async (artifacts) => {
    const terminalArtifacts = artifacts.filter(
      (artifact): artifact is Extract<MapArtifact, { type: 'terminal' }> =>
        artifact.type === 'terminal',
    )
    const state = get()
    const artifactIds = new Set(terminalArtifacts.map((artifact) => artifact.id))

    for (const artifactId of Object.keys(state.mapSessions)) {
      if (!artifactIds.has(artifactId)) {
        await get().disposeMapSession(artifactId)
      }
    }

    for (const artifact of terminalArtifacts) {
      if (!get().mapSessions[artifact.id]) {
        await get().createMapSession(artifact.id, {
          title: artifact.terminal.title,
          cwd: artifact.terminal.cwd,
        })
      }
    }
  },

  getMapTabId: (artifactId) => get().mapSessions[artifactId],

  setFocusedMapArtifact: (artifactId) => set({ focusedMapArtifactId: artifactId }),
}))
