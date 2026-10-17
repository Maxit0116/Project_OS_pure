import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  type Rectangle,
} from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { installTrustedHostRendererAuthority } from './ipcSenderTrust.js'

let overlayWindow: BrowserWindow | null = null
let overlayEscapeRegistered = false
let overlayLifecycleIpcInstalled = false
/**
 * Bumped on every hide/show so an in-flight "clear then hide" can be cancelled
 * when the user reopens before hide() runs.
 */
let overlaySessionGeneration = 0

function installOverlayLifecycleIpc(): void {
  if (overlayLifecycleIpcInstalled) return
  overlayLifecycleIpcInstalled = true
  // First load: did-finish-load often fires before React mounts, so beginCapture
  // would be missed. Renderer announces mount; we re-emit beginCapture.
  ipcMain.on('spatial-pin:overlayMounted', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed() || win !== getOverlayWindow()) return
    emitBeginCapture(win)
  })
}

/**
 * Wait until the overlay renderer has applied beginCapture and painted, so we
 * can raise opacity 0→1 without flashing the previous session UI.
 */
function waitForOverlayPainted(
  win: BrowserWindow,
  timeoutMs = 1500,
): Promise<void> {
  return new Promise((resolve) => {
    if (win.isDestroyed()) {
      resolve()
      return
    }
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      ipcMain.removeListener('spatial-pin:overlayReady', onReady)
      resolve()
    }
    const onReady = (event: Electron.IpcMainEvent) => {
      if (event.sender !== win.webContents) return
      finish()
    }
    const timer = setTimeout(finish, timeoutMs)
    ipcMain.on('spatial-pin:overlayReady', onReady)
  })
}

/**
 * show()/showInactive() on macOS often restores opacity to 1 for a frame and
 * can flash the window-server's last composited surface. Set opacity before and
 * immediately after show.
 */
function presentOverlayWindowAtOpacity(
  win: BrowserWindow,
  opacity: number,
): void {
  if (win.isDestroyed()) return
  const bounds = virtualScreenBounds()
  const current = win.getBounds()
  if (
    current.x !== bounds.x ||
    current.y !== bounds.y ||
    current.width !== bounds.width ||
    current.height !== bounds.height
  ) {
    win.setBounds(bounds)
  }
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setAlwaysOnTop(true, 'screen-saver', 1)
  if (typeof win.moveTop === 'function') {
    win.moveTop()
  }
  win.setOpacity(opacity)
  if (typeof win.showInactive === 'function') {
    win.showInactive()
  } else {
    win.show()
  }
  // Re-assert: showInactive may bump opacity back to 1 on macOS.
  win.setOpacity(opacity)
  registerOverlayEscapeShortcut()
}

/**
 * Overlay is presented with showInactive so fullscreen IDEs keep their Space
 * and keyboard focus. Renderer keydown never sees Esc in that case — register
 * Escape as a global shortcut for the lifetime of the visible overlay.
 */
function registerOverlayEscapeShortcut(): void {
  if (overlayEscapeRegistered) return
  const ok = globalShortcut.register('Escape', () => {
    const win = getOverlayWindow()
    // Ask the renderer to solidify the capture session, then hide — do not wipe
    // UI or cancel agent runs from main.
    if (win && !win.isDestroyed()) {
      win.webContents.send('spatial-pin:requestHide')
      return
    }
    hideOverlayWindow()
  })
  if (ok) {
    overlayEscapeRegistered = true
  } else {
    console.warn('[spatial-pin] Failed to register global Escape shortcut')
  }
}

export function releaseOverlayEscapeShortcut(): void {
  if (!overlayEscapeRegistered) return
  globalShortcut.unregister('Escape')
  overlayEscapeRegistered = false
}

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
  presentOverlayWindowAtOpacity(win, win.isDestroyed() ? 1 : win.getOpacity())
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
  installOverlayLifecycleIpc()
  const bounds = virtualScreenBounds()
  const existing = getOverlayWindow()

  if (existing) {
    // Cancel any in-flight Esc dismiss so we do not race a late hide().
    const session = ++overlaySessionGeneration
    existing.setContentProtection(true)
    if (typeof existing.setIgnoreMouseEvents === 'function') {
      existing.setIgnoreMouseEvents(false)
    }
    existing.setOpacity(0)
    // Arm ready waiter before beginCapture to avoid missing a fast reply.
    const painted = waitForOverlayPainted(existing)
    emitBeginCapture(existing)
    void painted.then(() => {
      if (existing.isDestroyed() || session !== overlaySessionGeneration) return
      // Prefer opacity raise over hide→show: showInactive flashes the last
      // window-server surface (previous arrows) even when the DOM was cleared
      // while the window was hidden.
      if (!existing.isVisible()) {
        presentOverlayWindowAtOpacity(existing, 0)
      } else {
        existing.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
        existing.setAlwaysOnTop(true, 'screen-saver', 1)
        if (typeof existing.moveTop === 'function') {
          existing.moveTop()
        }
        existing.setOpacity(0)
        registerOverlayEscapeShortcut()
      }
      existing.setOpacity(1)
    })
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
  win.setOpacity(0)
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
    const session = ++overlaySessionGeneration
    win.setOpacity(0)
    // Stay hidden until React mounts, applies beginCapture, and paints — then
    // present at opacity 1 so the first visible frame is a clean capture UI.
    const painted = waitForOverlayPainted(win)
    emitBeginCapture(win)
    void painted.then(() => {
      if (win.isDestroyed() || session !== overlaySessionGeneration) return
      presentOverlayWindowAtOpacity(win, 0)
      win.setOpacity(1)
    })
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
  releaseOverlayEscapeShortcut()
  const win = getOverlayWindow()
  if (!win || win.isDestroyed()) return
  ++overlaySessionGeneration
  // Do not hide(): on macOS the window-server caches the last opaque frame
  // (regions/arrows). The next showInactive() flashes that cache for a frame
  // even if React cleared the DOM while the window was hidden.
  // Stay mapped at opacity 0, pass clicks through, and reset the session UI.
  win.setOpacity(0)
  if (typeof win.setIgnoreMouseEvents === 'function') {
    win.setIgnoreMouseEvents(true, { forward: true })
  }
  emitBeginCapture(win)
}

export function closeOverlayWindow(): void {
  releaseOverlayEscapeShortcut()
  const win = getOverlayWindow()
  if (!win) return
  win.close()
  overlayWindow = null
}
