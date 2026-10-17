import { BrowserWindow, globalShortcut, ipcMain } from 'electron'
import {
  closeOverlayWindow,
  createOrShowOverlayWindow,
  getOverlayWindow,
  hideOverlayWindow,
  releaseOverlayEscapeShortcut,
} from './createOverlayWindow.js'
import { assertTrustedHostRenderer } from './ipcSenderTrust.js'
import { buildSpatialPinSessionContext } from './spatialPinContext.js'
import {
  captureSpatialPinSelection,
  probeSpatialPinMacHost,
  type SpatialPinHostInfo,
} from './spatialPinMacHost.js'
import type { LocationKey, ScreenRect } from '../../../contracts/spatial-pin.js'
import { ScreenRectSchema } from '../../../contracts/spatial-pin.js'

export interface SpatialPinBridgeState {
  connected: boolean
  port: number | null
  token: string | null
  bridgeFilePath: string | null
  lastUrl: string | null
  lastProjectId: string | null
}

let bridgeState: SpatialPinBridgeState = {
  connected: false,
  port: null,
  token: null,
  bridgeFilePath: null,
  lastUrl: null,
  lastProjectId: null,
}

/** Last web location from Chrome extension or in-app browser (optional enhancer). */
let lastWebLocation: Partial<LocationKey> | null = null
/** Last macOS host enrichment from captureSelection. */
let lastHostLocation: Partial<LocationKey> | null = null
let preferredProjectId: string | null = null

function sessionContextOpts() {
  return {
    preferredProjectId,
    webLocation: lastWebLocation,
    chromeBridgeConnected: bridgeState.connected,
    hostLocation: lastHostLocation,
  }
}

function hostToLocationPatch(host: SpatialPinHostInfo): Partial<LocationKey> | null {
  if (!host.appName && !host.deviceKind && !host.inferredPath) return null
  return {
    ...(host.appName ? { appName: host.appName } : {}),
    ...(host.bundleId ? { bundleId: host.bundleId } : {}),
    ...(host.windowTitle ? { windowTitle: host.windowTitle } : {}),
    ...(host.deviceKind ? { deviceKind: host.deviceKind } : {}),
    ...(host.inferredPath ? { inferredPath: host.inferredPath } : {}),
    ...(host.textHint ? { textHint: host.textHint } : {}),
  }
}

function isProjectOsHost(host: SpatialPinHostInfo): boolean {
  const name = (host.appName ?? '').toLowerCase()
  return name.includes('project os') || name.includes('electron')
}

export function getSpatialPinBridgeState(): SpatialPinBridgeState {
  return { ...bridgeState }
}

export function setSpatialPinBridgeState(
  patch: Partial<SpatialPinBridgeState>,
): void {
  bridgeState = { ...bridgeState, ...patch }
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send('spatial-pin:bridgeState', bridgeState)
  }
}

export function publishExternalLocation(payload: unknown): void {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if (typeof record.url === 'string') {
      bridgeState = { ...bridgeState, lastUrl: record.url }
    }
    if (
      record.surface === 'chrome' ||
      record.surface === 'projectos-browser' ||
      (typeof record.url === 'string' && record.url.startsWith('http'))
    ) {
      lastWebLocation = {
        surface:
          record.surface === 'projectos-browser' ? 'projectos-browser' : 'chrome',
        ...(typeof record.url === 'string' ? { url: record.url } : {}),
        ...(typeof record.routePath === 'string'
          ? { routePath: record.routePath }
          : {}),
        ...(typeof record.selector === 'string'
          ? { selector: record.selector }
          : {}),
        ...(typeof record.axName === 'string' ? { axName: record.axName } : {}),
        ...(typeof record.textHint === 'string'
          ? { textHint: record.textHint }
          : {}),
        ...(typeof record.visualHash === 'string'
          ? { visualHash: record.visualHash }
          : {}),
      }
      if (typeof record.projectId === 'string') {
        preferredProjectId = record.projectId
        bridgeState = { ...bridgeState, lastProjectId: record.projectId }
      }
    }
  }
  const overlay = getOverlayWindow()
  overlay?.webContents.send('spatial-pin:location', payload)
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win === overlay) continue
    win.webContents.send('spatial-pin:location', payload)
  }
}

export function resolveActiveProjectContext(): {
  projectId: string | null
  workspacePath: string | null
} {
  const ctx = buildSpatialPinSessionContext(sessionContextOpts())
  return {
    projectId: ctx.projectId,
    workspacePath: ctx.workspacePath,
  }
}

export function registerSpatialPinOverlay(): void {
  ipcMain.handle('spatial-pin:beginCapture', async (event) => {
    assertTrustedHostRenderer(event)
    const ctx = resolveActiveProjectContext()
    // Probe before overlay is shown (helps when launched from IDE/simulator).
    const host = await probeSpatialPinMacHost({
      workspacePath: ctx.workspacePath,
    })
    const patch = hostToLocationPatch(host)
    if (patch && !isProjectOsHost(host)) {
      lastHostLocation = patch
    }
    // Cover the full virtual desktop; present inactive so fullscreen Spaces stay put.
    createOrShowOverlayWindow()
    return { ok: true }
  })

  ipcMain.handle('spatial-pin:hideOverlay', (event) => {
    assertTrustedHostRenderer(event)
    hideOverlayWindow()
    return { ok: true }
  })

  ipcMain.handle('spatial-pin:closeOverlay', (event) => {
    assertTrustedHostRenderer(event)
    closeOverlayWindow()
    return { ok: true }
  })

  ipcMain.handle('spatial-pin:getContext', (event) => {
    assertTrustedHostRenderer(event)
    const session = buildSpatialPinSessionContext(sessionContextOpts())
    return {
      ...session,
      bridge: getSpatialPinBridgeState(),
    }
  })

  ipcMain.handle(
    'spatial-pin:setPreferredProject',
    (event, projectId: unknown) => {
      assertTrustedHostRenderer(event)
      preferredProjectId =
        typeof projectId === 'string' && projectId.trim()
          ? projectId.trim()
          : null
      return buildSpatialPinSessionContext(sessionContextOpts())
    },
  )

  ipcMain.handle(
    'spatial-pin:captureSelection',
    async (event, rectPayload: unknown) => {
      assertTrustedHostRenderer(event)
      const parsed = ScreenRectSchema.safeParse(rectPayload)
      if (!parsed.success) {
        return {
          pngBase64: null,
          host: {},
          error: 'Invalid capture rectangle',
        }
      }
      const overlay =
        BrowserWindow.fromWebContents(event.sender) ?? getOverlayWindow()
      const winBounds =
        overlay && !overlay.isDestroyed() ? overlay.getBounds() : null
      // Overlay selection is window-local; map to screen DIP coordinates.
      const screenRect: ScreenRect = {
        x: parsed.data.x + (winBounds?.x ?? 0),
        y: parsed.data.y + (winBounds?.y ?? 0),
        width: parsed.data.width,
        height: parsed.data.height,
      }
      const ctx = resolveActiveProjectContext()
      // Do not hide()/show() the overlay — that flashes the desktop. The window
      // uses setContentProtection(true) so it stays on-screen for the user while
      // being omitted from desktopCapturer snapshots.
      const result = await captureSpatialPinSelection({
        rect: screenRect,
        workspacePath: ctx.workspacePath,
      })
      const patch = hostToLocationPatch(result.host)
      if (patch && !isProjectOsHost(result.host)) {
        lastHostLocation = patch
      } else if (patch && !lastHostLocation) {
        lastHostLocation = patch
      }
      return {
        ...result,
        host: {
          ...result.host,
          ...(lastHostLocation?.appName
            ? { appName: lastHostLocation.appName }
            : {}),
          ...(lastHostLocation?.bundleId
            ? { bundleId: lastHostLocation.bundleId }
            : {}),
          ...(lastHostLocation?.windowTitle
            ? { windowTitle: lastHostLocation.windowTitle }
            : {}),
          ...(lastHostLocation?.deviceKind
            ? { deviceKind: lastHostLocation.deviceKind }
            : {}),
          ...(lastHostLocation?.inferredPath
            ? { inferredPath: lastHostLocation.inferredPath }
            : {}),
          ...(lastHostLocation?.textHint
            ? { textHint: lastHostLocation.textHint }
            : {}),
        },
      }
    },
  )

  ipcMain.handle('spatial-pin:getBridgeState', (event) => {
    assertTrustedHostRenderer(event)
    return getSpatialPinBridgeState()
  })

  ipcMain.handle('spatial-pin:reportBrowserLocation', (event, payload: unknown) => {
    assertTrustedHostRenderer(event)
    const record =
      payload && typeof payload === 'object'
        ? (payload as Record<string, unknown>)
        : {}
    const ctx = resolveActiveProjectContext()
    publishExternalLocation({
      surface: 'projectos-browser',
      ...record,
      projectId:
        typeof record.projectId === 'string' ? record.projectId : ctx.projectId,
    })
    return { ok: true }
  })

  const registered = globalShortcut.register('CommandOrControl+Shift+P', () => {
    void (async () => {
      const ctx = resolveActiveProjectContext()
      const host = await probeSpatialPinMacHost({
        workspacePath: ctx.workspacePath,
      })
      const patch = hostToLocationPatch(host)
      if (patch && !isProjectOsHost(host)) {
        lastHostLocation = patch
      }
      // Do not focus the main Project OS window — that would leave the
      // fullscreen IDE Space. Overlay uses showInactive + visibleOnFullScreen.
      createOrShowOverlayWindow()
    })()
  })
  if (!registered) {
    console.warn(
      '[spatial-pin] Failed to register global shortcut CommandOrControl+Shift+P',
    )
  }
}

export function unregisterSpatialPinOverlayShortcuts(): void {
  globalShortcut.unregister('CommandOrControl+Shift+P')
  // Escape is registered only while the overlay is visible; clear it on shutdown
  // in case hide/close did not run.
  releaseOverlayEscapeShortcut()
}
