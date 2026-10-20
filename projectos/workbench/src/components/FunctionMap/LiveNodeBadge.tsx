import type { LiveNodeActivityKind, LiveNodeSummary } from '@contracts/index'
import { useI18n } from '../../i18n'
import styles from './LiveNodeBadge.module.css'

interface Props {
  summary: LiveNodeSummary
  compact?: boolean
}

const KIND_CLASS: Record<LiveNodeActivityKind, string> = {
  reading: styles.reading,
  editing: styles.editing,
  creating: styles.creating,
  running_tests: styles.runningTests,
  waiting: styles.waiting,
  needs_approval: styles.needsApproval,
  completed: styles.completed,
  failed: styles.failed,
}

const HOST_RING_CLASS: Record<LiveNodeActivityKind, string> = {
  reading: styles.hostReading,
  editing: styles.hostEditing,
  creating: styles.hostCreating,
  running_tests: styles.hostRunningTests,
  waiting: styles.hostWaiting,
  needs_approval: styles.hostNeedsApproval,
  completed: styles.hostCompleted,
  failed: styles.hostFailed,
}

/** Canvas badge: text + kind class (color is not the only signal). */
export default function LiveNodeBadge({ summary, compact = false }: Props) {
  const { ts } = useI18n()
  const kindLabel = ts(`map.liveGraph.kind.${summary.primaryKind}`)
  const statusHint =
    summary.primaryStatus === 'running'
      ? ts('map.liveGraph.status.running')
      : summary.primaryStatus === 'error'
        ? ts('map.liveGraph.status.error')
        : ts('map.liveGraph.status.complete')

  const multi =
    summary.activeCount > 1
      ? ts('map.liveGraph.multiActive', { count: summary.activeCount })
      : summary.totalCount > 1 && summary.activeCount === 0
        ? ts('map.liveGraph.multiTotal', { count: summary.totalCount })
        : null
  const agents =
    summary.agentLabels && summary.agentLabels.length > 0
      ? summary.agentLabels.join('·')
      : null

  return (
    <div
      className={`${styles.badge} ${KIND_CLASS[summary.primaryKind]} ${compact ? styles.compact : ''}`}
      data-live-kind={summary.primaryKind}
      data-live-status={summary.primaryStatus}
      data-live-agents={agents ?? undefined}
      title={`${kindLabel} · ${statusHint}${agents ? ` · ${agents}` : ''}${multi ? ` · ${multi}` : ''} · ${summary.label}`}
      aria-label={`${kindLabel}, ${summary.label}${agents ? `, ${agents}` : ''}${multi ? `, ${multi}` : ''}`}
    >
      <span className={styles.kind} aria-hidden>
        {kindGlyph(summary.primaryKind)}
      </span>
      <span className={styles.text}>
        {kindLabel}
        {multi ? ` · ${summary.activeCount > 1 ? summary.activeCount : summary.totalCount}` : ''}
      </span>
      {agents ? (
        <span className={styles.agents} aria-hidden>
          {agents}
        </span>
      ) : null}
    </div>
  )
}

function kindGlyph(kind: LiveNodeActivityKind): string {
  switch (kind) {
    case 'reading':
      return 'R'
    case 'editing':
      return 'E'
    case 'creating':
      return 'N'
    case 'running_tests':
      return 'T'
    case 'waiting':
      return 'W'
    case 'needs_approval':
      return '?'
    case 'completed':
      return 'V'
    case 'failed':
      return 'X'
    default:
      return '-'
  }
}

export function liveRingClass(summary: LiveNodeSummary | null | undefined): string {
  if (!summary) return ''
  return HOST_RING_CLASS[summary.primaryKind] ?? ''
}
