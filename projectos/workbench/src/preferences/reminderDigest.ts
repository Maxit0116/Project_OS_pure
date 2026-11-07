const KEY_PREFIX = 'projectos_reminder_digest_'

export function loadReminderDigestLocalDate(projectId: string): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(`${KEY_PREFIX}${projectId}`)
  } catch {
    return null
  }
}

export function saveReminderDigestLocalDate(projectId: string, localDate: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(`${KEY_PREFIX}${projectId}`, localDate)
  } catch {
    /* ignore quota / private mode */
  }
}
