import { useMemo } from 'react'
import { useI18n } from '../../../i18n'
import {
  agentPoolAxisRangeMs,
  type AgentPoolSpan,
} from './projectAgentPool'
import styles from './AgentPoolMiniWaterfall.module.css'

interface Props {
  spans: AgentPoolSpan[]
  originMs: number
  nowMs: number
  /** Compact single-track bars for the collapsed life-line. */
  compact?: boolean
  selectedSpanId?: string | null
  onSelectSpan?: (span: AgentPoolSpan | null) => void
  ariaLabel?: string
}

function spanEnd(span: AgentPoolSpan, relativeNow: number): number {
  return span.endMs ?? relativeNow
}

export default function AgentPoolMiniWaterfall({
  spans,
  originMs,
  nowMs,
  compact = false,
  selectedSpanId = null,
  onSelectSpan,
  ariaLabel,
}: Props) {
  const { ts } = useI18n()
  const relativeNow = Math.max(0, nowMs - originMs)
  const rangeMs = agentPoolAxisRangeMs(spans, relativeNow)

  const rows = useMemo(() => {
    if (compact) {
      // Default density: Major Actions (and legacy step/action bars), not agent umbrella.
      return spans.filter(
        (span) =>
          span.kind === 'major' ||
          span.kind === 'step' ||
          span.kind === 'model' ||
          span.kind === 'tool' ||
          span.kind === 'action' ||
          span.kind === 'file' ||
          span.kind === 'apply' ||
          span.kind === 'verify',
      )
    }
    return spans.filter((span) => span.kind !== 'agent')
  }, [compact, spans])

  if (spans.length === 0) {
    return (
      <div className={styles.empty} role="status">
        {ts('agentFlow.pool.noStepsYet')}
      </div>
    )
  }

  if (compact) {
    return (
      <div
        className={styles.compact}
        role="img"
        aria-label={ariaLabel ?? ts('agentFlow.pool.miniWaterfall')}
      >
        <div className={styles.compactTrack}>
          {rows.map((span) => {
            const start = span.startMs
            const end = spanEnd(span, relativeNow)
            const left = Math.min(100, (start / rangeMs) * 100)
            const width = Math.max(1.5, ((end - start) / rangeMs) * 100)
            return (
              <span
                key={span.id}
                className={styles.compactBar}
                data-kind={span.kind}
                data-status={span.status}
                data-growing={span.endMs == null ? 'true' : undefined}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={span.label}
              />
            )
          })}
          {rows.some((span) => span.endMs == null) ? (
            <span
              className={styles.playhead}
              style={{ left: `${Math.min(100, (relativeNow / rangeMs) * 100)}%` }}
              aria-hidden
            />
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      className={styles.expand}
      role="list"
      aria-label={ariaLabel ?? ts('agentFlow.pool.miniWaterfall')}
    >
      {rows.map((span) => {
        const start = span.startMs
        const end = spanEnd(span, relativeNow)
        const left = Math.min(100, (start / rangeMs) * 100)
        const width = Math.max(1.5, ((end - start) / rangeMs) * 100)
          const depth = span.level != null ? Math.max(0, span.level - 1) : span.parentId ? 1 : 0
          const selected = selectedSpanId === span.id
          return (
            <button
              key={span.id}
              type="button"
              role="listitem"
              className={styles.row}
              data-kind={span.kind}
              data-status={span.status}
              data-selected={selected ? 'true' : undefined}
              data-depth={depth}
              data-timing={span.timingQuality}
              aria-pressed={selected}
              onClick={() => onSelectSpan?.(selected ? null : span)}
            >
            <span className={styles.rowLabel}>{span.label}</span>
            <span className={styles.rowTrack}>
              <span
                className={styles.rowBar}
                data-kind={span.kind}
                data-status={span.status}
                data-growing={span.endMs == null ? 'true' : undefined}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            </span>
            <span className={styles.rowMeta}>
              {span.endMs == null
                ? ts('agentFlow.pool.spanRunning')
                : formatDuration(end - start)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const minutes = Math.floor(seconds / 60)
  const rem = Math.round(seconds % 60)
  return `${minutes}m ${rem}s`
}
