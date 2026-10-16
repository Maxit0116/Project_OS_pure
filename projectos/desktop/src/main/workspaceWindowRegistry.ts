import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

const livePaths = new Map<number, string>()
const initialPaths = new Map<number, string>()

/** Stable path identity so the same folder is not opened in two windows. */
export function canonicalWorkspacePath(path: string): string {
  const trimmed = path.trim().replace(/[/\\]+$/, '')
  if (!trimmed || trimmed === '.' || trimmed.length > 4096 || /[\u0000-\u001f]/.test(trimmed)) {
    return ''
  }
  const absolute = resolve(trimmed)
  try {
    return realpathSync(absolute)
  } catch {
    return absolute
  }
}

export function rememberWorkspacePath(webContentsId: number, path: string | null): void {
  if (!path) {
    livePaths.delete(webContentsId)
    return
  }
  const canonical = canonicalWorkspacePath(path)
  if (!canonical) {
    livePaths.delete(webContentsId)
    return
  }
  livePaths.set(webContentsId, canonical)
}

export function setInitialWorkspacePath(webContentsId: number, path: string): void {
  const canonical = canonicalWorkspacePath(path)
  if (!canonical) return
  initialPaths.set(webContentsId, canonical)
}

export function initialWorkspacePath(webContentsId: number): string | null {
  return initialPaths.get(webContentsId) ?? null
}

export function forgetWorkspaceWindow(webContentsId: number): void {
  livePaths.delete(webContentsId)
  initialPaths.delete(webContentsId)
}

export function workspacePathForWindow(webContentsId: number): string | null {
  return livePaths.get(webContentsId) ?? initialPaths.get(webContentsId) ?? null
}

export function findWindowIdForWorkspace(
  path: string,
  windows: readonly { id: number; destroyed: boolean }[],
): number | null {
  const canonical = canonicalWorkspacePath(path)
  if (!canonical) return null
  for (const window of windows) {
    if (window.destroyed) continue
    if (workspacePathForWindow(window.id) === canonical) return window.id
  }
  return null
}

export function resetWorkspaceWindowRegistryForTests(): void {
  livePaths.clear()
  initialPaths.clear()
}
