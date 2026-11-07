import type { LoopGraphHead } from '@contracts/index'

export type LoopGraphRailLoopEntry = {
  kind: 'loop'
  loopId: string
}

export type LoopGraphRailFolderEntry = {
  kind: 'folder'
  id: string
  title: string
  children: LoopGraphRailEntry[]
}

export type LoopGraphRailEntry = LoopGraphRailLoopEntry | LoopGraphRailFolderEntry

export interface LoopGraphRailLayout {
  version: 2
  entries: LoopGraphRailEntry[]
}

/** @deprecated flat folder loopIds (migrated on load). */
interface LegacyLoopRailLayoutV1 {
  version: 1
  entries: Array<
    | { kind: 'loop'; loopId: string }
    | { kind: 'folder'; id: string; title: string; loopIds: string[] }
  >
}

const LAYOUT_KEY_PREFIX = 'projectos_loop_graph_rail_'

export function emptyLoopGraphRailLayout(): LoopGraphRailLayout {
  return { version: 2, entries: [] }
}

export function loadLoopGraphRailLayout(projectId: string): LoopGraphRailLayout {
  if (typeof localStorage === 'undefined') return emptyLoopGraphRailLayout()
  try {
    const raw = localStorage.getItem(`${LAYOUT_KEY_PREFIX}${projectId}`)
    if (!raw) return emptyLoopGraphRailLayout()
    const parsed = JSON.parse(raw) as LoopGraphRailLayout | LegacyLoopRailLayoutV1
    if (parsed?.version === 2 && Array.isArray(parsed.entries)) {
      return { version: 2, entries: sanitizeEntries(parsed.entries) }
    }
    if (parsed?.version === 1 && Array.isArray(parsed.entries)) {
      return migrateV1Layout(parsed)
    }
    return emptyLoopGraphRailLayout()
  } catch {
    return emptyLoopGraphRailLayout()
  }
}

export function saveLoopGraphRailLayout(
  projectId: string,
  layout: LoopGraphRailLayout,
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

function migrateV1Layout(legacy: LegacyLoopRailLayoutV1): LoopGraphRailLayout {
  return {
    version: 2,
    entries: sanitizeEntries(
      legacy.entries.map((entry) => {
        if (entry.kind === 'loop') return entry
        return {
          kind: 'folder' as const,
          id: entry.id,
          title: entry.title || '',
          children: (entry.loopIds ?? []).map((loopId) => ({
            kind: 'loop' as const,
            loopId,
          })),
        }
      }),
    ),
  }
}

function sanitizeEntries(entries: LoopGraphRailEntry[]): LoopGraphRailEntry[] {
  const seenLoops = new Set<string>()
  const seenFolders = new Set<string>()

  const walk = (list: LoopGraphRailEntry[]): LoopGraphRailEntry[] => {
    const out: LoopGraphRailEntry[] = []
    for (const entry of list) {
      if (entry.kind === 'loop') {
        if (!entry.loopId || seenLoops.has(entry.loopId)) continue
        seenLoops.add(entry.loopId)
        out.push({ kind: 'loop', loopId: entry.loopId })
        continue
      }
      if (entry.kind !== 'folder' || !entry.id || seenFolders.has(entry.id)) continue
      seenFolders.add(entry.id)
      const legacyLoopIds = (entry as { loopIds?: string[] }).loopIds
      const rawChildren =
        Array.isArray(entry.children) && entry.children.length > 0
          ? entry.children
          : (legacyLoopIds ?? []).map((loopId) => ({
              kind: 'loop' as const,
              loopId,
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

export function collectLoopIds(entries: LoopGraphRailEntry[]): string[] {
  const ids: string[] = []
  const walk = (list: LoopGraphRailEntry[]) => {
    for (const entry of list) {
      if (entry.kind === 'loop') ids.push(entry.loopId)
      else walk(entry.children)
    }
  }
  walk(entries)
  return ids
}

export function countFolderLoops(folder: LoopGraphRailFolderEntry): number {
  return collectLoopIds(folder.children).length
}

export function folderContainsActiveLoop(
  folder: LoopGraphRailFolderEntry,
  activeLoopId: string | null,
): boolean {
  if (!activeLoopId) return false
  return collectLoopIds(folder.children).includes(activeLoopId)
}

export function findLoopFolderEntry(
  entries: LoopGraphRailEntry[],
  folderId: string,
): LoopGraphRailFolderEntry | null {
  for (const entry of entries) {
    if (entry.kind === 'folder') {
      if (entry.id === folderId) return entry
      const nested = findLoopFolderEntry(entry.children, folderId)
      if (nested) return nested
    }
  }
  return null
}

function isDescendantFolder(
  entries: LoopGraphRailEntry[],
  ancestorId: string,
  maybeDescendantId: string,
): boolean {
  const ancestor = findLoopFolderEntry(entries, ancestorId)
  if (!ancestor) return false
  const walk = (list: LoopGraphRailEntry[]): boolean => {
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
  entries: LoopGraphRailEntry[],
  mapper: (entry: LoopGraphRailEntry) => LoopGraphRailEntry | null,
): LoopGraphRailEntry[] {
  const out: LoopGraphRailEntry[] = []
  for (const entry of entries) {
    if (entry.kind === 'folder') {
      const nextFolder: LoopGraphRailFolderEntry = {
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
  entries: LoopGraphRailEntry[],
  match: (entry: LoopGraphRailEntry) => boolean,
): { entries: LoopGraphRailEntry[]; extracted: LoopGraphRailEntry | null } {
  let extracted: LoopGraphRailEntry | null = null
  const walk = (list: LoopGraphRailEntry[]): LoopGraphRailEntry[] => {
    const out: LoopGraphRailEntry[] = []
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
  entries: LoopGraphRailEntry[],
  folderId: string,
  item: LoopGraphRailEntry,
): LoopGraphRailEntry[] {
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

export function syncRailLayoutWithLoops(
  layout: LoopGraphRailLayout,
  heads: LoopGraphHead[],
): LoopGraphRailLayout {
  const live = new Set(heads.map((head) => head.id))
  const known = new Set(collectLoopIds(layout.entries))
  const pruned = sanitizeEntries(
    mapEntries(layout.entries, (entry) => {
      if (entry.kind === 'loop') {
        return live.has(entry.loopId) ? entry : null
      }
      return entry
    }),
  )
  const extras: LoopGraphRailLoopEntry[] = []
  for (const head of heads) {
    if (known.has(head.id)) continue
    extras.push({ kind: 'loop', loopId: head.id })
    known.add(head.id)
  }
  extras.sort((a, b) => {
    const ha = heads.find((h) => h.id === a.loopId)
    const hb = heads.find((h) => h.id === b.loopId)
    return (hb?.updatedAt ?? '').localeCompare(ha?.updatedAt ?? '')
  })
  return { version: 2, entries: [...pruned, ...extras] }
}

export function createLoopRailFolder(
  layout: LoopGraphRailLayout,
  title: string,
): { layout: LoopGraphRailLayout; folderId: string } {
  const folderId = `folder_${crypto.randomUUID()}`
  return {
    folderId,
    layout: {
      version: 2,
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

export function renameLoopRailFolder(
  layout: LoopGraphRailLayout,
  folderId: string,
  title: string,
): LoopGraphRailLayout {
  const next = title.trim() || 'Folder'
  return {
    version: 2,
    entries: mapEntries(layout.entries, (entry) =>
      entry.kind === 'folder' && entry.id === folderId
        ? { ...entry, title: next }
        : entry,
    ),
  }
}

export function removeLoopFromLayout(
  layout: LoopGraphRailLayout,
  loopId: string,
): LoopGraphRailLayout {
  return {
    version: 2,
    entries: sanitizeEntries(
      mapEntries(layout.entries, (entry) =>
        entry.kind === 'loop' && entry.loopId === loopId ? null : entry,
      ),
    ),
  }
}

export function removeLoopFolderFromLayout(
  layout: LoopGraphRailLayout,
  folderId: string,
): LoopGraphRailLayout {
  const lift = (list: LoopGraphRailEntry[]): LoopGraphRailEntry[] => {
    const out: LoopGraphRailEntry[] = []
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
  return { version: 2, entries: sanitizeEntries(lift(layout.entries)) }
}

export function moveLoopIntoFolder(
  layout: LoopGraphRailLayout,
  loopId: string,
  folderId: string,
): LoopGraphRailLayout {
  if (!findLoopFolderEntry(layout.entries, folderId)) return layout
  const without = removeLoopFromLayout(layout, loopId)
  return {
    version: 2,
    entries: sanitizeEntries(
      insertIntoFolderChildren(without.entries, folderId, {
        kind: 'loop',
        loopId,
      }),
    ),
  }
}

export function moveLoopFolderIntoFolder(
  layout: LoopGraphRailLayout,
  folderId: string,
  targetFolderId: string,
): LoopGraphRailLayout {
  if (folderId === targetFolderId) return layout
  if (!findLoopFolderEntry(layout.entries, targetFolderId)) return layout
  if (isDescendantFolder(layout.entries, folderId, targetFolderId)) return layout
  const { entries, extracted } = extractMatching(
    layout.entries,
    (entry) => entry.kind === 'folder' && entry.id === folderId,
  )
  if (!extracted || extracted.kind !== 'folder') return layout
  return {
    version: 2,
    entries: sanitizeEntries(
      insertIntoFolderChildren(entries, targetFolderId, extracted),
    ),
  }
}

export function insertLoopFolderOnRail(
  layout: LoopGraphRailLayout,
  folderId: string,
  atIndex?: number,
): LoopGraphRailLayout {
  const { entries, extracted } = extractMatching(
    layout.entries,
    (entry) => entry.kind === 'folder' && entry.id === folderId,
  )
  if (!extracted || extracted.kind !== 'folder') return layout
  const next = [...entries]
  const index =
    atIndex == null ? next.length : Math.max(0, Math.min(next.length, atIndex))
  next.splice(index, 0, extracted)
  return { version: 2, entries: sanitizeEntries(next) }
}

export function insertLoopOnRail(
  layout: LoopGraphRailLayout,
  loopId: string,
  atIndex?: number,
): LoopGraphRailLayout {
  const without = removeLoopFromLayout(layout, loopId)
  const entry: LoopGraphRailLoopEntry = { kind: 'loop', loopId }
  const entries = [...without.entries]
  const index =
    atIndex == null ? entries.length : Math.max(0, Math.min(entries.length, atIndex))
  entries.splice(index, 0, entry)
  return { version: 2, entries }
}
