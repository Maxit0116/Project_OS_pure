/** Keep in sync with workbench `tokens.css` `--titlebar-height`. */
export const MAC_TITLEBAR_HEIGHT_PX = 28

/** Left inset for the native traffic-light cluster. */
export const MAC_TRAFFIC_LIGHT_X_PX = 14

/**
 * Effective height of the macOS traffic-light cluster (logical px).
 * Used to vertically center within `MAC_TITLEBAR_HEIGHT_PX`.
 */
const MAC_TRAFFIC_LIGHT_CLUSTER_HEIGHT_PX = 18

/** Vertically centers native traffic lights in the custom title bar strip. */
export function macTrafficLightPosition(): { x: number; y: number } {
  const y = Math.round(
    (MAC_TITLEBAR_HEIGHT_PX - MAC_TRAFFIC_LIGHT_CLUSTER_HEIGHT_PX) / 2,
  )
  return {
    x: MAC_TRAFFIC_LIGHT_X_PX,
    y: Math.max(0, y),
  }
}

type TrafficLightCapableWindow = {
  setWindowButtonPosition?(position: { x: number; y: number } | null): void
  /** Removed in Electron 28+ — kept for older runtimes only. */
  setTrafficLightPosition?(position: { x: number; y: number } | null): void
}

/** Electron 28+ renamed `setTrafficLightPosition` → `setWindowButtonPosition`. */
export function applyMacTrafficLightPosition(
  win: TrafficLightCapableWindow,
  isFullScreen = false,
): void {
  if (process.platform !== 'darwin') return
  const position = isFullScreen ? null : macTrafficLightPosition()
  if (typeof win.setWindowButtonPosition === 'function') {
    win.setWindowButtonPosition(position)
    return
  }
  if (typeof win.setTrafficLightPosition === 'function') {
    win.setTrafficLightPosition(position)
  }
}
