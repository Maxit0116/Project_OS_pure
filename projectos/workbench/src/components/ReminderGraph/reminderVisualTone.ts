import type { ReminderTimelineItem } from '@contracts/index'

export type ReminderVisualTone =
  | 'conflict'
  | 'due'
  | 'ready'
  | 'done'
  | 'inbox'
  | 'neutral'

/** Date overdue shared with overdue filter, excluding ready-as-attention. */
export function isReminderDateOverdue(
  item: ReminderTimelineItem,
  nowMs: number = Date.now(),
): boolean {
  if (item.milestoneStatus === 'passed') return false
  if (item.reminderStatus === 'done' || item.reminderStatus === 'dropped') return false
  if (item.milestoneStatus === 'waived') return false
  const due = item.dueAt ?? item.targetDate
  if (!due) return false
  const parsed = Date.parse(due)
  if (Number.isNaN(parsed)) return false
  return parsed < nowMs
}

/**
 * Attention-priority visual tone for Reminder Graph rows.
 * Color encodes urgency/status — not a rainbow by item kind.
 */
export function resolveReminderVisualTone(
  item: ReminderTimelineItem,
  nowMs: number = Date.now(),
): ReminderVisualTone {
  if (item.reminderStatus === 'conflict') return 'conflict'

  // Ready is its own attention channel (success). Unlike the overdue *filter*,
  // ready alone never becomes `due`; date-overdue only applies when not ready.
  if (item.reminderStatus === 'ready') return 'ready'

  if (item.milestoneStatus === 'due' || isReminderDateOverdue(item, nowMs)) {
    return 'due'
  }

  if (
    item.milestoneStatus === 'passed' ||
    item.milestoneStatus === 'waived' ||
    item.reminderStatus === 'done' ||
    item.reminderStatus === 'dropped'
  ) {
    return 'done'
  }

  if (item.kind === 'inbox') return 'inbox'

  return 'neutral'
}

/** Left attention rail for high-urgency tones only. */
export function reminderToneHasRail(tone: ReminderVisualTone): boolean {
  return tone === 'conflict' || tone === 'due' || tone === 'ready'
}

/** Milestone accent fill only when status is calm. */
export function reminderToneUsesMilestoneAccent(tone: ReminderVisualTone): boolean {
  return tone === 'neutral' || tone === 'done'
}
