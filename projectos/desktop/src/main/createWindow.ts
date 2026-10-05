import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  disposeStreamSubscriptionsForWebContents,
} from './registerProjectOsIpc.js'
import { disposeTerminalForWebContents } from './terminal/registerTerminalIpc.js'
import { macTrafficLightPosition, applyMacTrafficLightPosition } from './macTitleBarChrome.js'
import { installBrowserWebviewPolicy } from './browser/browserWebviewPolicy.js'
import { openAllowedExternalUrlInBackground } from './externalUrlPolicy.js'
import {
  installMainWindowNavigationGuard,
  installMainWindowSessionSecurity,
} from './mainWindowSecurity.js'
import { installRendererResourceCleanup } from './rendererResourceLifecycle.js'
import {
  installTrustedHostRendererAuthority,
} from './ipcSenderTrust.js'

const MAIN_WINDOW_REVEAL_FALLBACK_MS = 2_000

export function createMainWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const trafficLightPosition = macTrafficLightPosition()
  const rendererPath = join(__dirname, '../renderer/index.html')
  const developmentRendererUrl = !app.isPackaged
    ? process.env['ELECTRON_RENDERER_URL']
    : undefined
  const allowedDocumentUrl = developmentRendererUrl
    ? new URL(developmentRendererUrl).toString()
    : pathToFileURL(rendererPath).toString()
  const requestedWidth = Number(process.env.PROJECTOS_WINDOW_WIDTH)
  const requestedHeight = Number(process.env.PROJECTOS_WINDOW_HEIGHT)
  const win = new BrowserWindow({
    width: Number.isFinite(requestedWidth) && requestedWidth >= 1280 ? requestedWidth : 1400,
    height: Number.isFinite(requestedHeight) && requestedHeight >= 720 ? requestedHeight : 900,
    minWidth: 1280,
    minHeight: 720,
    show: false,
    ...(isMac
      ? {
          titleBarStyle: 'hidden' as const,
          trafficLightPosition,
        }
      : {}),
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  })

  installBrowserWebviewPolicy(win)
  installMainWindowNavigationGuard(win.webContents, allowedDocumentUrl)
  installMainWindowSessionSecurity(
    win.webContents.session,
    allowedDocumentUrl,
    app.isPackaged,
  )
  const disposeTrustedHostAuthority = installTrustedHostRendererAuthority(
    win.webContents,
    allowedDocumentUrl,
  )
  const disposeRendererResources = () => {
    disposeStreamSubscriptionsForWebContents(win.webContents)
    disposeTerminalForWebContents(win.webContents.id)
  }
  installRendererResourceCleanup(win.webContents, disposeRendererResources)

  const applyTrafficLightPosition = () => {
    try {
      applyMacTrafficLightPosition(win, win.isFullScreen())
    } catch {
      // Title-bar button positioning is cosmetic; never crash on resize.
    }
  }

  let revealFallback: NodeJS.Timeout | undefined
  const revealWindow = () => {
    if (revealFallback) {
      clearTimeout(revealFallback)
      revealFallback = undefined
    }
    if (win.isDestroyed() || win.isVisible()) return
    applyTrafficLightPosition()
    win.show()
  }

  win.on('ready-to-show', revealWindow)
  win.webContents.once('did-finish-load', revealWindow)
  revealFallback = setTimeout(revealWindow, MAIN_WINDOW_REVEAL_FALLBACK_MS)

  win.on('resize', applyTrafficLightPosition)
  win.on('focus', () => {
    win.webContents.send('window:focusChange', true)
  })
  win.on('blur', () => {
    win.webContents.send('window:focusChange', false)
  })
  win.on('minimize', () => {
    win.webContents.send('window:focusChange', false)
  })
  win.on('restore', () => {
    win.webContents.send('window:focusChange', win.isFocused())
  })
  win.on('hide', () => {
    win.webContents.send('window:focusChange', false)
  })
  win.on('show', () => {
    win.webContents.send('window:focusChange', win.isFocused())
  })
  win.on('enter-full-screen', () => {
    applyMacTrafficLightPosition(win, true)
    win.webContents.send('window:fullScreenChange', true)
  })
  win.on('leave-full-screen', () => {
    applyMacTrafficLightPosition(win, false)
    win.webContents.send('window:fullScreenChange', false)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    openAllowedExternalUrlInBackground(url, (externalUrl) => shell.openExternal(externalUrl))
    return { action: 'deny' }
  })

  win.on('close', () => {
    disposeRendererResources()
  })
  win.on('closed', () => {
    if (revealFallback) {
      clearTimeout(revealFallback)
      revealFallback = undefined
    }
    disposeTrustedHostAuthority()
  })

  if (developmentRendererUrl) {
    win.loadURL(allowedDocumentUrl)
  } else {
    win.loadFile(rendererPath)
  }

  return win
}
