import type { DiagramArtifactMeta } from '@contracts/index'

export type DiagramGraphRailItemEntry = {
  kind: 'diagram'
  diagramId: string
}

export type DiagramGraphRailFolderEntry = {
  kind: 'folder'
  id: string
  title: string
  children: DiagramGraphRailEntry[]
}

export type DiagramGraphRailEntry = DiagramGraphRailItemEntry | DiagramGraphRailFolderEntry

export interface DiagramGraphRailLayout {
  version: 2
  entries: DiagramGraphRailEntry[]
}

/** @deprecated flat folder diagramIds (migrated on load). */
interface LegacyDiagramRailLayoutV1 {
  version: 1
  entries: Array<
    | { kind: 'diagram'; diagramId: string }
    | { kind: 'folder'; id: string; title: string; diagramIds: string[] }
  >
}

const LAYOUT_KEY_PREFIX = 'projectos_diagram_graph_rail_'

export function emptyDiagramGraphRailLayout(): DiagramGraphRailLayout {
  return { version: 2, entries: [] }
}

export function loadDiagramGraphRailLayout(projectId: string): DiagramGraphRailLayout {
  if (typeof localStorage === 'undefined') return emptyDiagramGraphRailLayout()
  try {
    const raw = localStorage.getItem(`${LAYOUT_KEY_PREFIX}${projectId}`)
    if (!raw) return emptyDiagramGraphRailLayout()
    const parsed = JSON.parse(raw) as DiagramGraphRailLayout | LegacyDiagramRailLayoutV1
    if (parsed?.version === 2 && Array.isArray(parsed.entries)) {
      return { version: 2, entries: sanitizeEntries(parsed.entries) }
    }
    if (parsed?.version === 1 && Array.isArray(parsed.entries)) {
      return migrateV1Layout(parsed)
    }
    return emptyDiagramGraphRailLayout()
  } catch {
    return emptyDiagramGraphRailLayout()
  }
}

export function saveDiagramGraphRailLayout(
  projectId: string,
  layout: DiagramGraphRailLayout,
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

function migrateV1Layout(legacy: LegacyDiagramRailLayoutV1): DiagramGraphRailLayout {
  return {
    version: 2,
    entries: sanitizeEntries(
      legacy.entries.map((entry) => {
        if (entry.kind === 'diagram') return entry
        return {
          kind: 'folder' as const,
          id: entry.id,
          title: entry.title || '',
          children: (entry.diagramIds ?? []).map((diagramId) => ({
            kind: 'diagram' as const,
            diagramId,
          })),
        }
      }),
    ),
  }
}

function sanitizeEntries(entries: DiagramGraphRailEntry[]): DiagramGraphRailEntry[] {
  const seenLoops = new Set<string>()
  const seenFolders = new Set<string>()

  const walk = (list: DiagramGraphRailEntry[]): DiagramGraphRailEntry[] => {
    const out: DiagramGraphRailEntry[] = []
    for (const entry of list) {
      if (entry.kind === 'diagram') {
        if (!entry.diagramId || seenLoops.has(entry.diagramId)) continue
        seenLoops.add(entry.diagramId)
        out.push({ kind: 'diagram', diagramId: entry.diagramId })
        continue
      }
      if (entry.kind !== 'folder' || !entry.id || seenFolders.has(entry.id)) continue
      seenFolders.add(entry.id)
      const legacyLoopIds = (entry as { diagramIds?: string[] }).diagramIds
      const rawChildren =
        Array.isArray(entry.children) && entry.children.length > 0
          ? entry.children
          : (legacyLoopIds ?? []).map((diagramId) => ({
              kind: 'diagram' as const,
              diagramId,
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

export function collectDiagramIds(entries: DiagramGraphRailEntry[]): string[] {
  const ids: string[] = []
  const walk = (list: DiagramGraphRailEntry[]) => {
    for (const entry of list) {
      if (entry.kind === 'diagram') ids.push(entry.diagramId)
      else walk(entry.children)
    }
  }
  walk(entries)
  return ids
}

export function countFolderDiagrams(folder: DiagramGraphRailFolderEntry): number {
  return collectDiagramIds(folder.children).length
}

export function folderContainsActiveDiagram(
  folder: DiagramGraphRailFolderEntry,
  activeDiagramId: string | null,
): boolean {
  if (!activeDiagramId) return false
  return collectDiagramIds(folder.children).includes(activeDiagramId)
}

export function findDiagramFolderEntry(
  entries: DiagramGraphRailEntry[],
  folderId: string,
): DiagramGraphRailFolderEntry | null {
  for (const entry of entries) {
    if (entry.kind === 'folder') {
      if (entry.id === folderId) return entry
      const nested = findDiagramFolderEntry(entry.children, folderId)
      if (nested) return nested
    }
  }
  return null
}

function isDescendantFolder(
  entries: DiagramGraphRailEntry[],
  ancestorId: string,
  maybeDescendantId: string,
): boolean {
  const ancestor = findDiagramFolderEntry(entries, ancestorId)
  if (!ancestor) return false
  const walk = (list: DiagramGraphRailEntry[]): boolean => {
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
  entries: DiagramGraphRailEntry[],
  mapper: (entry: DiagramGraphRailEntry) => DiagramGraphRailEntry | null,
): DiagramGraphRailEntry[] {
  const out: DiagramGraphRailEntry[] = []
  for (const entry of entries) {
    if (entry.kind === 'folder') {
      const nextFolder: DiagramGraphRailFolderEntry = {
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
  entries: DiagramGraphRailEntry[],
  match: (entry: DiagramGraphRailEntry) => boolean,
): { entries: DiagramGraphRailEntry[]; extracted: DiagramGraphRailEntry | null } {
  let extracted: DiagramGraphRailEntry | null = null
  const walk = (list: DiagramGraphRailEntry[]): DiagramGraphRailEntry[] => {
    const out: DiagramGraphRailEntry[] = []
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
  entries: DiagramGraphRailEntry[],
  folderId: string,
  item: DiagramGraphRailEntry,
): DiagramGraphRailEntry[] {
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

export function syncRailLayoutWithDiagrams(
  layout: DiagramGraphRailLayout,
  artifacts: DiagramArtifactMeta[],
): DiagramGraphRailLayout {
  const live = new Set(artifacts.map((artifact) => artifact.id))
  const known = new Set(collectDiagramIds(layout.entries))
  const pruned = sanitizeEntries(
    mapEntries(layout.entries, (entry) => {
      if (entry.kind === 'diagram') {
        return live.has(entry.diagramId) ? entry : null
      }
      return entry
    }),
  )
  const extras: DiagramGraphRailItemEntry[] = []
  for (const artifact of artifacts) {
    if (known.has(artifact.id)) continue
    extras.push({ kind: 'diagram', diagramId: artifact.id })
    known.add(artifact.id)
  }
  extras.sort((a, b) => {
    const ha = artifacts.find((h) => h.id === a.diagramId)
    const hb = artifacts.find((h) => h.id === b.diagramId)
    return (hb?.createdAt ?? '').localeCompare(ha?.createdAt ?? '')
  })
  return { version: 2, entries: [...pruned, ...extras] }
}

export function createDiagramRailFolder(
  layout: DiagramGraphRailLayout,
  title: string,
): { layout: DiagramGraphRailLayout; folderId: string } {
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

export function renameDiagramRailFolder(
  layout: DiagramGraphRailLayout,
  folderId: string,
  title: string,
): DiagramGraphRailLayout {
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

export function removeDiagramFromLayout(
  layout: DiagramGraphRailLayout,
  diagramId: string,
): DiagramGraphRailLayout {
  return {
    version: 2,
    entries: sanitizeEntries(
      mapEntries(layout.entries, (entry) =>
        entry.kind === 'diagram' && entry.diagramId === diagramId ? null : entry,
      ),
    ),
  }
}

export function removeDiagramFolderFromLayout(
  layout: DiagramGraphRailLayout,
  folderId: string,
): DiagramGraphRailLayout {
  const lift = (list: DiagramGraphRailEntry[]): DiagramGraphRailEntry[] => {
    const out: DiagramGraphRailEntry[] = []
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

export function moveDiagramIntoFolder(
  layout: DiagramGraphRailLayout,
  diagramId: string,
  folderId: string,
): DiagramGraphRailLayout {
  if (!findDiagramFolderEntry(layout.entries, folderId)) return layout
  const without = removeDiagramFromLayout(layout, diagramId)
  return {
    version: 2,
    entries: sanitizeEntries(
      insertIntoFolderChildren(without.entries, folderId, {
        kind: 'diagram',
        diagramId,
      }),
    ),
  }
}

export function moveDiagramFolderIntoFolder(
  layout: DiagramGraphRailLayout,
  folderId: string,
  targetFolderId: string,
): DiagramGraphRailLayout {
  if (folderId === targetFolderId) return layout
  if (!findDiagramFolderEntry(layout.entries, targetFolderId)) return layout
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

export function insertDiagramFolderOnRail(
  layout: DiagramGraphRailLayout,
  folderId: string,
  atIndex?: number,
): DiagramGraphRailLayout {
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

export function insertDiagramOnRail(
  layout: DiagramGraphRailLayout,
  diagramId: string,
  atIndex?: number,
): DiagramGraphRailLayout {
  const without = removeDiagramFromLayout(layout, diagramId)
  const entry: DiagramGraphRailItemEntry = { kind: 'diagram', diagramId }
  const entries = [...without.entries]
  const index =
    atIndex == null ? entries.length : Math.max(0, Math.min(entries.length, atIndex))
  entries.splice(index, 0, entry)
  return { version: 2, entries }
}
