import type { ArchitectureLevel } from '@contracts/index'

export interface C4LayoutOverlayEntry {
  x: number
  y: number
}

export interface C4LayoutOverlayDocument {
  version: 2
  /** keyed by `${viewKey|level}::${scopeId ?? 'root'}::${nodeId}` */
  positions: Record<string, C4LayoutOverlayEntry>
  /** Collapsed boundary ids keyed by view bucket prefix. */
  collapsedBoundaries: Record<string, string[]>
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

function viewBucket(
  level: ArchitectureLevel,
  scopeId: string | null | undefined,
  viewKey?: string | null,
): string {
  if (viewKey) return viewKey
  return `${level}::${scopeId ?? 'root'}`
}

export function layoutOverlayKey(
  level: ArchitectureLevel,
  scopeId: string | null | undefined,
  nodeId: string,
  viewKey?: string | null,
): string {
  return `${viewBucket(level, scopeId, viewKey)}::${nodeId}`
}

export function loadC4LayoutOverlay(projectId: string): C4LayoutOverlayDocument {
  try {
    const raw = readStorage(storageKey(projectId))
    if (!raw) return { version: 2, positions: {}, collapsedBoundaries: {} }
    const parsed = JSON.parse(raw) as Partial<C4LayoutOverlayDocument> & {
      version?: number
    }
    if (!parsed || typeof parsed.positions !== 'object') {
      return { version: 2, positions: {}, collapsedBoundaries: {} }
    }
    return {
      version: 2,
      positions: parsed.positions ?? {},
      collapsedBoundaries: parsed.collapsedBoundaries ?? {},
    }
  } catch {
    return { version: 2, positions: {}, collapsedBoundaries: {} }
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
  viewKey?: string | null,
): C4LayoutOverlayDocument {
  const current = loadC4LayoutOverlay(projectId)
  const next: C4LayoutOverlayDocument = {
    version: 2,
    positions: { ...current.positions },
    collapsedBoundaries: { ...current.collapsedBoundaries },
  }
  for (const [nodeId, position] of Object.entries(updates)) {
    next.positions[layoutOverlayKey(level, scopeId, nodeId, viewKey)] = position
  }
  saveC4LayoutOverlay(projectId, next)
  return next
}

export function pruneC4LayoutOverlayForView(
  projectId: string,
  level: ArchitectureLevel,
  scopeId: string | null | undefined,
  liveNodeIds: Iterable<string>,
  viewKey?: string | null,
): C4LayoutOverlayDocument {
  const current = loadC4LayoutOverlay(projectId)
  const prefix = `${viewBucket(level, scopeId, viewKey)}::`
  const live = new Set(
    [...liveNodeIds].map((id) => layoutOverlayKey(level, scopeId, id, viewKey)),
  )
  const positions: Record<string, C4LayoutOverlayEntry> = {}
  for (const [key, value] of Object.entries(current.positions)) {
    if (key.startsWith(prefix) && !live.has(key)) continue
    positions[key] = value
  }
  const next = {
    version: 2 as const,
    positions,
    collapsedBoundaries: current.collapsedBoundaries,
  }
  saveC4LayoutOverlay(projectId, next)
  return next
}

export function clearC4LayoutOverlayForView(
  projectId: string,
  level: ArchitectureLevel,
  scopeId: string | null | undefined,
  viewKey?: string | null,
): C4LayoutOverlayDocument {
  const current = loadC4LayoutOverlay(projectId)
  const prefix = `${viewBucket(level, scopeId, viewKey)}::`
  const positions: Record<string, C4LayoutOverlayEntry> = {}
  for (const [key, value] of Object.entries(current.positions)) {
    if (key.startsWith(prefix)) continue
    positions[key] = value
  }
  const collapsedBoundaries = { ...current.collapsedBoundaries }
  delete collapsedBoundaries[viewBucket(level, scopeId, viewKey)]
  const next = { version: 2 as const, positions, collapsedBoundaries }
  saveC4LayoutOverlay(projectId, next)
  return next
}

export function applyOverlayToPositions(
  overlay: C4LayoutOverlayDocument,
  level: ArchitectureLevel,
  scopeId: string | null | undefined,
  positionsById: Record<string, { x: number; y: number }>,
  viewKey?: string | null,
): Record<string, { x: number; y: number }> {
  const next = { ...positionsById }
  for (const nodeId of Object.keys(positionsById)) {
    const key = layoutOverlayKey(level, scopeId, nodeId, viewKey)
    const override = overlay.positions[key]
    if (override) next[nodeId] = { x: override.x, y: override.y }
  }
  return next
}
