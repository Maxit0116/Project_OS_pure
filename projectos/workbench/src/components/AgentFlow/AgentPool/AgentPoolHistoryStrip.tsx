import { useI18n } from '../../../i18n'
import type { AgentPoolHistoryEntry, AgentPoolTask } from './projectAgentPool'
import { historyRunStatus } from './poolTiming'
import styles from './AgentPoolRow.module.css'

interface Props {
  task: AgentPoolTask
  onSelectHistory: (entry: AgentPoolHistoryEntry) => void
  onSelectCurrent: () => void
  selectedHistoryId: string | null
  loadingHistoryId?: string | null
}

export default function AgentPoolHistoryStrip({
  task,
  onSelectHistory,
  onSelectCurrent,
  selectedHistoryId,
  loadingHistoryId = null,
}: Props) {
  const { ts } = useI18n()
  if (task.history.length === 0) return null

  const runCount = task.history.length + 1

  return (
    <div className={styles.historyStrip} aria-label={ts('agentFlow.pool.history')}>
      <span className={styles.historyRunsLabel}>
        {ts('agentFlow.pool.historyRuns', { count: runCount })}
      </span>
      {task.history.map((entry, index) => {
        const statusKey = historyRunStatus(entry)
        const statusLabel = ts(
          `agentFlow.pool.historyRunStatus.${statusKey}` as 'agentFlow.pool.historyRunStatus.completed',
        )
        const loading = loadingHistoryId === entry.id
        return (
          <button
            key={entry.id}
            type="button"
            className={`${styles.historyPill} ${selectedHistoryId === entry.id ? styles.historyPillActive : ''}`}
            data-status={statusKey}
            data-loading={loading ? 'true' : undefined}
            onClick={() => onSelectHistory(entry)}
          >
            <span className={styles.historyPillLabel}>
              {loading
                ? ts('agentFlow.pool.historyLoading')
                : ts('agentFlow.pool.historyRunPill', {
                    n: String(index + 1).padStart(3, '0'),
                    status: statusLabel,
                  })}
            </span>
          </button>
        )
      })}
      <button
        type="button"
        className={`${styles.historyPill} ${styles.historyPillCurrent} ${selectedHistoryId == null ? styles.historyPillActive : ''}`}
        data-status="running"
        onClick={onSelectCurrent}
      >
        <span className={styles.historyPillLabel}>
          {ts('agentFlow.pool.historyRunPill', {
            n: String(runCount).padStart(3, '0'),
            status: ts('agentFlow.pool.live'),
          })}
        </span>
      </button>
    </div>
  )
}
