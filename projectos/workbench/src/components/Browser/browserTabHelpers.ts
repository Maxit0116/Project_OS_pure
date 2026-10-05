import type { BrowserTab } from '../../state/browserStore'
import { DEFAULT_BROWSER_URL } from './browserUrl'

function newTabId(): string {
  return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export function createHomeBrowserTab(): BrowserTab {
  return {
    id: newTabId(),
    url: '',
    title: '',
    isHome: true,
    isLoading: false,
    error: null,
    canGoBack: false,
    canGoForward: false,
  }
}

export function createPageBrowserTab(url: string = DEFAULT_BROWSER_URL): BrowserTab {
  return {
    id: newTabId(),
    url,
    title: 'New Tab',
    isHome: false,
    isLoading: false,
    error: null,
    canGoBack: false,
    canGoForward: false,
  }
}

export function isBrowserHomeTab(tab: BrowserTab | undefined): boolean {
  return tab?.isHome === true
}
