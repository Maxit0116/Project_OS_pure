import { describe, expect, it } from 'vitest'
import type { ReminderTimelineItem } from '@contracts/index'
import {
  isReminderDateOverdue,
  resolveReminderVisualTone,
  reminderToneHasRail,
  reminderToneUsesMilestoneAccent,
} from './reminderVisualTone'

const NOW = Date.parse('2026-06-15T12:00:00.000Z')

function base(partial: Partial<ReminderTimelineItem> & Pick<ReminderTimelineItem, 'id' | 'kind' | 'title'>): ReminderTimelineItem {
  return {
    phaseIndex: 1,
    manualOrder: 0,
    dependsOn: [],
    sourceRefs: [],
    supersededSources: [],
    userPinned: false,
    locked: false,
    featureIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('resolveReminderVisualTone', () => {
  it('prioritizes conflict over due and ready', () => {
    const item = base({
      id: 'r1',
      kind: 'reminder',
      title: 'Conflicted',
      reminderStatus: 'conflict',
      dueAt: '2020-01-01T00:00:00.000Z',
    })
    expect(resolveReminderVisualTone(item, NOW)).toBe('conflict')
  })

  it('maps milestone due and date-overdue to due', () => {
    expect(
      resolveReminderVisualTone(
        base({
          id: 'm1',
          kind: 'milestone',
          title: 'Due gate',
          milestoneStatus: 'due',
        }),
        NOW,
      ),
    ).toBe('due')

    expect(
      resolveReminderVisualTone(
        base({
          id: 'm2',
          kind: 'milestone',
          title: 'Late',
          milestoneStatus: 'upcoming',
          targetDate: '2026-01-01',
        }),
        NOW,
      ),
    ).toBe('due')
  })

  it('does not treat ready as due even when date is past', () => {
    const item = base({
      id: 'r2',
      kind: 'reminder',
      title: 'Ready late',
      reminderStatus: 'ready',
      dueAt: '2020-01-01T00:00:00.000Z',
    })
    expect(resolveReminderVisualTone(item, NOW)).toBe('ready')
  })

  it('maps done terminal states', () => {
    expect(
      resolveReminderVisualTone(
        base({
          id: 'm3',
          kind: 'milestone',
          title: 'Done',
          milestoneStatus: 'passed',
        }),
        NOW,
      ),
    ).toBe('done')
    expect(
      resolveReminderVisualTone(
        base({
          id: 'r3',
          kind: 'reminder',
          title: 'Dropped',
          reminderStatus: 'dropped',
        }),
        NOW,
      ),
    ).toBe('done')
  })

  it('maps inbox and neutral', () => {
    expect(
      resolveReminderVisualTone(
        base({ id: 'i1', kind: 'inbox', title: 'Inbox' }),
        NOW,
      ),
    ).toBe('inbox')
    expect(
      resolveReminderVisualTone(
        base({
          id: 'r4',
          kind: 'reminder',
          title: 'Parked',
          reminderStatus: 'parked',
        }),
        NOW,
      ),
    ).toBe('neutral')
  })
})

describe('isReminderDateOverdue', () => {
  it('ignores passed milestones', () => {
    expect(
      isReminderDateOverdue(
        base({
          id: 'm4',
          kind: 'milestone',
          title: 'Passed late',
          milestoneStatus: 'passed',
          targetDate: '2020-01-01',
        }),
        NOW,
      ),
    ).toBe(false)
  })
})

describe('reminderTone helpers', () => {
  it('rails only high-urgency tones', () => {
    expect(reminderToneHasRail('conflict')).toBe(true)
    expect(reminderToneHasRail('due')).toBe(true)
    expect(reminderToneHasRail('ready')).toBe(true)
    expect(reminderToneHasRail('neutral')).toBe(false)
  })

  it('milestone accent only on calm tones', () => {
    expect(reminderToneUsesMilestoneAccent('neutral')).toBe(true)
    expect(reminderToneUsesMilestoneAccent('done')).toBe(true)
    expect(reminderToneUsesMilestoneAccent('conflict')).toBe(false)
  })
})
