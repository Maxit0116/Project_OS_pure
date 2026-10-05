const NOTIFY_KEY = 'projectos_notify_on_diff_ready'

export function loadNotifyOnDiffReadyPreference(): boolean {
  try {
    const stored = localStorage.getItem(NOTIFY_KEY)
    if (stored === 'false') return false
    if (stored === 'true') return true
  } catch {
    /* ignore */
  }
  return true
}

export function saveNotifyOnDiffReadyPreference(enabled: boolean) {
  try {
    localStorage.setItem(NOTIFY_KEY, enabled ? 'true' : 'false')
  } catch {
    /* ignore */
  }
}
