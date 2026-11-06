import { useMemo } from 'react'
import { CircleAlert } from 'lucide-react'
import { useI18n } from '../../../i18n'
import {
  agentPoolAxisRangeMs,
  type AgentPoolSpan,
} from './projectAgentPool'
import { formatElapsed, spanDurationLabel } from './poolTiming'
import styles from './AgentPoolMiniWaterfall.module.css'

interface Props {
  spans: AgentPoolSpan[]
  originMs: number
  nowMs: number
  /** Compact single-track bars for the collapsed life-line. */
  compact?: boolean
  /** Show shared-axis tick labels above expand rows. */
  showAxisTicks?: boolean
  selectedSpanId?: string | null
  onSelectSpan?: (span: AgentPoolSpan | null) => void
  ariaLabel?: string
}

function spanEnd(span: AgentPoolSpan, relativeNow: number): number {
  return span.endMs ?? relativeNow
}

function axisTicks(rangeMs: number): Array<{ label: string; pct: number }> {
  if (rangeMs <= 0) return [{ label: '0s', pct: 0 }]
  const marks = [0, 0.25, 0.5, 0.75, 1]
  return marks.map((fraction) => {
    const ms = rangeMs * fraction
    return {
      label: formatElapsed(ms),
      pct: fraction * 100,
    }
  })
}

export default function AgentPoolMiniWaterfall({
  spans,
  originMs,
  nowMs,
  compact = false,
  showAxisTicks = false,
  selectedSpanId = null,
  onSelectSpan,
  ariaLabel,
}: Props) {
  const { ts } = useI18n()
  const relativeNow = Math.max(0, nowMs - originMs)
  const rangeMs = agentPoolAxisRangeMs(spans, relativeNow)
  const ticks = useMemo(() => axisTicks(rangeMs), [rangeMs])

  const rows = useMemo(() => {
    if (compact) {
      return spans.filter(
        (span) =>
          span.kind === 'major' ||
          span.kind === 'step' ||
          span.kind === 'model' ||
          span.kind === 'tool' ||
          span.kind === 'action' ||
          span.kind === 'file' ||
          span.kind === 'apply' ||
          span.kind === 'verify' ||
          span.kind === 'wait' ||
          span.kind === 'handoff',
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
                title={`${span.label} · ${spanDurationLabel(span, relativeNow, ts('agentFlow.pool.spanRunning'))}`}
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
      {showAxisTicks ? (
        <div className={styles.axisTicks} aria-hidden>
          <span className={styles.axisLabelSpacer} />
          <span className={styles.axisTrack}>
            {ticks.map((tick, index) => (
              <span
                key={`${tick.pct}-${tick.label}`}
                className={styles.axisTick}
                data-edge={
                  index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : undefined
                }
                style={{ left: `${tick.pct}%` }}
              >
                {tick.label}
              </span>
            ))}
            <span
              className={styles.axisNow}
              style={{ left: `${Math.min(100, (relativeNow / rangeMs) * 100)}%` }}
            />
          </span>
          <span className={styles.axisMetaSpacer} />
        </div>
      ) : null}
      {rows.map((span) => {
        const start = span.startMs
        const end = spanEnd(span, relativeNow)
        const left = Math.min(100, (start / rangeMs) * 100)
        const width = Math.max(1.5, ((end - start) / rangeMs) * 100)
        const depth = span.level != null ? Math.max(0, span.level - 1) : span.parentId ? 1 : 0
        const selected = selectedSpanId === span.id
        const failed = span.status === 'error'
        const durationText =
          span.endMs == null
            ? ts('agentFlow.pool.spanRunning')
            : formatElapsed(end - start)
        const attemptSuffix =
          span.attempt && span.attempt > 1
            ? ` · ${ts('agentFlow.pool.attempt', { n: span.attempt })}`
            : ''
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
            <span className={styles.rowLabel}>
              {failed ? (
                <CircleAlert
                  size={12}
                  className={styles.rowErrorIcon}
                  aria-label={ts('agentFlow.pool.spanFailed')}
                />
              ) : null}
              <span className={styles.rowLabelText}>
                {span.label}
                {attemptSuffix}
              </span>
            </span>
            <span className={styles.rowTrack}>
              <span
                className={styles.rowBar}
                data-kind={span.kind}
                data-status={span.status}
                data-growing={span.endMs == null ? 'true' : undefined}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
              {span.endMs == null ? (
                <span
                  className={styles.rowPlayhead}
                  style={{ left: `${Math.min(100, (relativeNow / rangeMs) * 100)}%` }}
                  aria-hidden
                />
              ) : null}
            </span>
            <span className={styles.rowMeta}>{durationText}</span>
          </button>
        )
      })}
    </div>
  )
}
