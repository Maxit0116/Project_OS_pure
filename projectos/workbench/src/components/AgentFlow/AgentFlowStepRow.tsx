import { useState } from 'react'
import { AlertCircle, Check, ChevronRight, Circle } from 'lucide-react'
import type { AgentFlowStep } from '@contracts/index'
import { useI18n } from '../../i18n'
import LiveStatusPulse from '../ui/LiveStatusPulse'
import styles from './AgentFlowStepRow.module.css'

const STATUS_CLASS: Record<string, string> = {
  pending: styles.pending,
  running: styles.running,
  complete: styles.complete,
  warning: styles.warning,
  error: styles.error,
  skipped: styles.skipped,
}

interface Props {
  step: AgentFlowStep
  isLast: boolean
  index: number
  onSelect: () => void
  selected: boolean
  hasCorrection?: boolean
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'complete') return <Check size={14} className={styles.iconComplete} />
  if (status === 'running') {
    return <LiveStatusPulse active className={styles.iconRunningDot} />
  }
  if (status === 'error') return <AlertCircle size={14} className={styles.iconError} />
  return <Circle size={14} className={styles.iconPending} />
}

export default function AgentFlowStepRow({
  step,
  isLast,
  index,
  onSelect,
  selected,
  hasCorrection,
}: Props) {
  const statusClass = STATUS_CLASS[step.status] ?? styles.pending
  const { ts } = useI18n()
  const live = step.status === 'running'
  const hasDetails = Boolean(step.outputSummary) || step.relatedFiles.length > 0
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={styles.wrapper} data-step style={{ animationDelay: `${index * 50}ms` }}>
      <div
        className={`${styles.card} ${statusClass} ${selected ? styles.selected : ''}`}
        data-live={live ? 'true' : undefined}
      >
        <div className={styles.row}>
          {hasDetails ? (
            <button
              type="button"
              className={styles.chevronBtn}
              aria-expanded={expanded}
              aria-label={expanded ? ts('agentFlow.collapseDetails') : ts('agentFlow.expandDetails')}
              onClick={(event) => {
                event.stopPropagation()
                setExpanded((open) => !open)
              }}
            >
              <ChevronRight
                size={14}
                className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}
                aria-hidden
              />
            </button>
          ) : (
            <span className={styles.chevronSpacer} aria-hidden />
          )}
          <button type="button" className={styles.selectBtn} onClick={onSelect}>
            <span className={`${styles.dot} ${statusClass}`}>
              <StatusIcon status={step.status} />
            </span>
            <div className={styles.content}>
              <div className={styles.label}>
                <LiveStatusPulse active={live} variant="label">
                  {step.label}
                </LiveStatusPulse>
                {hasCorrection && (
                  <span className={styles.correctionBadge}>{ts('agentFlow.correctionMarker')}</span>
                )}
              </div>
              <div className={styles.kind}>{step.kind.replace(/_/g, ' ')}</div>
              {expanded && step.outputSummary ? (
                <div className={styles.summary}>{step.outputSummary}</div>
              ) : null}
              {expanded && step.relatedFiles.length > 0 ? (
                <div className={styles.files}>
                  {step.relatedFiles.map((f) => (
                    <span key={f} className={styles.fileChip}>
                      {f.split('/').pop()}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </button>
        </div>
      </div>
      {!isLast && <div className={styles.connector} />}
    </div>
  )
}
