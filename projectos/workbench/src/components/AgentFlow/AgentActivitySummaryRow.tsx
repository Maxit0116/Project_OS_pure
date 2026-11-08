import LiveStatusPulse from '../ui/LiveStatusPulse'
import styles from './AgentActivitySummaryRow.module.css'

interface Props {
  id: string
  status: 'running' | 'complete' | 'error'
  summary: string
  onOpen: () => void
}

export default function AgentActivitySummaryRow({ id, status, summary, onOpen }: Props) {
  const live = status === 'running'

  return (
    <button
      type="button"
      className={`${styles.row} ${styles[status]}`}
      data-agent-activity={id}
      data-live={live ? 'true' : undefined}
      onClick={onOpen}
    >
      {live ? (
        <LiveStatusPulse active className={styles.markLive} />
      ) : (
        <span className={styles.mark} aria-hidden />
      )}
      <LiveStatusPulse active={live} variant="label" className={styles.summary}>
        {summary}
      </LiveStatusPulse>
    </button>
  )
}
