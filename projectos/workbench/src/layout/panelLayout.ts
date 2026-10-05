export const PANEL_LAYOUT_STORAGE_KEY = 'projectos_panel_layout'

/** Previous default — migrate stored layouts to the narrower tree width. */
const LEGACY_LEFT_PANEL_WIDTH = 380

export const DEFAULT_LEFT_PANEL_WIDTH = 253
export const DEFAULT_RIGHT_PANEL_WIDTH = 380
export const LEFT_PANEL_MIN_WIDTH = 200
export const RIGHT_PANEL_MIN_WIDTH = 280
export const PANEL_MAX_WIDTH_CAP = 480
export const TERMINAL_MIN_HEIGHT = 120
export const TERMINAL_MAX_HEIGHT_CAP = 480
export const CENTER_MIN_WIDTH = 400

export interface PanelDimensions {
  leftPanelWidth: number
  rightPanelWidth: number
  terminalHeight: number
}

export function defaultTerminalHeight(viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800): number {
  return Math.min(Math.round(viewportHeight * 0.4), 320)
}

export function maxPanelWidth(viewportWidth: number): number {
  return Math.min(Math.round(viewportWidth * 0.92), PANEL_MAX_WIDTH_CAP)
}

export function maxTerminalHeight(viewportHeight: number): number {
  return Math.min(Math.round(viewportHeight * 0.55), TERMINAL_MAX_HEIGHT_CAP)
}

export function clampPanelDimensions(
  dims: PanelDimensions,
  viewport: { width: number; height: number },
  options?: { leftOpen?: boolean; rightOpen?: boolean },
): PanelDimensions {
  let left = Math.max(LEFT_PANEL_MIN_WIDTH, Math.min(maxPanelWidth(viewport.width), dims.leftPanelWidth))
  let right = Math.max(RIGHT_PANEL_MIN_WIDTH, Math.min(maxPanelWidth(viewport.width), dims.rightPanelWidth))
  const terminal = Math.max(
    TERMINAL_MIN_HEIGHT,
    Math.min(maxTerminalHeight(viewport.height), dims.terminalHeight),
  )

  const leftOpen = options?.leftOpen ?? true
  const rightOpen = options?.rightOpen ?? true

  if (leftOpen && rightOpen) {
    const maxCombined = Math.max(LEFT_PANEL_MIN_WIDTH + RIGHT_PANEL_MIN_WIDTH, viewport.width - CENTER_MIN_WIDTH)
    if (left + right > maxCombined) {
      const excess = left + right - maxCombined
      const leftShrink = Math.min(excess, left - LEFT_PANEL_MIN_WIDTH)
      left -= leftShrink
      const remaining = excess - leftShrink
      right = Math.max(RIGHT_PANEL_MIN_WIDTH, right - remaining)
      if (left + right > maxCombined) {
        left = Math.max(LEFT_PANEL_MIN_WIDTH, maxCombined - right)
      }
    }
  } else if (leftOpen) {
    left = Math.min(left, Math.max(LEFT_PANEL_MIN_WIDTH, viewport.width - CENTER_MIN_WIDTH))
  } else if (rightOpen) {
    right = Math.min(right, Math.max(RIGHT_PANEL_MIN_WIDTH, viewport.width - CENTER_MIN_WIDTH))
  }

  return { leftPanelWidth: left, rightPanelWidth: right, terminalHeight: terminal }
}

export function defaultPanelDimensions(): PanelDimensions {
  const viewport = typeof window !== 'undefined' ? { width: window.innerWidth, height: window.innerHeight } : { width: 1280, height: 800 }
  return clampPanelDimensions(
    {
      leftPanelWidth: DEFAULT_LEFT_PANEL_WIDTH,
      rightPanelWidth: DEFAULT_RIGHT_PANEL_WIDTH,
      terminalHeight: defaultTerminalHeight(viewport.height),
    },
    viewport,
  )
}

export function loadPanelLayout(): PanelDimensions {
  if (typeof window === 'undefined') {
    return defaultPanelDimensions()
  }
  try {
    const raw = localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PanelDimensions>
      const storedLeft = parsed.leftPanelWidth
      const leftPanelWidth =
        storedLeft === LEGACY_LEFT_PANEL_WIDTH ? DEFAULT_LEFT_PANEL_WIDTH : (storedLeft ?? DEFAULT_LEFT_PANEL_WIDTH)
      return clampPanelDimensions(
        {
          leftPanelWidth,
          rightPanelWidth: parsed.rightPanelWidth ?? DEFAULT_RIGHT_PANEL_WIDTH,
          terminalHeight: parsed.terminalHeight ?? defaultTerminalHeight(),
        },
        { width: window.innerWidth, height: window.innerHeight },
      )
    }
  } catch {
    /* ignore corrupt storage */
  }
  return defaultPanelDimensions()
}

export function savePanelLayout(dims: PanelDimensions): void {
  try {
    localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(dims))
  } catch {
    /* ignore quota errors */
  }
}
