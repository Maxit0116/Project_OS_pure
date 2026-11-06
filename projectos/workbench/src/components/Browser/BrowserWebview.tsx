import { createElement, useEffect, useState } from 'react'
import { BROWSER_WEBVIEW_PARTITION } from '@contracts/browser-channels'
import type { ElectronWebviewElement } from '../../types/electron-webview'
import {
  syncBrowserNavigationFromWebview,
  useBrowserStore,
} from '../../state/browserStore'
import {
  buildSpatialLocatorInjectionSource,
  SPATIAL_LOCATOR_CONSOLE_PREFIX,
} from './injectSpatialLocator'
import {
  buildLabCaptureInjectionSource,
  LAB_CAPTURE_CONSOLE_PREFIX,
  parseLabCaptureConsoleMessage,
} from './injectLabCapture'
import { useProductLabStore } from '../../state/productLabStore'
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
  const labActive = useProductLabStore((s) => {
    const id = s.document.activeSessionId
    if (!id) return false
    const status = s.document.sessions.find((session) => session.id === id)?.status
    return Boolean(status && status !== 'ended')
  })
  const ingestAutoCapture = useProductLabStore((s) => s.ingestAutoCapture)

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
      const lab = useProductLabStore.getState().activeSession()
      if (lab && lab.status !== 'ended' && lab.capture.failedNetwork) {
        void useProductLabStore.getState().ingestAutoCapture({
          kind: 'network_failure',
          title: `Page load failed: ${failEvent.errorDescription ?? 'unknown'}`,
          detail: `errorCode=${failEvent.errorCode ?? '?'} ${failEvent.errorDescription ?? ''}`,
          url: el.getURL?.() || undefined,
        })
      }
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
      try {
        void el.executeJavaScript(buildSpatialLocatorInjectionSource(), false)
      } catch {
        // Guest injection is best-effort for spatial pins.
      }
      const lab = useProductLabStore.getState().activeSession()
      if (lab && lab.status !== 'ended') {
        try {
          void el.executeJavaScript(buildLabCaptureInjectionSource(), false)
        } catch {
          // Lab capture injection is best-effort.
        }
      }
    }
    const handleConsole = (event: Event) => {
      const message = (event as Event & { message?: string; level?: number }).message
      if (!message) return

      if (message.startsWith(SPATIAL_LOCATOR_CONSOLE_PREFIX)) {
        try {
          const payload = JSON.parse(
            message.slice(SPATIAL_LOCATOR_CONSOLE_PREFIX.length),
          )
          void window.projectOS?.spatialPin.reportBrowserLocation(payload)
        } catch {
          // ignore malformed locator payloads
        }
        return
      }

      if (message.startsWith(LAB_CAPTURE_CONSOLE_PREFIX)) {
        const parsed = parseLabCaptureConsoleMessage(message)
        if (parsed) void ingestAutoCapture(parsed)
        return
      }

      // Native console.error (Electron level 3) while Lab is active.
      const level = (event as Event & { level?: number }).level
      const lab = useProductLabStore.getState().activeSession()
      if (
        lab &&
        lab.status !== 'ended' &&
        lab.capture.consoleErrors &&
        level === 3 &&
        !message.startsWith(SPATIAL_LOCATOR_CONSOLE_PREFIX)
      ) {
        void ingestAutoCapture({
          kind: 'console_error',
          title: message.slice(0, 120),
          detail: message,
          url: el.getURL?.() || undefined,
        })
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
    el.addEventListener('console-message', handleConsole)
    // Browser guest popups are denied by the main-owned setWindowOpenHandler.
    ;(el as unknown as HTMLElement).addEventListener('page-title-updated', handleTitleUpdated)

    return () => {
      el.removeEventListener('dom-ready', handleDomReady)
      el.removeEventListener('did-start-loading', handleStart)
      el.removeEventListener('did-stop-loading', handleStop)
      el.removeEventListener('did-fail-load', handleFail)
      el.removeEventListener('did-navigate', handleNavigate)
      el.removeEventListener('did-navigate-in-page', handleNavigate)
      el.removeEventListener('console-message', handleConsole)
      ;(el as unknown as HTMLElement).removeEventListener('page-title-updated', handleTitleUpdated)
      registerController(null)
    }
  }, [
    ingestAutoCapture,
    onLoadFail,
    onLoadStart,
    onLoadStop,
    onNavigate,
    registerController,
    webviewEl,
    setTabTitle,
  ])

  // Re-inject capture hooks when Lab starts after the page was already ready.
  useEffect(() => {
    if (!webviewEl || !labActive) return
    try {
      void webviewEl.executeJavaScript(buildLabCaptureInjectionSource(), false)
    } catch {
      // best-effort
    }
  }, [labActive, webviewEl, url])

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
