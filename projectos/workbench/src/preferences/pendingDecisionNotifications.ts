const ENABLED_KEY = 'projectos_notify_on_pending_decision'
const SEEN_KEY = 'projectos_seen_run_decision_notifications'
const MAX_SEEN_IDS = 500

export function loadNotifyOnPendingDecisionPreference(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'false'
  } catch {
    return true
  }
}

export function saveNotifyOnPendingDecisionPreference(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false')
  } catch {
    /* ignore */
  }
}

export function wasRunDecisionNotificationSeen(decisionId: string): boolean {
  try {
    const ids = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')
    return Array.isArray(ids) && ids.includes(decisionId)
  } catch {
    return false
  }
}

export function markRunDecisionNotificationSeen(decisionId: string): void {
  try {
    const stored = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')
    const ids = Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []
    if (!ids.includes(decisionId)) ids.push(decisionId)
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-MAX_SEEN_IDS)))
  } catch {
    /* ignore */
  }
}
