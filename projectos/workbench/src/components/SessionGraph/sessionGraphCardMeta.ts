/** Quiet threshold for Session Graph foot hint (Trace-inspired, UI-only). */
export const SESSION_GRAPH_QUIET_MS = 3 * 24 * 60 * 60 * 1000

export function isSessionGraphQuiet(
  lastUpdatedAt: string,
  status: string,
  nowMs = Date.now(),
): boolean {
  if (status !== 'idle') return false
  const updated = Date.parse(lastUpdatedAt)
  if (!Number.isFinite(updated)) return false
  return nowMs - updated >= SESSION_GRAPH_QUIET_MS
}

export function formatSessionGraphRelativeTime(
  iso: string,
  nowMs = Date.now(),
): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const deltaSec = Math.round((nowMs - then) / 1000)
  if (deltaSec < 60) return `${Math.max(0, deltaSec)}s`
  const deltaMin = Math.round(deltaSec / 60)
  if (deltaMin < 60) return `${deltaMin}m`
  const deltaHr = Math.round(deltaMin / 60)
  if (deltaHr < 48) return `${deltaHr}h`
  const deltaDay = Math.round(deltaHr / 24)
  return `${deltaDay}d`
}

export function sessionMatchesGraphQuery(
  query: string,
  input: {
    title: string
    responsibility?: string
    previewStrip?: ReadonlyArray<{ title: string }>
  },
): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  if (input.title.toLowerCase().includes(needle)) return true
  if (input.responsibility?.toLowerCase().includes(needle)) return true
  return (input.previewStrip ?? []).some((item) =>
    item.title.toLowerCase().includes(needle),
  )
}
