export interface SessionSweepPreferences {
  enabled: boolean
  /** Continuity tidy (same-feature merge/attach) — runs before sweep. */
  tidyEnabled: boolean
  /** Local wall-clock HH:MM (24h). Shared by tidy + sweep. */
  dailyTime: string
  /** Days a kept session / skipped cluster stays out of nominations. */
  snoozeDays: number
  notifyEnabled: boolean
  tidyNotifyEnabled: boolean
  /** Allow absorb (merge transcript into anchor) suggestions. */
  allowAbsorb: boolean
}

export interface SessionSweepRuntimeState {
  /** ISO date (YYYY-MM-DD) of last successful hygiene run (tidy then sweep). */
  lastRunDate: string | null
  /** Pending sweep review payload JSON. */
  pendingReviewJson: string | null
  /** Pending continuity tidy review payload JSON. */
  pendingTidyJson: string | null
  /** sessionId → ISO snooze expiry (sweep keep). */
  snoozedUntil: Record<string, string>
  /** clusterId or sessionId → ISO snooze expiry (tidy skip). */
  tidySnoozedUntil: Record<string, string>
}

const PREFS_KEY = 'projectos_session_sweep_prefs'
const RUNTIME_KEY = 'projectos_session_sweep_runtime'

export const DEFAULT_SESSION_SWEEP_PREFERENCES: SessionSweepPreferences = {
  enabled: true,
  tidyEnabled: true,
  dailyTime: '21:00',
  snoozeDays: 3,
  notifyEnabled: true,
  tidyNotifyEnabled: true,
  allowAbsorb: true,
}

function parseDailyTime(value: string): string | null {
  const match = /^(\d{1,2}):(\d{1,2})$/u.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function normalizeSessionSweepPreferences(
  input: Partial<SessionSweepPreferences> | null | undefined,
): SessionSweepPreferences {
  const dailyTime = parseDailyTime(input?.dailyTime ?? '') ?? DEFAULT_SESSION_SWEEP_PREFERENCES.dailyTime
  const snoozeDaysRaw = input?.snoozeDays
  const snoozeDays =
    typeof snoozeDaysRaw === 'number' && Number.isFinite(snoozeDaysRaw)
      ? Math.min(90, Math.max(1, Math.round(snoozeDaysRaw)))
      : DEFAULT_SESSION_SWEEP_PREFERENCES.snoozeDays
  return {
    enabled: input?.enabled ?? DEFAULT_SESSION_SWEEP_PREFERENCES.enabled,
    tidyEnabled: input?.tidyEnabled ?? DEFAULT_SESSION_SWEEP_PREFERENCES.tidyEnabled,
    dailyTime,
    snoozeDays,
    notifyEnabled: input?.notifyEnabled ?? DEFAULT_SESSION_SWEEP_PREFERENCES.notifyEnabled,
    tidyNotifyEnabled:
      input?.tidyNotifyEnabled ?? DEFAULT_SESSION_SWEEP_PREFERENCES.tidyNotifyEnabled,
    allowAbsorb: input?.allowAbsorb ?? DEFAULT_SESSION_SWEEP_PREFERENCES.allowAbsorb,
  }
}

export function loadSessionSweepPreferences(): SessionSweepPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_SESSION_SWEEP_PREFERENCES }
    return normalizeSessionSweepPreferences(JSON.parse(raw) as Partial<SessionSweepPreferences>)
  } catch {
    return { ...DEFAULT_SESSION_SWEEP_PREFERENCES }
  }
}

export function saveSessionSweepPreferences(prefs: SessionSweepPreferences): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(normalizeSessionSweepPreferences(prefs)))
  } catch {
    /* ignore */
  }
}

function readSnoozeMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

export function loadSessionSweepRuntime(): SessionSweepRuntimeState {
  try {
    const raw = localStorage.getItem(RUNTIME_KEY)
    if (!raw) {
      return {
        lastRunDate: null,
        pendingReviewJson: null,
        pendingTidyJson: null,
        snoozedUntil: {},
        tidySnoozedUntil: {},
      }
    }
    const parsed = JSON.parse(raw) as Partial<SessionSweepRuntimeState>
    return {
      lastRunDate: typeof parsed.lastRunDate === 'string' ? parsed.lastRunDate : null,
      pendingReviewJson:
        typeof parsed.pendingReviewJson === 'string' ? parsed.pendingReviewJson : null,
      pendingTidyJson: typeof parsed.pendingTidyJson === 'string' ? parsed.pendingTidyJson : null,
      snoozedUntil: readSnoozeMap(parsed.snoozedUntil),
      tidySnoozedUntil: readSnoozeMap(parsed.tidySnoozedUntil),
    }
  } catch {
    return {
      lastRunDate: null,
      pendingReviewJson: null,
      pendingTidyJson: null,
      snoozedUntil: {},
      tidySnoozedUntil: {},
    }
  }
}

export function saveSessionSweepRuntime(state: SessionSweepRuntimeState): void {
  try {
    localStorage.setItem(RUNTIME_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export function localDateKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** True when local wall clock is at/after today's configured HH:MM and we have not run yet today. */
export function shouldRunSessionSweepNow(
  prefs: Pick<SessionSweepPreferences, 'enabled' | 'tidyEnabled' | 'dailyTime'>,
  runtime: Pick<SessionSweepRuntimeState, 'lastRunDate'>,
  now = new Date(),
): boolean {
  if (!prefs.enabled && !prefs.tidyEnabled) return false
  const today = localDateKey(now)
  if (runtime.lastRunDate === today) return false
  const parsed = parseDailyTime(prefs.dailyTime)
  if (!parsed) return false
  const [h, m] = parsed.split(':').map(Number)
  const minutesNow = now.getHours() * 60 + now.getMinutes()
  const minutesTarget = (h ?? 0) * 60 + (m ?? 0)
  return minutesNow >= minutesTarget
}

export function snoozeExpiryIso(snoozeDays: number, now = new Date()): string {
  const ms = Math.max(1, snoozeDays) * 24 * 60 * 60 * 1000
  return new Date(now.getTime() + ms).toISOString()
}

export function pruneExpiredSnoozes(
  snoozedUntil: Record<string, string>,
  nowMs = Date.now(),
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [id, iso] of Object.entries(snoozedUntil)) {
    if (Date.parse(iso) > nowMs) next[id] = iso
  }
  return next
}
