import type { ArchitectureLevel } from '@contracts/index'

export interface C4LayoutOverlayEntry {
  x: number
  y: number
}

export interface C4LayoutOverlayDocument {
  version: 1
  /** keyed by `${level}::${scopeId ?? 'root'}::${nodeId}` */
  positions: Record<string, C4LayoutOverlayEntry>
}

function storageKey(projectId: string): string {
  return `projectos:c4-layout-overlay:${projectId}`
}

/** In-memory fallback when `localStorage` is unavailable (tests / SSR). */
const memoryStore = new Map<string, string>()

function readStorage(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key)
    }
  } catch {
    /* ignore */
  }
  return memoryStore.get(key) ?? null
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value)
      return
    }
  } catch {
    /* fall through to memory */
  }
  memoryStore.set(key, value)
}

function removeStorage(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key)
    }
  } catch {
    /* ignore */
  }
  memoryStore.delete(key)
}

export function clearC4LayoutOverlay(projectId: string): void {
  removeStorage(storageKey(projectId))
}

export function layoutOverlayKey(
  level: ArchitectureLevel,
  scopeId: string | null | undefined,
  nodeId: string,
): string {
  return `${level}::${scopeId ?? 'root'}::${nodeId}`
}

export function loadC4LayoutOverlay(projectId: string): C4LayoutOverlayDocument {
  try {
    const raw = readStorage(storageKey(projectId))
    if (!raw) return { version: 1, positions: {} }
    const parsed = JSON.parse(raw) as C4LayoutOverlayDocument
    if (!parsed || parsed.version !== 1 || typeof parsed.positions !== 'object') {
      return { version: 1, positions: {} }
    }
    return parsed
  } catch {
    return { version: 1, positions: {} }
  }
}

export function saveC4LayoutOverlay(
  projectId: string,
  document: C4LayoutOverlayDocument,
): void {
  writeStorage(storageKey(projectId), JSON.stringify(document))
}

export function upsertC4LayoutPositions(
  projectId: string,
  level: ArchitectureLevel,
  scopeId: string | null | undefined,
  updates: Record<string, C4LayoutOverlayEntry>,
): C4LayoutOverlayDocument {
  const current = loadC4LayoutOverlay(projectId)
  const next: C4LayoutOverlayDocument = {
    version: 1,
    positions: { ...current.positions },
  }
  for (const [nodeId, position] of Object.entries(updates)) {
    next.positions[layoutOverlayKey(level, scopeId, nodeId)] = position
  }
  // Drop stale keys for this view that no longer exist in updates merge set
  // (caller should pass only live node ids when pruning).
  saveC4LayoutOverlay(projectId, next)
  return next
}

export function pruneC4LayoutOverlayForView(
  projectId: string,
  level: ArchitectureLevel,
  scopeId: string | null | undefined,
  liveNodeIds: Iterable<string>,
): C4LayoutOverlayDocument {
  const current = loadC4LayoutOverlay(projectId)
  const prefix = `${level}::${scopeId ?? 'root'}::`
  const live = new Set(
    [...liveNodeIds].map((id) => layoutOverlayKey(level, scopeId, id)),
  )
  const positions: Record<string, C4LayoutOverlayEntry> = {}
  for (const [key, value] of Object.entries(current.positions)) {
    if (key.startsWith(prefix) && !live.has(key)) continue
    positions[key] = value
  }
  const next = { version: 1 as const, positions }
  saveC4LayoutOverlay(projectId, next)
  return next
}

export function applyOverlayToPositions(
  overlay: C4LayoutOverlayDocument,
  level: ArchitectureLevel,
  scopeId: string | null | undefined,
  positionsById: Record<string, { x: number; y: number }>,
): Record<string, { x: number; y: number }> {
  const next = { ...positionsById }
  for (const nodeId of Object.keys(positionsById)) {
    const key = layoutOverlayKey(level, scopeId, nodeId)
    const override = overlay.positions[key]
    if (override) next[nodeId] = { x: override.x, y: override.y }
  }
  return next
}
