import type { AgentPoolSpan } from './projectAgentPool'

/** Format a duration for Pool elapsed / span meta (tabular-nums friendly). */
export function formatElapsed(ms: number): string {
  const safe = Math.max(0, ms)
  if (safe < 1000) return `${Math.round(safe)}ms`
  const seconds = safe / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const minutes = Math.floor(seconds / 60)
  const rem = Math.round(seconds % 60)
  return `${minutes}m ${rem}s`
}

/** Duration label for a span relative to shared pool clock. */
export function spanDurationLabel(
  span: Pick<AgentPoolSpan, 'startMs' | 'endMs'>,
  _relativeNowMs: number,
  runningLabel = 'live',
): string {
  if (span.endMs == null) return runningLabel
  return formatElapsed(span.endMs - span.startMs)
}

/**
 * Lane elapsed: prefer the open (growing) span; else wall time since origin
 * for live statuses; else sealed axis end.
 */
export function laneElapsedMs(input: {
  originMs: number
  nowMs: number
  spans: ReadonlyArray<Pick<AgentPoolSpan, 'startMs' | 'endMs'>>
  live: boolean
}): number {
  const relativeNow = Math.max(0, input.nowMs - input.originMs)
  const growing = input.spans.find((span) => span.endMs == null)
  if (growing) return Math.max(0, relativeNow - growing.startMs)
  if (input.live) return relativeNow
  let maxEnd = 0
  for (const span of input.spans) {
    const end = span.endMs ?? span.startMs
    if (end > maxEnd) maxEnd = end
  }
  return maxEnd
}

export function historyRunStatus(entry: {
  acceptance?: 'accepted' | 'rejected' | 'pending' | 'none'
  spans?: ReadonlyArray<Pick<AgentPoolSpan, 'status' | 'endMs'>>
}): 'completed' | 'failed' | 'running' | 'pending' {
  if (entry.acceptance === 'accepted') return 'completed'
  if (entry.acceptance === 'rejected') return 'pending'
  const spans = entry.spans ?? []
  if (spans.some((span) => span.status === 'error')) return 'failed'
  if (spans.some((span) => span.endMs == null || span.status === 'running')) {
    return 'running'
  }
  if (spans.length > 0) return 'completed'
  return 'pending'
}
