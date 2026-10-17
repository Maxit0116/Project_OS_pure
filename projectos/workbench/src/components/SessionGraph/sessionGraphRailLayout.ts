import type { ChatSessionHead } from '@contracts/index'
import {
  listTopicGraphIds,
  pickGraphRepresentative,
  resolveSessionGraphId,
  summarizeSessionGraphTitle,
} from '@contracts/index'

export type SessionGraphRailGraphEntry = {
  kind: 'graph'
  graphId: string
}

export type SessionGraphRailFolderEntry = {
  kind: 'folder'
  id: string
  title: string
  graphIds: string[]
}

export type SessionGraphRailEntry =
  | SessionGraphRailGraphEntry
  | SessionGraphRailFolderEntry

export interface SessionGraphRailLayout {
  version: 2
  entries: SessionGraphRailEntry[]
}

/** @deprecated legacy session-pinned rail (migrated on load). */
interface LegacyRailLayoutV1 {
  version: 1
  entries: Array<
    | { kind: 'session'; sessionId: string }
    | { kind: 'folder'; id: string; title: string; sessionIds: string[] }
  >
}

const LAYOUT_KEY_PREFIX = 'projectos_session_graph_rail_'

export function emptySessionGraphRailLayout(): SessionGraphRailLayout {
  return { version: 2, entries: [] }
}

export function loadSessionGraphRailLayout(
  projectId: string,
  heads: ChatSessionHead[] = [],
): SessionGraphRailLayout {
  if (typeof localStorage === 'undefined') return emptySessionGraphRailLayout()
  try {
    const raw = localStorage.getItem(`${LAYOUT_KEY_PREFIX}${projectId}`)
    if (!raw) return emptySessionGraphRailLayout()
    const parsed = JSON.parse(raw) as SessionGraphRailLayout | LegacyRailLayoutV1
    if (parsed?.version === 2 && Array.isArray(parsed.entries)) {
      return { version: 2, entries: sanitizeEntries(parsed.entries) }
    }
    if (parsed?.version === 1 && Array.isArray(parsed.entries)) {
      return migrateV1Layout(parsed, heads)
    }
    return emptySessionGraphRailLayout()
  } catch {
    return emptySessionGraphRailLayout()
  }
}

export function saveSessionGraphRailLayout(
  projectId: string,
  layout: SessionGraphRailLayout,
): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      `${LAYOUT_KEY_PREFIX}${projectId}`,
      JSON.stringify({ version: 2, entries: sanitizeEntries(layout.entries) }),
    )
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function migrateV1Layout(
  legacy: LegacyRailLayoutV1,
  heads: ChatSessionHead[],
): SessionGraphRailLayout {
  const byId = new Map(heads.map((head) => [head.id, head]))
  const entries: SessionGraphRailEntry[] = []
  const seen = new Set<string>()
  for (const entry of legacy.entries) {
    if (entry.kind === 'session') {
      const head = byId.get(entry.sessionId)
      const graphId = head ? resolveSessionGraphId(head) : null
      if (!graphId || seen.has(graphId)) continue
      seen.add(graphId)
      entries.push({ kind: 'graph', graphId })
      continue
    }
    const graphIds: string[] = []
    for (const sessionId of entry.sessionIds ?? []) {
      const head = byId.get(sessionId)
      const graphId = head ? resolveSessionGraphId(head) : null
      if (!graphId || seen.has(graphId)) continue
      seen.add(graphId)
      graphIds.push(graphId)
    }
    entries.push({
      kind: 'folder',
      id: entry.id,
      title: entry.title || '',
      graphIds,
    })
  }
  return { version: 2, entries: sanitizeEntries(entries) }
}

function sanitizeEntries(entries: SessionGraphRailEntry[]): SessionGraphRailEntry[] {
  const seen = new Set<string>()
  const out: SessionGraphRailEntry[] = []
  for (const entry of entries) {
    if (entry.kind === 'graph') {
      if (!entry.graphId || seen.has(entry.graphId)) continue
      seen.add(entry.graphId)
      out.push({ kind: 'graph', graphId: entry.graphId })
      continue
    }
    if (entry.kind !== 'folder' || !entry.id) continue
    const graphIds: string[] = []
    for (const id of entry.graphIds ?? []) {
      if (!id || seen.has(id)) continue
      seen.add(id)
      graphIds.push(id)
    }
    out.push({
      kind: 'folder',
      id: entry.id,
      title: typeof entry.title === 'string' ? entry.title : '',
      graphIds,
    })
  }
  return out
}

/**
 * Keep rail graph entries in sync with real topic graphs:
 * prune empty/missing graphs; append any topic graph not yet on the rail.
 */
export function syncRailLayoutWithGraphs(
  layout: SessionGraphRailLayout,
  heads: ChatSessionHead[],
): SessionGraphRailLayout {
  const live = new Set(listTopicGraphIds(heads))
  const known = new Set(
    layout.entries.flatMap((entry) =>
      entry.kind === 'graph' ? [entry.graphId] : entry.graphIds,
    ),
  )
  const pruned = sanitizeEntries(
    layout.entries
      .map((entry) => {
        if (entry.kind === 'graph') {
          return live.has(entry.graphId) ? entry : null
        }
        return {
          ...entry,
          graphIds: entry.graphIds.filter((id) => live.has(id)),
        }
      })
      .filter((entry): entry is SessionGraphRailEntry => entry != null),
  )
  const extras: SessionGraphRailGraphEntry[] = []
  for (const graphId of live) {
    if (known.has(graphId)) continue
    extras.push({ kind: 'graph', graphId })
    known.add(graphId)
  }
  extras.sort((a, b) => {
    const ra = pickGraphRepresentative(heads, a.graphId)
    const rb = pickGraphRepresentative(heads, b.graphId)
    return (rb?.lastUpdatedAt ?? '').localeCompare(ra?.lastUpdatedAt ?? '')
  })
  return { version: 2, entries: [...pruned, ...extras] }
}

export function createRailFolder(
  layout: SessionGraphRailLayout,
  title: string,
): SessionGraphRailLayout {
  const id = `folder_${crypto.randomUUID()}`
  return {
    version: 2,
    entries: [
      ...layout.entries,
      { kind: 'folder', id, title: title.trim() || 'Folder', graphIds: [] },
    ],
  }
}

export function reorderRailEntries(
  layout: SessionGraphRailLayout,
  fromIndex: number,
  toIndex: number,
): SessionGraphRailLayout {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= layout.entries.length ||
    toIndex > layout.entries.length ||
    fromIndex === toIndex ||
    fromIndex === toIndex - 1
  ) {
    return layout
  }
  const entries = [...layout.entries]
  const [moved] = entries.splice(fromIndex, 1)
  if (!moved) return layout
  const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex
  entries.splice(insertAt, 0, moved)
  return { version: 2, entries }
}

export function removeGraphFromLayout(
  layout: SessionGraphRailLayout,
  graphId: string,
): SessionGraphRailLayout {
  return {
    version: 2,
    entries: layout.entries
      .map((entry) => {
        if (entry.kind === 'graph') {
          return entry.graphId === graphId ? null : entry
        }
        return {
          ...entry,
          graphIds: entry.graphIds.filter((id) => id !== graphId),
        }
      })
      .filter((entry): entry is SessionGraphRailEntry => entry != null),
  }
}

export function removeFolderFromLayout(
  layout: SessionGraphRailLayout,
  folderId: string,
): SessionGraphRailLayout {
  const entries: SessionGraphRailEntry[] = []
  for (const entry of layout.entries) {
    if (entry.kind === 'folder' && entry.id === folderId) {
      for (const graphId of entry.graphIds) {
        entries.push({ kind: 'graph', graphId })
      }
      continue
    }
    entries.push(entry)
  }
  return { version: 2, entries: sanitizeEntries(entries) }
}

export function moveGraphIntoFolder(
  layout: SessionGraphRailLayout,
  graphId: string,
  folderId: string,
): SessionGraphRailLayout {
  const without = removeGraphFromLayout(layout, graphId)
  return {
    version: 2,
    entries: without.entries.map((entry) => {
      if (entry.kind !== 'folder' || entry.id !== folderId) return entry
      if (entry.graphIds.includes(graphId)) return entry
      return { ...entry, graphIds: [...entry.graphIds, graphId] }
    }),
  }
}

export function findRailGraphIndex(
  layout: SessionGraphRailLayout,
  graphId: string,
): number {
  return layout.entries.findIndex(
    (entry) => entry.kind === 'graph' && entry.graphId === graphId,
  )
}

export function insertGraphOnRail(
  layout: SessionGraphRailLayout,
  graphId: string,
  atIndex?: number,
): SessionGraphRailLayout {
  const without = removeGraphFromLayout(layout, graphId)
  const entry: SessionGraphRailGraphEntry = { kind: 'graph', graphId }
  const entries = [...without.entries]
  const index =
    atIndex == null ? entries.length : Math.max(0, Math.min(entries.length, atIndex))
  entries.splice(index, 0, entry)
  return { version: 2, entries }
}

export function replaceGraphOnRail(
  layout: SessionGraphRailLayout,
  fromGraphId: string,
  toGraphId: string,
): SessionGraphRailLayout {
  if (fromGraphId === toGraphId) return removeGraphFromLayout(layout, fromGraphId)
  const withoutFrom = removeGraphFromLayout(layout, fromGraphId)
  return insertGraphOnRail(withoutFrom, toGraphId)
}

export function resolveActiveGraphId(
  heads: ChatSessionHead[],
  activeSessionId: string | null,
  preferredGraphId: string | null = null,
): string | null {
  if (preferredGraphId && listTopicGraphIds(heads).includes(preferredGraphId)) {
    return preferredGraphId
  }
  const firstTopicGraph = (): string | null => {
    const ids = listTopicGraphIds(heads)
    return ids[0] ?? null
  }
  if (!activeSessionId) return firstTopicGraph()
  const active = heads.find((head) => head.id === activeSessionId)
  if (!active || active.isArchived) return firstTopicGraph()
  return resolveSessionGraphId(active) ?? firstTopicGraph()
}

export function graphRailTitle(
  heads: ChatSessionHead[],
  graphId: string,
  untitled: string,
): string {
  return summarizeSessionGraphTitle(heads, graphId, untitled)
}
