export type AppNotificationKind =
  | 'agent_ask'
  | 'agent_diff'
  | 'reminder'
  | 'decision'
  | 'toast_error'
  | 'toast_warning'
  | 'toast_info'
  | 'first_principles_suggest'

export type AppNotificationDestination = 'ask' | 'diff' | 'reminder' | 'decisions' | 'none'

export type AppNotificationStatus = 'active' | 'archived'

/** Separate Mac-style stacks per notification family. */
export type NotificationStackGroup = 'ask' | 'diff' | 'reminder' | 'decision' | 'alert'

export type AppNotification = {
  id: string
  kind: AppNotificationKind
  title: string
  body: string
  destination: AppNotificationDestination
  runIds: string[]
  decisionId?: string
  status: AppNotificationStatus
  createdAt: number
  archivedAt?: number
  /** Shown via macOS Notification while the window was unfocused. */
  deliveredViaSystem?: boolean
  /**
   * Ephemeral banners live only in the active stack. Swipe / timeout / dismiss
   * always remove them — they never enter Notification Center.
   */
  ephemeral?: boolean
  /** Prompt text to seed First Principles when the suggest is accepted. */
  visionText?: string
  /** Auto-remove after this many ms while still active (ephemeral path). */
  autoDismissMs?: number
}

export type PushAppNotificationInput = {
  kind: AppNotificationKind
  title: string
  body: string
  destination?: AppNotificationDestination
  runIds?: string[]
  decisionId?: string
  /** When true, skip the in-app stack and archive immediately (system path). */
  deliveredViaSystem?: boolean
  /** Archive immediately without showing the in-app stack (toast history path). */
  archiveImmediately?: boolean
  ephemeral?: boolean
  visionText?: string
  autoDismissMs?: number
}

/** Soft First Principles suggest: linger briefly, then drop without shelving. */
export const FIRST_PRINCIPLES_SUGGEST_AUTO_DISMISS_MS = 10_000

/** Minimum linger before swipe-to-archive is accepted (avoids accidental dismiss). */
export const NOTIFICATION_MIN_LINGER_MS = 5000
export const NOTIFICATION_SWIPE_DISMISS_THRESHOLD_PX = 72
/** Width of the Clear/trash rail revealed by swiping left (Mac NC pattern). */
export const NOTIFICATION_SWIPE_DELETE_REVEAL_PX = 72
export const NOTIFICATION_CENTER_MAX_ARCHIVED = 100
export const NOTIFICATION_STACK_MAX_HEIGHT_PX = 420

/** @deprecated Auto-archive removed — swipe-right only. Kept for callers/tests. */
export const NOTIFICATION_AUTO_ARCHIVE_MS = NOTIFICATION_MIN_LINGER_MS

export const NOTIFICATION_STACK_GROUP_ORDER: NotificationStackGroup[] = [
  'ask',
  'diff',
  'reminder',
  'decision',
  'alert',
]

export function stackGroupForKind(kind: AppNotificationKind): NotificationStackGroup {
  if (kind === 'agent_ask' || kind === 'first_principles_suggest') return 'ask'
  if (kind === 'agent_diff') return 'diff'
  if (kind === 'reminder') return 'reminder'
  if (kind === 'decision') return 'decision'
  return 'alert'
}

export function destinationForAgentKind(
  kind: 'ask' | 'diff' | 'reminder',
): AppNotificationDestination {
  return kind
}

export function kindForAgentDestination(
  destination: 'ask' | 'diff' | 'reminder',
): Extract<AppNotificationKind, 'agent_ask' | 'agent_diff' | 'reminder'> {
  if (destination === 'ask') return 'agent_ask'
  if (destination === 'diff') return 'agent_diff'
  return 'reminder'
}
