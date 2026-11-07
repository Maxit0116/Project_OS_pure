import type { ReminderNotifyEvent, ReminderTimelineDocument } from '@contracts/index'
import type { CenterTab } from '../state/workbenchStore'
import { diffReminderNotifications } from '../../../services/reminder-graph/notify-diff.js'

export type ReminderNotificationChannel = 'system' | 'map_banner' | 'center_banner'

export type ReminderBannerDestination = 'reminder'

export function resolveReminderNotificationChannel(state: {
  windowFocused: boolean
  centerTab: CenterTab
  reminderGraphOpen: boolean
}): ReminderNotificationChannel {
  if (!state.windowFocused) return 'system'
  if (state.reminderGraphOpen) return 'center_banner'
  if (state.centerTab === 'function-map') return 'map_banner'
  return 'center_banner'
}

export function shouldSuppressReminderNotification(state: {
  enabled: boolean
  reminderGraphOpen: boolean
  windowFocused: boolean
  focusedItemId?: string | null
  eventItemId: string
}): boolean {
  if (!state.enabled) return true
  // Suppress only when already focused on that row inside Reminder Graph.
  if (
    state.windowFocused &&
    state.reminderGraphOpen &&
    state.focusedItemId &&
    state.focusedItemId === state.eventItemId
  ) {
    return true
  }
  return false
}

export function mergeReminderNotifyEvents(
  events: ReminderNotifyEvent[],
): { title: string; body: string; itemIds: string[] } | null {
  if (events.length === 0) return null
  const itemIds = [...new Set(events.map((event) => event.itemId))]
  if (events.length === 1) {
    const event = events[0]!
    return {
      title: reminderEventTitle(event),
      body: event.body,
      itemIds,
    }
  }
  return {
    title: 'Reminder Graph updates',
    body: events
      .slice(0, 3)
      .map((event) => event.body)
      .join(' · '),
    itemIds,
  }
}

function reminderEventTitle(event: ReminderNotifyEvent): string {
  switch (event.kind) {
    case 'milestone_passed':
      return 'Milestone passed'
    case 'milestone_due':
      return 'Milestone due'
    case 'reminder_ready':
      return 'Reminder ready'
    case 'conflict':
      return 'Reminder conflict'
    case 'digest':
      return 'Reminder Graph digest'
    default:
      return 'Reminder Graph'
  }
}

export function collectReminderNotifyEvents(
  before: ReminderTimelineDocument | null | undefined,
  after: ReminderTimelineDocument | null | undefined,
): ReminderNotifyEvent[] {
  return diffReminderNotifications(before, after)
}
