const STORAGE_KEY = 'projectos_recent_workspaces'
const MAX_RECENT = 12

export interface RecentWorkspace {
  name: string
  path: string
  openedAt: number
}

interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function browserStore(): KeyValueStore | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

export function recentWorkspaceName(path: string, displayName?: string): string {
  const trimmed = displayName?.trim()
  if (trimmed) return trimmed
  const parts = path.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

/** Parent folder, with a home prefix when the path is under /Users. */
export function recentWorkspaceLocation(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean)
  if (parts.length <= 1) return path
  const parent = parts.slice(0, -1)
  if (parent[0] === 'Users' && parent.length >= 2) {
    const rest = parent.slice(2)
    return rest.length > 0 ? `~/${rest.join('/')}` : '~'
  }
  return parent.join('/')
}

export function readRecentWorkspaces(store: KeyValueStore | null = browserStore()): RecentWorkspace[] {
  if (!store) return []
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecentWorkspace).slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

export function rememberRecentWorkspace(
  project: { displayName: string; workspaceRoot: string },
  store: KeyValueStore | null = browserStore(),
): RecentWorkspace[] {
  const path = project.workspaceRoot.trim()
  if (!path || !store) return readRecentWorkspaces(store)
  const next: RecentWorkspace = {
    name: recentWorkspaceName(path, project.displayName),
    path,
    openedAt: Date.now(),
  }
  const existing = readRecentWorkspaces(store).filter((item) => item.path !== path)
  const list = [next, ...existing].slice(0, MAX_RECENT)
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    return existing
  }
  return list
}

function isRecentWorkspace(value: unknown): value is RecentWorkspace {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<RecentWorkspace>
  return typeof item.name === 'string' && typeof item.path === 'string' && typeof item.openedAt === 'number'
}
