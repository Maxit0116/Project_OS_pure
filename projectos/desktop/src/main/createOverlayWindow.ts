import { app, BrowserWindow, screen, type Rectangle } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { installTrustedHostRendererAuthority } from './ipcSenderTrust.js'

let overlayWindow: BrowserWindow | null = null

function overlayDocumentUrl(): string {
  const developmentRendererUrl = !app.isPackaged
    ? process.env['ELECTRON_RENDERER_URL']
    : undefined
  if (developmentRendererUrl) {
    const base = developmentRendererUrl.replace(/\/?$/, '/')
    return new URL('overlay.html', base).toString()
  }
  return pathToFileURL(join(__dirname, '../renderer/overlay.html')).toString()
}

/** Union of all display bounds so the overlay can cover every screen. */
export function virtualScreenBounds(): Rectangle {
  const displays = screen.getAllDisplays()
  if (displays.length === 0) {
    return { x: 0, y: 0, width: 1280, height: 800 }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const display of displays) {
    const b = display.bounds
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  }
}

export function getOverlayWindow(): BrowserWindow | null {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow
  return null
}

/**
 * Keep the overlay above fullscreen apps / other Spaces without activating
 * Project OS (activating would switch Spaces away from Xcode/Studio).
 */
export function presentOverlayWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const bounds = virtualScreenBounds()
  win.setBounds(bounds)
  // Re-assert after every show — macOS drops these when Spaces change.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setAlwaysOnTop(true, 'screen-saver', 1)
  if (typeof win.moveTop === 'function') {
    win.moveTop()
  }
  // Prefer inactive show so we do not steal the fullscreen app's Space.
  if (typeof win.showInactive === 'function') {
    win.showInactive()
  } else {
    win.show()
  }
}

function emitBeginCapture(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const bounds = win.getBounds()
  win.webContents.send('spatial-pin:beginCapture', {
    // Window-local: selection uses client coords; main maps via getBounds().
    displayBounds: { x: 0, y: 0, width: bounds.width, height: bounds.height },
  })
}

export function createOrShowOverlayWindow(_opts?: {
  displayId?: number
}): BrowserWindow {
  const bounds = virtualScreenBounds()
  const existing = getOverlayWindow()

  if (existing) {
    existing.setContentProtection(true)
    presentOverlayWindow(existing)
    emitBeginCapture(existing)
    return existing
  }

  const allowedDocumentUrl = overlayDocumentUrl()
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    alwaysOnTop: true,
    // Allow the window to span the virtual desktop across monitors.
    enableLargerThanScreen: true,
    backgroundColor: '#00000000',
    // macOS panel participates better with fullscreen Spaces.
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  overlayWindow = win
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setAlwaysOnTop(true, 'screen-saver', 1)
  // Keep overlay visible to the user while excluding it from screen captures,
  // so we do not have to hide()/show() (which causes a visible flicker).
  win.setContentProtection(true)

  const disposeAuthority = installTrustedHostRendererAuthority(
    win.webContents,
    allowedDocumentUrl,
  )

  win.on('closed', () => {
    disposeAuthority()
    if (overlayWindow === win) overlayWindow = null
  })

  // Keep coverage correct when displays are plugged/unplugged while open.
  const onDisplayChange = () => {
    const current = getOverlayWindow()
    if (!current || current !== win || current.isDestroyed()) return
    if (!current.isVisible()) return
    presentOverlayWindow(current)
  }
  screen.on('display-added', onDisplayChange)
  screen.on('display-removed', onDisplayChange)
  screen.on('display-metrics-changed', onDisplayChange)
  win.on('closed', () => {
    screen.removeListener('display-added', onDisplayChange)
    screen.removeListener('display-removed', onDisplayChange)
    screen.removeListener('display-metrics-changed', onDisplayChange)
  })

  const reveal = () => {
    if (win.isDestroyed()) return
    presentOverlayWindow(win)
    emitBeginCapture(win)
  }

  win.webContents.once('did-finish-load', reveal)

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(allowedDocumentUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/overlay.html'))
  }

  return win
}

export function hideOverlayWindow(): void {
  const win = getOverlayWindow()
  if (!win) return
  win.hide()
}

export function closeOverlayWindow(): void {
  const win = getOverlayWindow()
  if (!win) return
  win.close()
  overlayWindow = null
}
