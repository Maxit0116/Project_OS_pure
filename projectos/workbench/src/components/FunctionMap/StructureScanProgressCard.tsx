import { Check, Circle, Loader2, Minus, X } from 'lucide-react'
import type { StructureScanProgress, StructureScanStep } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import styles from './StructureScanProgressCard.module.css'

interface Props {
  progress: StructureScanProgress
}

function stepLabelKey(stepId: StructureScanStep['id']): string {
  return `map.structureScan.steps.${stepId}`
}

function StepIcon({ status }: { status: StructureScanStep['status'] }) {
  switch (status) {
    case 'complete':
      return <Check size={12} strokeWidth={2.25} aria-hidden />
    case 'running':
      return <Loader2 size={12} strokeWidth={2} className={styles.spin} aria-hidden />
    case 'failed':
      return <X size={12} strokeWidth={2.25} aria-hidden />
    case 'skipped':
      return <Minus size={12} strokeWidth={2} aria-hidden />
    default:
      return <Circle size={10} strokeWidth={1.75} aria-hidden />
  }
}

export default function StructureScanProgressCard({ progress }: Props) {
  const { ts } = useI18n()
  const cancelStructureScan = useWorkbenchStore((s) => s.cancelStructureScan)
  const running = progress.status === 'running'
  const failed = progress.status === 'failed'
  const success = progress.status === 'success'
  const cancelled = progress.status === 'cancelled'

  if (progress.status === 'idle') return null

  const title = success
    ? ts('map.structureScan.success')
    : failed
      ? ts('map.structureScan.failed')
      : cancelled
        ? ts('map.structureScan.cancelled')
        : ts('map.structureScan.title')

  return (
    <div
      className={`${styles.card} ${success ? styles.success : ''} ${failed ? styles.failed : ''} ${cancelled ? styles.cancelled : ''}`}
      role="status"
      aria-live="polite"
      aria-busy={running}
    >
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <div className={styles.headerActions}>
          {running ? (
            <>
              <Loader2 size={14} strokeWidth={2} className={styles.spin} aria-hidden />
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => {
                  void cancelStructureScan()
                }}
              >
                {ts('map.structureScan.cancel')}
              </button>
            </>
          ) : null}
        </div>
      </div>
      <ol className={styles.steps}>
        {progress.steps.map((step) => (
          <li
            key={step.id}
            className={`${styles.step} ${styles[step.status]}`}
            data-status={step.status}
          >
            <span className={styles.icon}>
              <StepIcon status={step.status} />
            </span>
            <span className={styles.label}>{ts(stepLabelKey(step.id))}</span>
            {step.detail ? <span className={styles.detail}>{step.detail}</span> : null}
          </li>
        ))}
      </ol>
      {failed && progress.error ? (
        <p className={styles.error}>{progress.error}</p>
      ) : null}
    </div>
  )
}
