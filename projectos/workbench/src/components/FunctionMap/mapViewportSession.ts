import type { Viewport } from '@xyflow/react'

/**
 * Survives Function Map canvas remounts (e.g. switching center tabs) so the
 * user's pan/zoom is restored instead of re-fitting to the project-open camera.
 */
interface MapViewportSession {
  graphLayoutKey: string
  viewport: Viewport
  userControlled: boolean
}

let session: MapViewportSession | null = null

export function clearMapViewportSession(): void {
  session = null
}

/** Record the auto-fit camera for the current graph topology (not user pan/zoom). */
export function syncAutoMapViewport(graphLayoutKey: string, viewport: Viewport): void {
  if (session?.graphLayoutKey === graphLayoutKey && session.userControlled) {
    return
  }
  session = { graphLayoutKey, viewport, userControlled: false }
}

/** Persist a user pan/zoom for the current graph topology. */
export function rememberUserMapViewport(graphLayoutKey: string, viewport: Viewport): void {
  session = { graphLayoutKey, viewport, userControlled: true }
}

/** Restore a user-controlled camera when remounting the same graph topology. */
export function getUserMapViewport(graphLayoutKey: string): Viewport | null {
  if (!session || session.graphLayoutKey !== graphLayoutKey || !session.userControlled) {
    return null
  }
  return session.viewport
}

/** Last known camera for any graph (used only as a remount flash-prevention seed). */
export function peekMapViewportSession(): Viewport | null {
  return session?.viewport ?? null
}
