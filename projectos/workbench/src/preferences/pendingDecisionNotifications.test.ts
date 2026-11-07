import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadNotifyOnPendingDecisionPreference,
  markRunDecisionNotificationSeen,
  saveNotifyOnPendingDecisionPreference,
  wasRunDecisionNotificationSeen,
} from './pendingDecisionNotifications'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('pending decision notification preference', () => {
  it('defaults to enabled and persists an explicit opt-out', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    expect(loadNotifyOnPendingDecisionPreference()).toBe(true)
    saveNotifyOnPendingDecisionPreference(false)
    expect(loadNotifyOnPendingDecisionPreference()).toBe(false)
  })

  it('deduplicates alerts and bounds the persisted seen-id history', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    expect(wasRunDecisionNotificationSeen('old_decision')).toBe(false)
    markRunDecisionNotificationSeen('old_decision')
    markRunDecisionNotificationSeen('old_decision')
    expect(wasRunDecisionNotificationSeen('old_decision')).toBe(true)
    for (let index = 0; index < 501; index += 1) {
      markRunDecisionNotificationSeen(`decision_${index}`)
    }
    expect(JSON.parse(localStorage.getItem('projectos_seen_run_decision_notifications') ?? '[]')).toHaveLength(500)
    expect(wasRunDecisionNotificationSeen('old_decision')).toBe(false)
    expect(wasRunDecisionNotificationSeen('decision_500')).toBe(true)
  })
})
