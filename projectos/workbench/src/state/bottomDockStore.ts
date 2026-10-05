import { create } from 'zustand'
import { useTerminalStore } from './terminalStore'

export type BottomDockView = 'terminal' | 'activity' | 'services' | 'diagnostics'

export type BottomDockBadgeCounts = Partial<Record<BottomDockView, number>>

interface BottomDockStore {
  open: boolean
  activeView: BottomDockView
  badgeCounts: BottomDockBadgeCounts
  togglePanel: () => void
  openPanel: (view?: BottomDockView) => void
  closePanel: () => void
  setActiveView: (view: BottomDockView) => void
  setBadgeCount: (view: BottomDockView, count: number) => void
  resetState: () => void
}

function ensureTerminalTab(): void {
  const terminal = useTerminalStore.getState()
  const hasDockTabs = terminal.panes.some((pane) => pane.tabIds.length > 0)
  if (!hasDockTabs) {
    void terminal.createTab()
  }
}

export const useBottomDockStore = create<BottomDockStore>((set, get) => ({
  open: false,
  activeView: 'terminal',
  badgeCounts: {},

  togglePanel: () => {
    const { open } = get()
    if (!open) {
      set({ open: true, activeView: 'terminal' })
      ensureTerminalTab()
      return
    }
    set({ open: false })
  },

  openPanel: (view = 'terminal') => {
    set({ open: true, activeView: view })
    if (view === 'terminal') {
      ensureTerminalTab()
    }
  },

  closePanel: () => set({ open: false }),

  setActiveView: (view) => {
    set({ activeView: view, open: true })
    if (view === 'terminal') {
      ensureTerminalTab()
    }
  },

  setBadgeCount: (view, count) => {
    set((state) => {
      const nextCount = count > 0 ? count : undefined
      if (state.badgeCounts[view] === nextCount) return state
      return {
        badgeCounts: {
          ...state.badgeCounts,
          [view]: nextCount,
        },
      }
    })
  },

  resetState: () => {
    set({ open: false, activeView: 'terminal', badgeCounts: {} })
  },
}))
