import {
  SESSION_NODE_HEIGHT,
  SESSION_NODE_WIDTH,
  type SessionGraphLayout,
} from './layoutSessionGraph'

export interface SessionGraphPoint {
  x: number
  y: number
}

/** Per-session manual positions for one topic graph. */
export type SessionGraphCanvasPositions = Record<string, SessionGraphPoint>

export interface SessionGraphCanvasLayout {
  version: 1
  /** graphId → sessionId → { x, y } in world coordinates. */
  graphs: Record<string, SessionGraphCanvasPositions>
}

const LAYOUT_KEY_PREFIX = 'projectos_session_graph_canvas_'
const WORLD_PAD = 40

export function emptySessionGraphCanvasLayout(): SessionGraphCanvasLayout {
  return { version: 1, graphs: {} }
}

export function loadSessionGraphCanvasLayout(projectId: string): SessionGraphCanvasLayout {
  if (typeof localStorage === 'undefined') return emptySessionGraphCanvasLayout()
  try {
    const raw = localStorage.getItem(`${LAYOUT_KEY_PREFIX}${projectId}`)
    if (!raw) return emptySessionGraphCanvasLayout()
    const parsed = JSON.parse(raw) as SessionGraphCanvasLayout
    if (parsed?.version !== 1 || !parsed.graphs || typeof parsed.graphs !== 'object') {
      return emptySessionGraphCanvasLayout()
    }
    const graphs: Record<string, SessionGraphCanvasPositions> = {}
    for (const [graphId, positions] of Object.entries(parsed.graphs)) {
      if (!positions || typeof positions !== 'object') continue
      const next: SessionGraphCanvasPositions = {}
      for (const [sessionId, point] of Object.entries(positions)) {
        if (!isFinitePoint(point)) continue
        next[sessionId] = { x: point.x, y: point.y }
      }
      graphs[graphId] = next
    }
    return { version: 1, graphs }
  } catch {
    return emptySessionGraphCanvasLayout()
  }
}

export function saveSessionGraphCanvasLayout(
  projectId: string,
  layout: SessionGraphCanvasLayout,
): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(`${LAYOUT_KEY_PREFIX}${projectId}`, JSON.stringify(layout))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function isFinitePoint(value: unknown): value is SessionGraphPoint {
  if (!value || typeof value !== 'object') return false
  const point = value as SessionGraphPoint
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

export function getGraphCanvasPositions(
  layout: SessionGraphCanvasLayout,
  graphId: string | null,
): SessionGraphCanvasPositions {
  if (!graphId) return {}
  return layout.graphs[graphId] ?? {}
}

export function setSessionCanvasPosition(
  layout: SessionGraphCanvasLayout,
  graphId: string,
  sessionId: string,
  point: SessionGraphPoint,
): SessionGraphCanvasLayout {
  const current = layout.graphs[graphId] ?? {}
  return {
    version: 1,
    graphs: {
      ...layout.graphs,
      [graphId]: {
        ...current,
        [sessionId]: { x: point.x, y: point.y },
      },
    },
  }
}

/** Drop overrides for sessions that no longer belong to the graph. */
export function pruneGraphCanvasPositions(
  layout: SessionGraphCanvasLayout,
  graphId: string,
  liveSessionIds: Iterable<string>,
): SessionGraphCanvasLayout {
  const current = layout.graphs[graphId]
  if (!current) return layout
  const live = new Set(liveSessionIds)
  let changed = false
  const next: SessionGraphCanvasPositions = {}
  for (const [sessionId, point] of Object.entries(current)) {
    if (!live.has(sessionId)) {
      changed = true
      continue
    }
    next[sessionId] = point
  }
  if (!changed && Object.keys(next).length === Object.keys(current).length) return layout
  if (Object.keys(next).length === 0) {
    const graphs = { ...layout.graphs }
    delete graphs[graphId]
    return { version: 1, graphs }
  }
  return {
    version: 1,
    graphs: {
      ...layout.graphs,
      [graphId]: next,
    },
  }
}

/**
 * Overlay manual positions onto an ELK layout and expand the world so
 * dragged nodes remain inside the pannable bounds.
 */
export function applyCanvasPositionOverrides(
  layout: SessionGraphLayout,
  overrides: SessionGraphCanvasPositions,
): SessionGraphLayout {
  if (Object.keys(overrides).length === 0) return layout

  const positions = { ...layout.positions }
  let width = layout.width
  let height = layout.height

  for (const [id, point] of Object.entries(overrides)) {
    if (!(id in positions)) continue
    const x = Math.max(0, point.x)
    const y = Math.max(0, point.y)
    positions[id] = { x, y }
    const nodeHeight = layout.heights[id] ?? SESSION_NODE_HEIGHT
    width = Math.max(width, x + SESSION_NODE_WIDTH + WORLD_PAD)
    height = Math.max(height, y + nodeHeight + WORLD_PAD)
  }

  return { ...layout, positions, width, height }
}
