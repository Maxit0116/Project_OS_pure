import { Check, AlertCircle, Circle } from 'lucide-react'
import type { AgentFlowStep } from '@contracts/index'
import { useI18n } from '../../i18n'
import ThinkingOrb from '../ui/ThinkingOrb'
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
    return <ThinkingOrb state="working" size={20} className={styles.iconRunning} />
  }
  if (status === 'error') return <AlertCircle size={14} className={styles.iconError} />
  return <Circle size={14} className={styles.iconPending} />
}

export default function AgentFlowStepRow({ step, isLast, index, onSelect, selected, hasCorrection }: Props) {
  const statusClass = STATUS_CLASS[step.status] ?? styles.pending
  const { ts } = useI18n()

  return (
    <div className={styles.wrapper} data-step style={{ animationDelay: `${index * 50}ms` }}>
      <button
        type="button"
        className={`${styles.card} ${statusClass} fade-slide-up ${selected ? styles.selected : ''}`}
        onClick={onSelect}
      >
        <div className={styles.row}>
          <span className={`${styles.dot} ${statusClass}`}>
            <StatusIcon status={step.status} />
          </span>
          <div className={styles.content}>
            <div className={styles.label}>
              {step.label}
              {hasCorrection && (
                <span className={styles.correctionBadge}>{ts('agentFlow.correctionMarker')}</span>
              )}
            </div>
            <div className={styles.kind}>{step.kind.replace(/_/g, ' ')}</div>
            {step.outputSummary && (
              <div className={styles.summary}>{step.outputSummary}</div>
            )}
            {step.relatedFiles.length > 0 && (
              <div className={styles.files}>
                {step.relatedFiles.map((f) => (
                  <span key={f} className={styles.fileChip}>{f.split('/').pop()}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </button>
      {!isLast && <div className={styles.connector} />}
    </div>
  )
}
