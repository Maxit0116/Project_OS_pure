import { create } from 'zustand'
import {
  NOTIFICATION_CENTER_MAX_ARCHIVED,
  NOTIFICATION_STACK_GROUP_ORDER,
  stackGroupForKind,
  type AppNotification,
  type AppNotificationDestination,
  type NotificationStackGroup,
  type PushAppNotificationInput,
} from '../notifications/notificationCenterTypes'

const STORAGE_KEY = 'projectos_notification_center_v1'

const autoDismissTimers = new Map<string, number>()

function notificationId(): string {
  return `notif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function clearAutoDismiss(id: string) {
  const timer = autoDismissTimers.get(id)
  if (timer != null) {
    window.clearTimeout(timer)
    autoDismissTimers.delete(id)
  }
}

function loadArchived(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is AppNotification => {
        if (!item || typeof item !== 'object') return false
        const row = item as AppNotification
        return (
          typeof row.id === 'string' &&
          typeof row.title === 'string' &&
          typeof row.body === 'string' &&
          row.status === 'archived' &&
          !row.ephemeral
        )
      })
      .slice(0, NOTIFICATION_CENTER_MAX_ARCHIVED)
  } catch {
    return []
  }
}

function persistArchived(items: AppNotification[]) {
  try {
    const archived = items
      .filter((item) => item.status === 'archived' && !item.ephemeral)
      .slice(0, NOTIFICATION_CENTER_MAX_ARCHIVED)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(archived))
  } catch {
    /* ignore quota / private mode */
  }
}

interface NotificationCenterState {
  items: AppNotification[]
  /** Which typed stacks are vertically expanded. */
  expandedGroups: Partial<Record<NotificationStackGroup, boolean>>
  pushNotification: (input: PushAppNotificationInput) => string
  archiveNotification: (id: string) => void
  archiveActive: () => void
  archiveActiveByDestination: (destination: AppNotificationDestination) => void
  archiveActiveByGroup: (group: NotificationStackGroup) => void
  activateNotification: (id: string) => AppNotification | null
  removeNotification: (id: string) => void
  removeGroup: (group: NotificationStackGroup, status?: 'active' | 'archived' | 'all') => void
  removeArchived: (id: string) => void
  clearArchived: () => void
  setGroupExpanded: (group: NotificationStackGroup, expanded: boolean) => void
}

function withArchivedTrim(items: AppNotification[]): AppNotification[] {
  const active = items
    .filter((item) => item.status === 'active')
    .sort((a, b) => b.createdAt - a.createdAt)
  const archived = items
    .filter((item) => item.status === 'archived' && !item.ephemeral)
    .sort((a, b) => (b.archivedAt ?? b.createdAt) - (a.archivedAt ?? a.createdAt))
    .slice(0, NOTIFICATION_CENTER_MAX_ARCHIVED)
  return [...active, ...archived]
}

function pruneExpandedGroups(
  expandedGroups: Partial<Record<NotificationStackGroup, boolean>>,
  items: AppNotification[],
): Partial<Record<NotificationStackGroup, boolean>> {
  const next: Partial<Record<NotificationStackGroup, boolean>> = {}
  for (const group of NOTIFICATION_STACK_GROUP_ORDER) {
    const hasItems = items.some((item) => stackGroupForKind(item.kind) === group)
    if (hasItems && expandedGroups[group]) next[group] = true
  }
  return next
}

export const useNotificationCenterStore = create<NotificationCenterState>((set, get) => ({
  items: loadArchived(),
  expandedGroups: {},

  pushNotification: (input) => {
    const id = notificationId()
    const now = Date.now()
    const ephemeral = Boolean(input.ephemeral)
    const deliveredViaSystem = Boolean(input.deliveredViaSystem)
    // Ephemeral banners never shelve into Notification Center.
    const archiveImmediately =
      !ephemeral && (Boolean(input.archiveImmediately) || deliveredViaSystem)
    const next: AppNotification = {
      id,
      kind: input.kind,
      title: input.title,
      body: input.body,
      destination: input.destination ?? 'none',
      runIds: input.runIds ?? [],
      ...(input.decisionId ? { decisionId: input.decisionId } : {}),
      status: archiveImmediately ? 'archived' : 'active',
      createdAt: now,
      ...(archiveImmediately ? { archivedAt: now } : {}),
      ...(deliveredViaSystem ? { deliveredViaSystem: true } : {}),
      ...(ephemeral ? { ephemeral: true } : {}),
      ...(input.visionText ? { visionText: input.visionText } : {}),
      ...(typeof input.autoDismissMs === 'number' ? { autoDismissMs: input.autoDismissMs } : {}),
    }
    set((state) => {
      // Replace any prior active ephemeral of the same kind (avoid stacking soft suggests).
      const withoutDupes =
        ephemeral
          ? state.items.filter(
              (item) => !(item.status === 'active' && item.kind === next.kind && item.ephemeral),
            )
          : state.items
      const items = withArchivedTrim([next, ...withoutDupes])
      persistArchived(items)
      const group = stackGroupForKind(next.kind)
      return {
        items,
        // New active item collapses that typed stack so newest sits on top.
        expandedGroups: archiveImmediately
          ? state.expandedGroups
          : { ...state.expandedGroups, [group]: false },
      }
    })
    if (ephemeral && next.status === 'active' && typeof input.autoDismissMs === 'number' && input.autoDismissMs > 0) {
      clearAutoDismiss(id)
      const timer = window.setTimeout(() => {
        autoDismissTimers.delete(id)
        const stillActive = get().items.some(
          (item) => item.id === id && item.status === 'active',
        )
        if (stillActive) get().removeNotification(id)
      }, input.autoDismissMs)
      autoDismissTimers.set(id, timer)
    }
    return id
  },

  archiveNotification: (id) => {
    const current = get().items.find((item) => item.id === id)
    if (current?.ephemeral) {
      get().removeNotification(id)
      return
    }
    set((state) => {
      const now = Date.now()
      const items = withArchivedTrim(
        state.items.map((item) =>
          item.id === id && item.status === 'active'
            ? { ...item, status: 'archived', archivedAt: now }
            : item,
        ),
      )
      persistArchived(items)
      return {
        items,
        expandedGroups: pruneExpandedGroups(state.expandedGroups, items),
      }
    })
  },

  archiveActive: () => {
    set((state) => {
      const now = Date.now()
      const items = withArchivedTrim(
        state.items
          .filter((item) => !(item.status === 'active' && item.ephemeral))
          .map((item) =>
            item.status === 'active' ? { ...item, status: 'archived', archivedAt: now } : item,
          ),
      )
      persistArchived(items)
      return { items, expandedGroups: pruneExpandedGroups(state.expandedGroups, items) }
    })
  },

  archiveActiveByDestination: (destination) => {
    set((state) => {
      const now = Date.now()
      const items = withArchivedTrim(
        state.items
          .filter(
            (item) =>
              !(
                item.status === 'active' &&
                item.ephemeral &&
                item.destination === destination
              ),
          )
          .map((item) =>
            item.status === 'active' && item.destination === destination
              ? { ...item, status: 'archived', archivedAt: now }
              : item,
          ),
      )
      persistArchived(items)
      return {
        items,
        expandedGroups: pruneExpandedGroups(state.expandedGroups, items),
      }
    })
  },

  archiveActiveByGroup: (group) => {
    set((state) => {
      const now = Date.now()
      const items = withArchivedTrim(
        state.items
          .filter(
            (item) =>
              !(
                item.status === 'active' &&
                item.ephemeral &&
                stackGroupForKind(item.kind) === group
              ),
          )
          .map((item) =>
            item.status === 'active' && stackGroupForKind(item.kind) === group
              ? { ...item, status: 'archived', archivedAt: now }
              : item,
          ),
      )
      persistArchived(items)
      return {
        items,
        expandedGroups: pruneExpandedGroups(state.expandedGroups, items),
      }
    })
  },

  activateNotification: (id) => {
    const item = get().items.find((entry) => entry.id === id) ?? null
    if (!item) return null
    if (item.status === 'active') {
      if (item.ephemeral) get().removeNotification(id)
      else get().archiveNotification(id)
    }
    return item
  },

  removeNotification: (id) => {
    clearAutoDismiss(id)
    set((state) => {
      const items = withArchivedTrim(state.items.filter((item) => item.id !== id))
      persistArchived(items)
      return {
        items,
        expandedGroups: pruneExpandedGroups(state.expandedGroups, items),
      }
    })
  },

  removeGroup: (group, status = 'all') => {
    set((state) => {
      const removedIds = state.items
        .filter((item) => {
          if (stackGroupForKind(item.kind) !== group) return false
          if (status === 'all') return true
          return item.status === status
        })
        .map((item) => item.id)
      for (const id of removedIds) clearAutoDismiss(id)
      const items = withArchivedTrim(
        state.items.filter((item) => {
          if (stackGroupForKind(item.kind) !== group) return true
          if (status === 'all') return false
          return item.status !== status
        }),
      )
      persistArchived(items)
      return {
        items,
        expandedGroups: pruneExpandedGroups(state.expandedGroups, items),
      }
    })
  },

  removeArchived: (id) => {
    set((state) => {
      const items = state.items.filter(
        (item) => !(item.id === id && item.status === 'archived'),
      )
      persistArchived(items)
      return { items }
    })
  },

  clearArchived: () => {
    set((state) => {
      const items = state.items.filter((item) => item.status === 'active')
      persistArchived(items)
      return { items }
    })
  },

  setGroupExpanded: (group, expanded) =>
    set((state) => ({
      expandedGroups: { ...state.expandedGroups, [group]: expanded },
    })),
}))

export function selectActiveNotifications(items: AppNotification[]): AppNotification[] {
  return items
    .filter((item) => item.status === 'active')
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function selectArchivedNotifications(items: AppNotification[]): AppNotification[] {
  return items
    .filter((item) => item.status === 'archived')
    .sort((a, b) => (b.archivedAt ?? b.createdAt) - (a.archivedAt ?? a.createdAt))
}

export function selectGroupActive(
  items: AppNotification[],
  group: NotificationStackGroup,
): AppNotification[] {
  return selectActiveNotifications(items).filter(
    (item) => stackGroupForKind(item.kind) === group,
  )
}

export function selectGroupArchived(
  items: AppNotification[],
  group: NotificationStackGroup,
): AppNotification[] {
  return selectArchivedNotifications(items).filter(
    (item) => stackGroupForKind(item.kind) === group,
  )
}

export type NotificationStackBucket = {
  group: NotificationStackGroup
  active: AppNotification[]
  archived: AppNotification[]
}

export function selectNotificationStacks(items: AppNotification[]): NotificationStackBucket[] {
  return NOTIFICATION_STACK_GROUP_ORDER.map((group) => ({
    group,
    active: selectGroupActive(items, group),
    archived: selectGroupArchived(items, group),
  })).filter((bucket) => bucket.active.length > 0 || bucket.archived.length > 0)
}

/** Gmail-style mailbox: newest first within a typed column (active + archived). */
export function selectGroupMailbox(
  items: AppNotification[],
  group: NotificationStackGroup,
): AppNotification[] {
  return items
    .filter((item) => stackGroupForKind(item.kind) === group)
    .sort((a, b) => {
      const aAt = a.status === 'active' ? a.createdAt : (a.archivedAt ?? a.createdAt)
      const bAt = b.status === 'active' ? b.createdAt : (b.archivedAt ?? b.createdAt)
      if (bAt !== aAt) return bAt - aAt
      return b.createdAt - a.createdAt
    })
}
