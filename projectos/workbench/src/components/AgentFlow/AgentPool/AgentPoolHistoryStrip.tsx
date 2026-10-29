import { useI18n } from '../../../i18n'
import type { AgentPoolHistoryEntry, AgentPoolTask } from './projectAgentPool'
import styles from './AgentPoolRow.module.css'

interface Props {
  task: AgentPoolTask
  onSelectHistory: (entry: AgentPoolHistoryEntry) => void
  selectedHistoryId: string | null
}

export default function AgentPoolHistoryStrip({
  task,
  onSelectHistory,
  selectedHistoryId,
}: Props) {
  const { ts } = useI18n()
  if (task.history.length === 0) return null

  return (
    <div className={styles.historyStrip} aria-label={ts('agentFlow.pool.history')}>
      {task.history.map((entry, index) => (
        <button
          key={entry.id}
          type="button"
          className={`${styles.historyCard} ${selectedHistoryId === entry.id ? styles.historyCardActive : ''}`}
          onClick={() => onSelectHistory(entry)}
        >
          <span className={styles.historyIndex}>
            {ts('agentFlow.pool.historyN', { n: index + 1 })}
          </span>
          <span className={styles.historyAction}>{entry.currentAction}</span>
        </button>
      ))}
      <span className={styles.historyArrow} aria-hidden>
        →
      </span>
      <div className={`${styles.historyCard} ${styles.historyCurrent}`}>
        <span className={styles.historyIndex}>{ts('agentFlow.pool.currentAgent')}</span>
        <span className={styles.historyAction}>{task.currentAction}</span>
      </div>
    </div>
  )
}
