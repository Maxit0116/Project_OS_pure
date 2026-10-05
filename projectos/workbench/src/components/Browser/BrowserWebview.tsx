import { createElement, useEffect, useState } from 'react'
import { BROWSER_WEBVIEW_PARTITION } from '@contracts/browser-channels'
import type { ElectronWebviewElement } from '../../types/electron-webview'
import {
  syncBrowserNavigationFromWebview,
  useBrowserStore,
} from '../../state/browserStore'
import styles from './BrowserPanel.module.css'

interface FailLoadEvent extends Event {
  errorCode?: number
  errorDescription?: string
  isMainFrame?: boolean
}

export default function BrowserWebview() {
  const [webviewEl, setWebviewEl] = useState<ElectronWebviewElement | null>(null)
  const tabs = useBrowserStore((s) => s.tabs)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const registerController = useBrowserStore((s) => s.registerController)
  const onLoadStart = useBrowserStore((s) => s.onLoadStart)
  const onLoadStop = useBrowserStore((s) => s.onLoadStop)
  const onLoadFail = useBrowserStore((s) => s.onLoadFail)
  const onNavigate = useBrowserStore((s) => s.onNavigate)
  const setTabTitle = useBrowserStore((s) => s.setTabTitle)

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const url = activeTab?.url ?? 'about:blank'

  useEffect(() => {
    if (!webviewEl) return

    const el = webviewEl

    registerController({
      goBack: () => el.goBack(),
      goForward: () => el.goForward(),
      reload: () => el.reload(),
      loadURL: (nextUrl) => el.loadURL(nextUrl),
      syncNavigationState: () => syncBrowserNavigationFromWebview(el),
    })

    const handleStart = () => onLoadStart()
    const handleStop = () => onLoadStop()
    const handleFail = (event: Event) => {
      const failEvent = event as FailLoadEvent
      if (failEvent.isMainFrame === false) return
      if (failEvent.errorCode === -3) return
      onLoadFail(failEvent.errorDescription ?? '')
    }
    const handleNavigate = () => {
      const currentUrl = el.getURL()
      if (currentUrl) onNavigate(currentUrl)
    }
    const handleDomReady = () => {
      syncBrowserNavigationFromWebview(el)
      try {
        const pageTitle = (el as unknown as { getTitle?: () => string }).getTitle?.()
        if (pageTitle) {
          setTabTitle(useBrowserStore.getState().activeTabId, pageTitle)
        }
      } catch {
        // getTitle may not be available
      }
    }
    const handleTitleUpdated = (event: Event) => {
      const title = (event as Event & { title?: string }).title
      if (title) {
        setTabTitle(useBrowserStore.getState().activeTabId, title)
      }
    }

    el.addEventListener('dom-ready', handleDomReady)
    el.addEventListener('did-start-loading', handleStart)
    el.addEventListener('did-stop-loading', handleStop)
    el.addEventListener('did-fail-load', handleFail)
    el.addEventListener('did-navigate', handleNavigate)
    el.addEventListener('did-navigate-in-page', handleNavigate)
    // Browser guest popups are denied by the main-owned setWindowOpenHandler.
    ;(el as unknown as HTMLElement).addEventListener('page-title-updated', handleTitleUpdated)

    return () => {
      el.removeEventListener('dom-ready', handleDomReady)
      el.removeEventListener('did-start-loading', handleStart)
      el.removeEventListener('did-stop-loading', handleStop)
      el.removeEventListener('did-fail-load', handleFail)
      el.removeEventListener('did-navigate', handleNavigate)
      el.removeEventListener('did-navigate-in-page', handleNavigate)
      ;(el as unknown as HTMLElement).removeEventListener('page-title-updated', handleTitleUpdated)
      registerController(null)
    }
  }, [onLoadFail, onLoadStart, onLoadStop, onNavigate, registerController, webviewEl, setTabTitle])

  useEffect(() => {
    if (!webviewEl) return

    let cancelled = false
    let rafOuter = 0
    let rafInner = 0

    // Defer navigation until after the tab strip paints the selection change.
    rafOuter = requestAnimationFrame(() => {
      rafInner = requestAnimationFrame(() => {
        if (cancelled) return
        try {
          const currentUrl = webviewEl.getURL()
          if (!currentUrl || currentUrl === 'about:blank' || currentUrl !== url) {
            webviewEl.loadURL(url)
          }
        } catch {
          webviewEl.src = url
        }
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafOuter)
      cancelAnimationFrame(rafInner)
    }
  }, [url, webviewEl])

  return createElement('webview', {
    ref: (node: ElectronWebviewElement | null) => {
      setWebviewEl(node)
    },
    src: url,
    partition: BROWSER_WEBVIEW_PARTITION,
    webpreferences: 'contextIsolation=yes,nodeIntegration=no,sandbox=yes,webSecurity=yes',
    className: styles.webview,
  })
}
