import { describe, expect, it } from 'vitest'
import {
  normalizeSessionSweepPreferences,
  shouldRunSessionSweepNow,
  snoozeExpiryIso,
} from './sessionSweep'

describe('sessionSweep preferences', () => {
  it('normalizes daily time and snooze days', () => {
    expect(
      normalizeSessionSweepPreferences({
        dailyTime: '9:5',
        snoozeDays: 3.6,
      }),
    ).toMatchObject({
      dailyTime: '09:05',
      snoozeDays: 4,
      tidyEnabled: true,
      allowAbsorb: true,
    })
  })

  it('gates the daily run on local wall clock', () => {
    const prefs = normalizeSessionSweepPreferences({
      enabled: true,
      tidyEnabled: true,
      dailyTime: '21:00',
    })
    const runtimeEmpty = {
      lastRunDate: null,
      pendingReviewJson: null,
      pendingTidyJson: null,
      snoozedUntil: {},
      tidySnoozedUntil: {},
    }
    const before = shouldRunSessionSweepNow(
      prefs,
      runtimeEmpty,
      new Date('2026-11-08T12:00:00'),
    )
    const after = shouldRunSessionSweepNow(
      prefs,
      runtimeEmpty,
      new Date('2026-11-08T21:00:00'),
    )
    const already = shouldRunSessionSweepNow(
      prefs,
      { ...runtimeEmpty, lastRunDate: '2026-11-08' },
      new Date('2026-11-08T22:00:00'),
    )
    expect(before).toBe(false)
    expect(after).toBe(true)
    expect(already).toBe(false)
  })

  it('builds a snooze expiry', () => {
    const iso = snoozeExpiryIso(3, new Date('2026-11-08T00:00:00.000Z'))
    expect(iso).toBe('2026-11-11T00:00:00.000Z')
  })
})
