export interface SessionRoutePreferences {
  enabled: boolean
  /** High-confidence matches apply without preview; user still sends manually. */
  autoApplyHighConfidence: boolean
}

const PREFS_KEY = 'projectos_session_route_prefs'

export const DEFAULT_SESSION_ROUTE_PREFERENCES: SessionRoutePreferences = {
  enabled: true,
  autoApplyHighConfidence: true,
}

export function normalizeSessionRoutePreferences(
  input: Partial<SessionRoutePreferences> | null | undefined,
): SessionRoutePreferences {
  return {
    enabled: input?.enabled ?? DEFAULT_SESSION_ROUTE_PREFERENCES.enabled,
    autoApplyHighConfidence:
      input?.autoApplyHighConfidence ??
      DEFAULT_SESSION_ROUTE_PREFERENCES.autoApplyHighConfidence,
  }
}

export function loadSessionRoutePreferences(): SessionRoutePreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_SESSION_ROUTE_PREFERENCES }
    return normalizeSessionRoutePreferences(
      JSON.parse(raw) as Partial<SessionRoutePreferences>,
    )
  } catch {
    return { ...DEFAULT_SESSION_ROUTE_PREFERENCES }
  }
}

export function saveSessionRoutePreferences(prefs: SessionRoutePreferences): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(normalizeSessionRoutePreferences(prefs)))
  } catch {
    /* ignore */
  }
}
