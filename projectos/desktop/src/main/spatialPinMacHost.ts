import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  desktopCapturer,
  nativeImage,
  screen,
  type NativeImage,
  type Rectangle,
} from 'electron'
import {
  classifyMacHostApp,
  type ScreenRect,
  type SpatialPinDeviceKind,
} from '../../../contracts/spatial-pin.js'
import { inferSpatialPinPath } from '../../../services/spatial-pin-path-infer.js'

const execFileAsync = promisify(execFile)

const MAX_EDGE_PX = 1600

export interface SpatialPinHostInfo {
  appName?: string
  bundleId?: string
  windowTitle?: string
  deviceKind?: SpatialPinDeviceKind
  inferredPath?: string
  textHint?: string
}

export interface SpatialPinCaptureResult {
  pngBase64: string | null
  host: SpatialPinHostInfo
  error?: string
}

function isDarwin(): boolean {
  return process.platform === 'darwin'
}

async function probeFrontmostApp(): Promise<{
  appName?: string
  windowTitle?: string
}> {
  if (!isDarwin()) return {}
  const script = [
    'tell application "System Events"',
    '  set frontApp to first application process whose frontmost is true',
    '  set appName to name of frontApp',
    '  set winTitle to ""',
    '  try',
    '    if (count of windows of frontApp) > 0 then',
    '      set winTitle to name of window 1 of frontApp',
    '    end if',
    '  end try',
    '  return appName & linefeed & winTitle',
    'end tell',
  ].join('\n')
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], {
      timeout: 2500,
      maxBuffer: 64 * 1024,
    })
    const [appName, ...rest] = stdout.trim().split(/\r?\n/u)
    const windowTitle = rest.join('\n').trim()
    return {
      ...(appName?.trim() ? { appName: appName.trim() } : {}),
      ...(windowTitle ? { windowTitle } : {}),
    }
  } catch {
    return {}
  }
}

export async function probeSpatialPinMacHost(opts?: {
  workspacePath?: string | null
}): Promise<SpatialPinHostInfo> {
  if (!isDarwin()) return {}
  const probed = await probeFrontmostApp()
  if (!probed.appName && !probed.windowTitle) return {}
  const classified = classifyMacHostApp(probed.appName, probed.windowTitle)
  const inferred = inferSpatialPinPath(opts?.workspacePath, {
    appName: probed.appName,
    windowTitle: probed.windowTitle,
    deviceKind: classified.deviceKind,
  })
  return {
    ...(probed.appName ? { appName: probed.appName } : {}),
    ...(classified.bundleId ? { bundleId: classified.bundleId } : {}),
    ...(probed.windowTitle ? { windowTitle: probed.windowTitle } : {}),
    deviceKind: classified.deviceKind,
    ...(inferred.inferredPath ? { inferredPath: inferred.inferredPath } : {}),
    ...(inferred.textHint ? { textHint: inferred.textHint } : {}),
  }
}

function clampCrop(rect: Rectangle, bounds: Rectangle): Rectangle | null {
  const x = Math.max(0, Math.floor(rect.x))
  const y = Math.max(0, Math.floor(rect.y))
  const right = Math.min(bounds.width, Math.ceil(rect.x + rect.width))
  const bottom = Math.min(bounds.height, Math.ceil(rect.y + rect.height))
  const width = right - x
  const height = bottom - y
  if (width < 1 || height < 1) return null
  return { x, y, width, height }
}

function resizeIfNeeded(image: NativeImage): NativeImage {
  const size = image.getSize()
  const maxEdge = Math.max(size.width, size.height)
  if (maxEdge <= MAX_EDGE_PX) return image
  const scale = MAX_EDGE_PX / maxEdge
  return image.resize({
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  })
}

async function captureScreenRect(
  rect: ScreenRect,
): Promise<{ png: Buffer | null; error?: string }> {
  if (!isDarwin()) {
    return { png: null, error: 'Screen capture is only supported on macOS' }
  }
  try {
    const center = {
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2),
    }
    const display = screen.getDisplayNearestPoint(center)
    const scale = display.scaleFactor || 1
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.max(1, Math.round(display.size.width * scale)),
        height: Math.max(1, Math.round(display.size.height * scale)),
      },
    })
    const match =
      sources.find((source) => source.display_id === String(display.id)) ??
      sources[0]
    if (!match) {
      return {
        png: null,
        error: 'No screen source available — grant Screen Recording permission',
      }
    }
    const thumb = match.thumbnail
    if (thumb.isEmpty()) {
      return {
        png: null,
        error: 'Screen capture returned empty image — check Screen Recording permission',
      }
    }
    const thumbSize = thumb.getSize()
    const dipBounds = display.bounds
    // Map screen DIP rect → thumbnail pixels (display-local).
    const localX = (rect.x - dipBounds.x) * (thumbSize.width / dipBounds.width)
    const localY = (rect.y - dipBounds.y) * (thumbSize.height / dipBounds.height)
    const localW = rect.width * (thumbSize.width / dipBounds.width)
    const localH = rect.height * (thumbSize.height / dipBounds.height)
    const crop = clampCrop(
      { x: localX, y: localY, width: localW, height: localH },
      { x: 0, y: 0, width: thumbSize.width, height: thumbSize.height },
    )
    if (!crop) {
      return { png: null, error: 'Capture region is outside the display' }
    }
    const cropped = resizeIfNeeded(thumb.crop(crop))
    const png = cropped.toPNG()
    if (!png.length) {
      return { png: null, error: 'Failed to encode PNG snapshot' }
    }
    return { png: Buffer.from(png) }
  } catch (error) {
    return {
      png: null,
      error:
        error instanceof Error
          ? error.message
          : 'Screen capture failed — check Screen Recording permission',
    }
  }
}

/**
 * Capture a screen region and probe the frontmost macOS host app.
 * Soft-fails: returns host/error without throwing.
 */
export async function captureSpatialPinSelection(opts: {
  rect: ScreenRect
  workspacePath?: string | null
}): Promise<SpatialPinCaptureResult> {
  const [capture, host] = await Promise.all([
    captureScreenRect(opts.rect),
    probeSpatialPinMacHost({ workspacePath: opts.workspacePath }),
  ])
  return {
    pngBase64: capture.png ? capture.png.toString('base64') : null,
    host,
    ...(capture.error ? { error: capture.error } : {}),
  }
}
