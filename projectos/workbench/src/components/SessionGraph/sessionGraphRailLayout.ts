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
  children: SessionGraphRailEntry[]
}

export type SessionGraphRailEntry =
  | SessionGraphRailGraphEntry
  | SessionGraphRailFolderEntry

export interface SessionGraphRailLayout {
  version: 3
  entries: SessionGraphRailEntry[]
}

/** @deprecated flat folder graphIds (migrated on load). */
interface LegacyRailLayoutV2 {
  version: 2
  entries: Array<
    | { kind: 'graph'; graphId: string }
    | { kind: 'folder'; id: string; title: string; graphIds: string[] }
  >
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
  return { version: 3, entries: [] }
}

export function loadSessionGraphRailLayout(
  projectId: string,
  heads: ChatSessionHead[] = [],
): SessionGraphRailLayout {
  if (typeof localStorage === 'undefined') return emptySessionGraphRailLayout()
  try {
    const raw = localStorage.getItem(`${LAYOUT_KEY_PREFIX}${projectId}`)
    if (!raw) return emptySessionGraphRailLayout()
    const parsed = JSON.parse(raw) as
      | SessionGraphRailLayout
      | LegacyRailLayoutV2
      | LegacyRailLayoutV1
    if (parsed?.version === 3 && Array.isArray(parsed.entries)) {
      return { version: 3, entries: sanitizeEntries(parsed.entries) }
    }
    if (parsed?.version === 2 && Array.isArray(parsed.entries)) {
      return migrateV2Layout(parsed)
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
      JSON.stringify({ version: 3, entries: sanitizeEntries(layout.entries) }),
    )
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function migrateV2Layout(legacy: LegacyRailLayoutV2): SessionGraphRailLayout {
  return {
    version: 3,
    entries: sanitizeEntries(
      legacy.entries.map((entry) => {
        if (entry.kind === 'graph') return entry
        return {
          kind: 'folder' as const,
          id: entry.id,
          title: entry.title || '',
          children: (entry.graphIds ?? []).map((graphId) => ({
            kind: 'graph' as const,
            graphId,
          })),
        }
      }),
    ),
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
    const children: SessionGraphRailEntry[] = []
    for (const sessionId of entry.sessionIds ?? []) {
      const head = byId.get(sessionId)
      const graphId = head ? resolveSessionGraphId(head) : null
      if (!graphId || seen.has(graphId)) continue
      seen.add(graphId)
      children.push({ kind: 'graph', graphId })
    }
    entries.push({
      kind: 'folder',
      id: entry.id,
      title: entry.title || '',
      children,
    })
  }
  return { version: 3, entries: sanitizeEntries(entries) }
}

function sanitizeEntries(entries: SessionGraphRailEntry[]): SessionGraphRailEntry[] {
  const seenGraphs = new Set<string>()
  const seenFolders = new Set<string>()

  const walk = (list: SessionGraphRailEntry[]): SessionGraphRailEntry[] => {
    const out: SessionGraphRailEntry[] = []
    for (const entry of list) {
      if (entry.kind === 'graph') {
        if (!entry.graphId || seenGraphs.has(entry.graphId)) continue
        seenGraphs.add(entry.graphId)
        out.push({ kind: 'graph', graphId: entry.graphId })
        continue
      }
      if (entry.kind !== 'folder' || !entry.id || seenFolders.has(entry.id)) continue
      seenFolders.add(entry.id)
      const legacyGraphIds = (entry as { graphIds?: string[] }).graphIds
      const rawChildren =
        Array.isArray(entry.children) && entry.children.length > 0
          ? entry.children
          : (legacyGraphIds ?? []).map((graphId) => ({
              kind: 'graph' as const,
              graphId,
            }))
      out.push({
        kind: 'folder',
        id: entry.id,
        title: typeof entry.title === 'string' ? entry.title : '',
        children: walk(rawChildren),
      })
    }
    return out
  }

  return walk(entries)
}

export function collectGraphIds(entries: SessionGraphRailEntry[]): string[] {
  const ids: string[] = []
  const walk = (list: SessionGraphRailEntry[]) => {
    for (const entry of list) {
      if (entry.kind === 'graph') ids.push(entry.graphId)
      else walk(entry.children)
    }
  }
  walk(entries)
  return ids
}

export function countFolderItems(folder: SessionGraphRailFolderEntry): number {
  return collectGraphIds(folder.children).length
}

export function folderContainsActive(
  folder: SessionGraphRailFolderEntry,
  activeGraphId: string | null,
): boolean {
  if (!activeGraphId) return false
  return collectGraphIds(folder.children).includes(activeGraphId)
}

export function findFolderEntry(
  entries: SessionGraphRailEntry[],
  folderId: string,
): SessionGraphRailFolderEntry | null {
  for (const entry of entries) {
    if (entry.kind === 'folder') {
      if (entry.id === folderId) return entry
      const nested = findFolderEntry(entry.children, folderId)
      if (nested) return nested
    }
  }
  return null
}

function isDescendantFolder(
  entries: SessionGraphRailEntry[],
  ancestorId: string,
  maybeDescendantId: string,
): boolean {
  const ancestor = findFolderEntry(entries, ancestorId)
  if (!ancestor) return false
  const walk = (list: SessionGraphRailEntry[]): boolean => {
    for (const entry of list) {
      if (entry.kind !== 'folder') continue
      if (entry.id === maybeDescendantId) return true
      if (walk(entry.children)) return true
    }
    return false
  }
  return walk(ancestor.children)
}

function mapEntries(
  entries: SessionGraphRailEntry[],
  mapper: (entry: SessionGraphRailEntry) => SessionGraphRailEntry | null,
): SessionGraphRailEntry[] {
  const out: SessionGraphRailEntry[] = []
  for (const entry of entries) {
    if (entry.kind === 'folder') {
      const nextFolder: SessionGraphRailFolderEntry = {
        ...entry,
        children: mapEntries(entry.children, mapper),
      }
      const mapped = mapper(nextFolder)
      if (mapped) out.push(mapped)
      continue
    }
    const mapped = mapper(entry)
    if (mapped) out.push(mapped)
  }
  return out
}

function extractMatching(
  entries: SessionGraphRailEntry[],
  match: (entry: SessionGraphRailEntry) => boolean,
): { entries: SessionGraphRailEntry[]; extracted: SessionGraphRailEntry | null } {
  let extracted: SessionGraphRailEntry | null = null
  const walk = (list: SessionGraphRailEntry[]): SessionGraphRailEntry[] => {
    const out: SessionGraphRailEntry[] = []
    for (const entry of list) {
      if (extracted == null && match(entry)) {
        extracted = entry
        continue
      }
      if (entry.kind === 'folder') {
        out.push({ ...entry, children: walk(entry.children) })
        continue
      }
      out.push(entry)
    }
    return out
  }
  return { entries: walk(entries), extracted }
}

function insertIntoFolderChildren(
  entries: SessionGraphRailEntry[],
  folderId: string,
  item: SessionGraphRailEntry,
): SessionGraphRailEntry[] {
  return entries.map((entry) => {
    if (entry.kind !== 'folder') return entry
    if (entry.id === folderId) {
      return { ...entry, children: [...entry.children, item] }
    }
    return {
      ...entry,
      children: insertIntoFolderChildren(entry.children, folderId, item),
    }
  })
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
  const known = new Set(collectGraphIds(layout.entries))
  const pruned = sanitizeEntries(
    mapEntries(layout.entries, (entry) => {
      if (entry.kind === 'graph') {
        return live.has(entry.graphId) ? entry : null
      }
      return entry
    }),
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
  return { version: 3, entries: [...pruned, ...extras] }
}

export function createRailFolder(
  layout: SessionGraphRailLayout,
  title: string,
): { layout: SessionGraphRailLayout; folderId: string } {
  const folderId = `folder_${crypto.randomUUID()}`
  return {
    folderId,
    layout: {
      version: 3,
      entries: [
        ...layout.entries,
        {
          kind: 'folder',
          id: folderId,
          title: title.trim() || 'Folder',
          children: [],
        },
      ],
    },
  }
}

export function renameRailFolder(
  layout: SessionGraphRailLayout,
  folderId: string,
  title: string,
): SessionGraphRailLayout {
  const next = title.trim() || 'Folder'
  return {
    version: 3,
    entries: mapEntries(layout.entries, (entry) =>
      entry.kind === 'folder' && entry.id === folderId
        ? { ...entry, title: next }
        : entry,
    ),
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
  return { version: 3, entries }
}

export function removeGraphFromLayout(
  layout: SessionGraphRailLayout,
  graphId: string,
): SessionGraphRailLayout {
  return {
    version: 3,
    entries: sanitizeEntries(
      mapEntries(layout.entries, (entry) =>
        entry.kind === 'graph' && entry.graphId === graphId ? null : entry,
      ),
    ),
  }
}

export function removeFolderFromLayout(
  layout: SessionGraphRailLayout,
  folderId: string,
): SessionGraphRailLayout {
  const lift = (list: SessionGraphRailEntry[]): SessionGraphRailEntry[] => {
    const out: SessionGraphRailEntry[] = []
    for (const entry of list) {
      if (entry.kind === 'folder' && entry.id === folderId) {
        out.push(...entry.children)
        continue
      }
      if (entry.kind === 'folder') {
        out.push({ ...entry, children: lift(entry.children) })
        continue
      }
      out.push(entry)
    }
    return out
  }
  return { version: 3, entries: sanitizeEntries(lift(layout.entries)) }
}

export function moveGraphIntoFolder(
  layout: SessionGraphRailLayout,
  graphId: string,
  folderId: string,
): SessionGraphRailLayout {
  if (!findFolderEntry(layout.entries, folderId)) return layout
  const without = removeGraphFromLayout(layout, graphId)
  return {
    version: 3,
    entries: sanitizeEntries(
      insertIntoFolderChildren(without.entries, folderId, {
        kind: 'graph',
        graphId,
      }),
    ),
  }
}

export function moveFolderIntoFolder(
  layout: SessionGraphRailLayout,
  folderId: string,
  targetFolderId: string,
): SessionGraphRailLayout {
  if (folderId === targetFolderId) return layout
  if (!findFolderEntry(layout.entries, targetFolderId)) return layout
  if (isDescendantFolder(layout.entries, folderId, targetFolderId)) return layout
  const { entries, extracted } = extractMatching(
    layout.entries,
    (entry) => entry.kind === 'folder' && entry.id === folderId,
  )
  if (!extracted || extracted.kind !== 'folder') return layout
  return {
    version: 3,
    entries: sanitizeEntries(
      insertIntoFolderChildren(entries, targetFolderId, extracted),
    ),
  }
}

export function insertFolderOnRail(
  layout: SessionGraphRailLayout,
  folderId: string,
  atIndex?: number,
): SessionGraphRailLayout {
  const { entries, extracted } = extractMatching(
    layout.entries,
    (entry) => entry.kind === 'folder' && entry.id === folderId,
  )
  if (!extracted || extracted.kind !== 'folder') return layout
  const next = [...entries]
  const index =
    atIndex == null ? next.length : Math.max(0, Math.min(next.length, atIndex))
  next.splice(index, 0, extracted)
  return { version: 3, entries: sanitizeEntries(next) }
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
  return { version: 3, entries }
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
