import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, nativeImage, type BrowserWindow, type NativeImage } from 'electron'

/**
 * App icon helpers. Source: `projectos/desktop/build/icon.{icns,png}`
 * (stock Electron mark so `npm run dev` keeps com.github.Electron).
 *
 * macOS Stage Manager can keep a stale stage-strip badge after earlier branding
 * even when Electron.app's `electron.icns` is already stock. Calling
 * `app.dock.setIcon()` with that same stock mark refreshes Dock + Stage Manager
 * without changing Bundle ID (Keychain ACL stays stable).
 */
function safeAppPath(): string | null {
  try {
    return typeof app.getAppPath === 'function' ? app.getAppPath() : null
  } catch {
    return null
  }
}

export function resolveAppBrandIconPath(): string | null {
  const appPath = safeAppPath()
  // Prefer the host Electron.app icns while unpackaged so Dock/Stage Manager
  // cannot drift from CFBundleIconFile after a restore-stock.
  const hostElectronIcns =
    process.platform === 'darwin' && !app.isPackaged
      ? join(process.execPath, '../../Resources/electron.icns')
      : null
  const candidates = app.isPackaged
    ? [
        join(process.resourcesPath, 'icon.png'),
        join(process.resourcesPath, 'icon.icns'),
        ...(appPath
          ? [join(appPath, 'build', 'icon.png'), join(appPath, 'build', 'icon.icns')]
          : []),
      ]
    : [
        ...(hostElectronIcns ? [hostElectronIcns] : []),
        ...(appPath
          ? [join(appPath, 'build', 'icon.png'), join(appPath, 'build', 'icon.icns')]
          : []),
        join(__dirname, '../../build/icon.png'),
        join(__dirname, '../../build/icon.icns'),
      ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

export function loadAppBrandIcon(): NativeImage | null {
  const iconPath = resolveAppBrandIconPath()
  if (!iconPath) return null
  const image = nativeImage.createFromPath(iconPath)
  return image.isEmpty() ? null : image
}

/** Apply About / Windows taskbar brand before windows are created. */
export function applyAppBrandIcon(): NativeImage | null {
  const image = loadAppBrandIcon()
  if (!image) return null

  // Windows: taskbar / jumplist identity.
  if (process.platform === 'win32') {
    if (typeof app.setAppUserModelId === 'function') {
      app.setAppUserModelId('com.projectos.app')
    }
  }

  // Dock / Stage Manager / Linux DE chrome — always the stock mark in build/.
  if (app.dock?.setIcon) {
    app.dock.setIcon(image)
  }

  try {
    app.setAboutPanelOptions({
      applicationName: 'Project OS',
      applicationVersion: app.getVersion(),
      iconPath: resolveAppBrandIconPath() ?? undefined,
    })
  } catch {
    // About panel options are best-effort on older Electron builds.
  }

  return image
}

export function applyWindowBrandIcon(win: BrowserWindow, image?: NativeImage | null): void {
  if (process.platform === 'darwin') return
  const icon = image ?? loadAppBrandIcon()
  if (!icon || win.isDestroyed()) return
  // Windows/Linux window + taskbar chrome only.
  win.setIcon(icon)
}
