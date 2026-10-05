import { create } from 'zustand'
import type { DiagnosticItem, DiagnosticSeverity } from '@contracts/index'
import { useBottomDockStore } from './bottomDockStore'
import { lspClient } from '../lsp/lspClient'
import { isDesktopApp } from '../data/clientMode'

export type DiagnosticFilter = 'all' | 'error' | 'warning'

const DEMO_DIAGNOSTICS: DiagnosticItem[] = [
  {
    id: 'demo-1',
    filePath: 'app/login/page.tsx',
    line: 12,
    column: 5,
    severity: 'error',
    message: "Property 'redirectTo' does not exist on type 'LoginFormProps'.",
    source: 'typescript',
    code: 2339,
  },
]

interface DiagnosticsStore {
  items: DiagnosticItem[]
  filter: DiagnosticFilter
  initialized: boolean
  init: (workspaceRoot: string | null) => Promise<void>
  dispose: () => Promise<void>
  setFilter: (filter: DiagnosticFilter) => void
  getFilteredItems: () => DiagnosticItem[]
  getItemsForFile: (filePath: string) => DiagnosticItem[]
  getErrorCount: () => number
}

let messageCleanup: (() => void) | null = null

function updateBadge(items: DiagnosticItem[]): void {
  useBottomDockStore.getState().setBadgeCount(
    'diagnostics',
    items.filter((item) => item.severity === 'error').length,
  )
}

function mergeItems(existing: DiagnosticItem[], incoming: DiagnosticItem[], filePath: string): DiagnosticItem[] {
  const others = existing.filter((item) => item.filePath !== filePath)
  return [...others, ...incoming]
}

export const useDiagnosticsStore = create<DiagnosticsStore>((set, get) => ({
  items: isDesktopApp() ? [] : DEMO_DIAGNOSTICS,
  filter: 'all',
  initialized: false,

  init: async (workspaceRoot) => {
    if (get().initialized) return

    messageCleanup?.()
    messageCleanup = null

    if (!isDesktopApp() || !workspaceRoot) {
      set({ items: DEMO_DIAGNOSTICS, initialized: true })
      updateBadge(DEMO_DIAGNOSTICS)
      return
    }

    messageCleanup = lspClient.onMessage((message) => {
      if (message.type === 'diagnostics') {
        const uri = String(message.uri)
        const root = lspClient.getWorkspaceRoot()
        if (!root) return
        const prefix = `file://${root.replace(/\\/g, '/').replace(/\/$/, '')}/`
        const filePath = uri.startsWith(prefix) ? uri.slice(prefix.length) : uri
        const items = (message.items as DiagnosticItem[]) ?? []
        set((state) => {
          const merged = mergeItems(state.items, items, filePath)
          updateBadge(merged)
          return { items: merged }
        })
      }
    })

    await lspClient.start(workspaceRoot)
    if (!lspClient.isAvailable()) {
      const reason = lspClient.getUnavailableReason()
      if (reason) {
        console.warn('[diagnostics]', reason)
      }
    }
    set({ initialized: true, items: [] })
    updateBadge([])
  },

  dispose: async () => {
    messageCleanup?.()
    messageCleanup = null
    await lspClient.stop()
    const items = isDesktopApp() ? [] : DEMO_DIAGNOSTICS
    set({ items, initialized: false, filter: 'all' })
    updateBadge(items)
  },

  setFilter: (filter) => set({ filter }),

  getFilteredItems: () => {
    const { items, filter } = get()
    if (filter === 'all') return items
    return items.filter((item) => item.severity === filter)
  },

  getItemsForFile: (filePath) => get().items.filter((item) => item.filePath === filePath),

  getErrorCount: () => get().items.filter((item) => item.severity === 'error').length,
}))

export function severityRank(severity: DiagnosticSeverity): number {
  switch (severity) {
    case 'error':
      return 0
    case 'warning':
      return 1
    case 'info':
      return 2
    default:
      return 3
  }
}
