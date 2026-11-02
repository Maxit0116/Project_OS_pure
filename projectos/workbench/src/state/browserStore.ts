import { create } from 'zustand'
import type { ElectronWebviewElement } from '../types/electron-webview'
import {
  createHomeBrowserTab,
  createPageBrowserTab,
  isBrowserHomeTab,
} from '../components/Browser/browserTabHelpers'
import {
  DEFAULT_BROWSER_URL,
  loadPersistedBrowserUrl,
  normalizeBrowserUrl,
  persistBrowserUrl,
} from '../components/Browser/browserUrl'
import { useWorkbenchStore } from './workbenchStore'
import { getStoreMessage } from '../i18n/storeMessages'

export interface BrowserWebviewController {
  goBack: () => void
  goForward: () => void
  reload: () => void
  loadURL: (url: string) => void
  syncNavigationState: () => void
}

export interface BrowserTab {
  id: string
  url: string
  title: string
  isHome: boolean
  isLoading: boolean
  error: string | null
  canGoBack: boolean
  canGoForward: boolean
}

/** Agent-generated (or user-created) HTML document shown in the Browser Docs rail. */
export interface BrowserHtmlDoc {
  id: string
  title: string
  html: string
  createdAt: string
  updatedAt: string
  /** Optional source hint — e.g. session / agent run id. */
  source?: string
}

export type BrowserSidebarMode = 'pages' | 'docs'

interface BrowserStore {
  tabs: BrowserTab[]
  activeTabId: string
  inputUrl: string
  controller: BrowserWebviewController | null

  /** Left-rail mode: URL tabs vs HTML docs. */
  sidebarMode: BrowserSidebarMode
  htmlDocs: BrowserHtmlDoc[]
  activeHtmlDocId: string | null

  getActiveTab: () => BrowserTab | undefined
  getActiveHtmlDoc: () => BrowserHtmlDoc | undefined

  setSidebarMode: (mode: BrowserSidebarMode) => void
  setInputUrl: (value: string) => void
  registerController: (controller: BrowserWebviewController | null) => void
  navigate: (rawUrl?: string) => boolean
  goBack: () => void
  goForward: () => void
  reload: () => void
  openExternal: () => Promise<void>
  onLoadStart: () => void
  onLoadStop: () => void
  onLoadFail: (description: string) => void
  onNavigate: (url: string) => void
  syncNavigationState: () => void

  createTab: (url?: string) => string
  closeTab: (tabId: string) => void
  switchTab: (tabId: string) => void
  reorderTab: (tabId: string, toIndex: number) => void
  openOrSwitchTab: (url: string) => void
  setTabTitle: (tabId: string, title: string) => void

  createHtmlDoc: (input?: { title?: string; html?: string; source?: string }) => string
  upsertHtmlDoc: (input: {
    id?: string
    title: string
    html: string
    source?: string
  }) => string
  closeHtmlDoc: (docId: string) => void
  switchHtmlDoc: (docId: string) => void
}

const initialUrl = loadPersistedBrowserUrl()
const initialHomeTab = createHomeBrowserTab()

function newHtmlDocId(): string {
  return `htmldoc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

function tabInputUrl(tab: BrowserTab | undefined, tabs: BrowserTab[]): string {
  if (!tab) return ''
  if (isBrowserHomeTab(tab)) {
    // Lone home tab is a blank "waiting" state — URL bar stays empty until the user types.
    return tabs.length === 1 ? '' : initialUrl
  }
  return tab.url
}

export const useBrowserStore = create<BrowserStore>((set, get) => ({
  tabs: [initialHomeTab],
  activeTabId: initialHomeTab.id,
  inputUrl: tabInputUrl(initialHomeTab, [initialHomeTab]),
  controller: null,
  sidebarMode: 'pages',
  htmlDocs: [],
  activeHtmlDocId: null,

  getActiveTab: () => {
    const { tabs, activeTabId } = get()
    return tabs.find((t) => t.id === activeTabId)
  },

  getActiveHtmlDoc: () => {
    const { htmlDocs, activeHtmlDocId } = get()
    if (!activeHtmlDocId) return undefined
    return htmlDocs.find((doc) => doc.id === activeHtmlDocId)
  },

  setSidebarMode: (mode) => set({ sidebarMode: mode }),

  setInputUrl: (value) => set({ inputUrl: value }),

  registerController: (controller) => set({ controller }),

  navigate: (rawUrl) => {
    const candidate = rawUrl ?? get().inputUrl
    const normalized = normalizeBrowserUrl(candidate)
    if (!normalized) {
      const locale = useWorkbenchStore.getState().locale
      useWorkbenchStore.getState().pushToast({
        type: 'error',
        message: getStoreMessage(locale, 'browser.urlRejected'),
      })
      return false
    }

    const { activeTabId, tabs } = get()
    const activeTab = tabs.find((t) => t.id === activeTabId)

    if (!activeTab) {
      persistBrowserUrl(normalized)
      get().createTab(normalized)
      return true
    }

    persistBrowserUrl(normalized)

    if (isBrowserHomeTab(activeTab)) {
      set({
        inputUrl: normalized,
        tabs: tabs.map((t) =>
          t.id === activeTabId
            ? {
                ...t,
                isHome: false,
                url: normalized,
                title: 'New Tab',
                error: null,
                isLoading: true,
                canGoBack: false,
                canGoForward: false,
              }
            : t,
        ),
      })
      return true
    }

    set({
      inputUrl: normalized,
      tabs: tabs.map((t) =>
        t.id === activeTabId
          ? { ...t, url: normalized, error: null, isLoading: true }
          : t,
      ),
    })
    get().controller?.loadURL(normalized)
    return true
  },

  goBack: () => {
    get().controller?.goBack()
  },

  goForward: () => {
    get().controller?.goForward()
  },

  reload: () => {
    const { activeTabId, tabs } = get()
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (!activeTab || isBrowserHomeTab(activeTab)) return
    set({
      tabs: tabs.map((t) =>
        t.id === activeTabId ? { ...t, error: null, isLoading: true } : t,
      ),
    })
    get().controller?.reload()
  },

  openExternal: async () => {
    const tab = get().getActiveTab()
    if (!tab || isBrowserHomeTab(tab) || !window.projectOS?.shell) return
    await window.projectOS.shell.openExternal(tab.url)
  },

  onLoadStart: () => {
    const { activeTabId, tabs } = get()
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (!activeTab || isBrowserHomeTab(activeTab)) return
    set({
      tabs: tabs.map((t) =>
        t.id === activeTabId ? { ...t, isLoading: true, error: null } : t,
      ),
    })
  },

  onLoadStop: () => {
    get().syncNavigationState()
    const { activeTabId, tabs } = get()
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (!activeTab || isBrowserHomeTab(activeTab)) return
    set({
      tabs: tabs.map((t) =>
        t.id === activeTabId ? { ...t, isLoading: false } : t,
      ),
    })
  },

  onLoadFail: (description) => {
    get().syncNavigationState()
    const locale = useWorkbenchStore.getState().locale
    const { activeTabId, tabs } = get()
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (!activeTab || isBrowserHomeTab(activeTab)) return
    set({
      tabs: tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              isLoading: false,
              error: description || getStoreMessage(locale, 'browser.connectionError'),
            }
          : t,
      ),
    })
  },

  onNavigate: (url) => {
    if (!normalizeBrowserUrl(url)) return
    persistBrowserUrl(url)
    const { activeTabId, tabs } = get()
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (!activeTab || isBrowserHomeTab(activeTab)) return
    set({
      inputUrl: url,
      tabs: tabs.map((t) =>
        t.id === activeTabId ? { ...t, url, error: null } : t,
      ),
    })
    get().syncNavigationState()
  },

  syncNavigationState: () => {
    get().controller?.syncNavigationState()
  },

  createTab: (url) => {
    const tabUrl = url ?? DEFAULT_BROWSER_URL
    const newTab = createPageBrowserTab(tabUrl)
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
      inputUrl: tabUrl,
    }))
    return newTab.id
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === tabId)
    if (idx < 0) return

    const nextTabs = tabs.filter((t) => t.id !== tabId)
    if (nextTabs.length === 0) {
      const home = createHomeBrowserTab()
      set({
        tabs: [home],
        activeTabId: home.id,
        inputUrl: tabInputUrl(home, [home]),
      })
      return
    }

    let nextActiveId = activeTabId
    if (activeTabId === tabId) {
      const nextIdx = Math.min(idx, nextTabs.length - 1)
      nextActiveId = nextTabs[nextIdx].id
    }
    const nextTab = nextTabs.find((t) => t.id === nextActiveId)
    set({
      tabs: nextTabs,
      activeTabId: nextActiveId,
      inputUrl: tabInputUrl(nextTab, nextTabs),
    })
  },

  switchTab: (tabId) => {
    const { tabs } = get()
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) return
    set({ activeTabId: tabId, inputUrl: tabInputUrl(tab, tabs) })
  },

  reorderTab: (tabId, toIndex) => {
    set((state) => {
      const fromIndex = state.tabs.findIndex((tab) => tab.id === tabId)
      if (fromIndex < 0 || toIndex < 0 || toIndex >= state.tabs.length || fromIndex === toIndex) {
        return state
      }

      const nextTabs = [...state.tabs]
      const [moved] = nextTabs.splice(fromIndex, 1)
      nextTabs.splice(toIndex, 0, moved)
      return { tabs: nextTabs }
    })
  },

  openOrSwitchTab: (url) => {
    const normalized = normalizeBrowserUrl(url)
    if (!normalized) {
      get().createTab(url)
      return
    }

    const { tabs } = get()
    const existing = tabs.find((t) => {
      if (isBrowserHomeTab(t)) return false
      try {
        return new URL(t.url).href === new URL(normalized).href
      } catch {
        return t.url === normalized
      }
    })

    if (existing) {
      get().switchTab(existing.id)
      return
    }

    const homeOnly = tabs.length === 1 && isBrowserHomeTab(tabs[0])
    if (homeOnly) {
      get().switchTab(tabs[0].id)
      get().navigate(normalized)
      return
    }

    get().createTab(normalized)
  },

  setTabTitle: (tabId, title) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId && !t.isHome ? { ...t, title } : t,
      ),
    }))
  },

  createHtmlDoc: (input) => {
    const now = new Date().toISOString()
    const locale = useWorkbenchStore.getState().locale
    const doc: BrowserHtmlDoc = {
      id: newHtmlDocId(),
      title: input?.title?.trim() || getStoreMessage(locale, 'browser.htmlDocUntitled'),
      html:
        input?.html ??
        `<!doctype html><html><head><meta charset="utf-8"><title>${
          input?.title?.trim() || 'Document'
        }</title></head><body><article><h1>${
          input?.title?.trim() || 'Document'
        }</h1><p></p></article></body></html>`,
      createdAt: now,
      updatedAt: now,
      ...(input?.source ? { source: input.source } : {}),
    }
    set((state) => ({
      htmlDocs: [...state.htmlDocs, doc],
      activeHtmlDocId: doc.id,
      sidebarMode: 'docs',
    }))
    return doc.id
  },

  upsertHtmlDoc: (input) => {
    const now = new Date().toISOString()
    const existingId = input.id
    const existing = existingId
      ? get().htmlDocs.find((doc) => doc.id === existingId)
      : undefined

    if (existing) {
      set((state) => ({
        htmlDocs: state.htmlDocs.map((doc) =>
          doc.id === existing.id
            ? {
                ...doc,
                title: input.title.trim() || doc.title,
                html: input.html,
                updatedAt: now,
                ...(input.source !== undefined ? { source: input.source } : {}),
              }
            : doc,
        ),
        activeHtmlDocId: existing.id,
        sidebarMode: 'docs',
      }))
      return existing.id
    }

    return get().createHtmlDoc({
      title: input.title,
      html: input.html,
      source: input.source,
    })
  },

  closeHtmlDoc: (docId) => {
    const { htmlDocs, activeHtmlDocId } = get()
    const idx = htmlDocs.findIndex((doc) => doc.id === docId)
    if (idx < 0) return
    const nextDocs = htmlDocs.filter((doc) => doc.id !== docId)
    let nextActive = activeHtmlDocId
    if (activeHtmlDocId === docId) {
      nextActive =
        nextDocs.length === 0
          ? null
          : nextDocs[Math.min(idx, nextDocs.length - 1)]?.id ?? null
    }
    set({ htmlDocs: nextDocs, activeHtmlDocId: nextActive })
  },

  switchHtmlDoc: (docId) => {
    const doc = get().htmlDocs.find((item) => item.id === docId)
    if (!doc) return
    set({ activeHtmlDocId: docId, sidebarMode: 'docs' })
  },
}))

export function syncBrowserNavigationFromWebview(webview: ElectronWebviewElement): void {
  const { activeTabId, tabs } = useBrowserStore.getState()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  if (!activeTab || isBrowserHomeTab(activeTab)) return
  useBrowserStore.setState({
    tabs: tabs.map((t) =>
      t.id === activeTabId
        ? { ...t, canGoBack: webview.canGoBack(), canGoForward: webview.canGoForward() }
        : t,
    ),
  })
}

export { DEFAULT_BROWSER_URL, isBrowserHomeTab }
