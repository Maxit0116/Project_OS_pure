import { describe, expect, it } from 'vitest'
import {
  mergeReminderNotifyEvents,
  resolveReminderNotificationChannel,
  shouldSuppressReminderNotification,
} from './reminderNotification'

describe('reminderNotification', () => {
  it('routes to system when unfocused', () => {
    expect(
      resolveReminderNotificationChannel({
        windowFocused: false,
        centerTab: 'function-map',
        reminderGraphOpen: false,
      }),
    ).toBe('system')
  })

  it('suppresses when the focused reminder row is already open', () => {
    expect(
      shouldSuppressReminderNotification({
        enabled: true,
        reminderGraphOpen: true,
        windowFocused: true,
        focusedItemId: 'r1',
        eventItemId: 'r1',
      }),
    ).toBe(true)
    expect(
      shouldSuppressReminderNotification({
        enabled: true,
        reminderGraphOpen: true,
        windowFocused: true,
        focusedItemId: 'r1',
        eventItemId: 'r2',
      }),
    ).toBe(false)
  })

  it('merges multiple events', () => {
    const merged = mergeReminderNotifyEvents([
      {
        kind: 'reminder_ready',
        itemId: 'a',
        title: 'A',
        body: 'Ready A',
      },
      {
        kind: 'milestone_passed',
        itemId: 'b',
        title: 'B',
        body: 'Passed B',
      },
    ])
    expect(merged?.title).toBe('Reminder Graph updates')
    expect(merged?.itemIds).toEqual(['a', 'b'])
  })
})
