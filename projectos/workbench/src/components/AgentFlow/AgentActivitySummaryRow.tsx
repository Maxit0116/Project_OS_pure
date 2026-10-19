import styles from './AgentActivitySummaryRow.module.css'

interface Props {
  id: string
  status: 'running' | 'complete' | 'error'
  summary: string
  onOpen: () => void
}

export default function AgentActivitySummaryRow({ id, status, summary, onOpen }: Props) {
  return (
    <button
      type="button"
      className={`${styles.row} ${styles[status]}`}
      data-agent-activity={id}
      onClick={onOpen}
    >
      <span className={styles.mark} aria-hidden />
      <span className={styles.summary}>{summary}</span>
    </button>
  )
}
