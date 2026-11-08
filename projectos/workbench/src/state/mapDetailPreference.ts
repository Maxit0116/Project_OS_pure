/**
 * How much technical detail the map shows. "Simple" (the default) uses plain words: what a part is for,
 * which files it holds, and what connects to what. "Technical" adds frameworks, protocols and the
 * architecture vocabulary (system context, container, component).
 */
export type MapDetail = 'simple' | 'technical'

const MAP_DETAIL_KEY = 'projectos_map_detail'

export function loadMapDetail(): MapDetail {
  try {
    const stored = localStorage.getItem(MAP_DETAIL_KEY)
    if (stored === 'simple' || stored === 'technical') return stored
  } catch {
    /* ignore */
  }
  return 'simple'
}

export function saveMapDetail(value: MapDetail): void {
  try {
    localStorage.setItem(MAP_DETAIL_KEY, value)
  } catch {
    /* ignore */
  }
}
