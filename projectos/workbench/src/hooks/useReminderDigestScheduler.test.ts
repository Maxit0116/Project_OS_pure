import { describe, expect, it } from 'vitest'
import {
  buildReminderDigest,
  shouldSendReminderDigest,
  currentLocalDateKey,
} from '../../../services/reminder-graph/digest.js'

describe('useReminderDigestScheduler helpers', () => {
  it('only fires once per local day', () => {
    const today = currentLocalDateKey(Date.parse('2026-11-05T01:00:00.000Z'), 'UTC')
    expect(
      shouldSendReminderDigest({
        lastDigestLocalDate: null,
        nowMs: Date.parse('2026-11-05T01:00:00.000Z'),
        timeZone: 'UTC',
      }),
    ).toBe(true)
    expect(
      shouldSendReminderDigest({
        lastDigestLocalDate: today,
        nowMs: Date.parse('2026-11-05T23:00:00.000Z'),
        timeZone: 'UTC',
      }),
    ).toBe(false)
  })

  it('digest body mentions ready work', () => {
    const digest = buildReminderDigest({
      version: 1,
      items: [
        {
          id: 'r1',
          kind: 'reminder',
          title: 'Ship marketplace',
          phaseIndex: 1,
          manualOrder: 0,
          reminderStatus: 'ready',
          dependsOn: [],
          sourceRefs: [],
          supersededSources: [],
          userPinned: false,
          locked: false,
          featureIds: [],
          createdAt: '2026-11-05T00:00:00.000Z',
          updatedAt: '2026-11-05T00:00:00.000Z',
        },
      ],
      lastSyncedAt: null,
      lastSyncChangelog: [],
      composerMode: 'ask',
      pendingEditOffer: null,
    })
    expect(digest.events[0]?.kind).toBe('digest')
    expect(digest.events[0]?.body).toContain('Ship marketplace')
  })
})
