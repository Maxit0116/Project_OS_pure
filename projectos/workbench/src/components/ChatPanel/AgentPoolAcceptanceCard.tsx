import { useState } from 'react'
import { useI18n } from '../../i18n'
import Button from '../ui/Button'
import { useAgentPoolStore } from '../AgentFlow/AgentPool/agentPoolStore'
import type { AgentPoolTask } from '../AgentFlow/AgentPool/projectAgentPool'
import styles from './AgentPoolAcceptanceCard.module.css'

interface Props {
  task: AgentPoolTask
}

export default function AgentPoolAcceptanceCard({ task }: Props) {
  const { ts } = useI18n()
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(task.acceptanceCriteria.map((_, index) => [`${index}`, false])),
  )
  const [feedback, setFeedback] = useState('')

  const allChecked =
    task.acceptanceCriteria.length === 0 ||
    task.acceptanceCriteria.every((_, index) => checked[`${index}`])

  return (
    <section
      className={styles.card}
      data-agent-pool-acceptance={task.taskId}
      aria-label={ts('agentFlow.pool.acceptanceTitle')}
    >
      <header className={styles.header}>
        <h3 className={styles.title}>{ts('agentFlow.pool.acceptanceTitle')}</h3>
        <span className={styles.badge}>{task.title}</span>
      </header>

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>{ts('agentFlow.pool.requirement')}</h4>
        <p className={styles.body}>{task.requirementSummary}</p>
      </div>

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>{ts('agentFlow.pool.criteria')}</h4>
        <ul className={styles.criteria}>
          {task.acceptanceCriteria.map((criterion, index) => (
            <li key={`${criterion}-${index}`}>
              <label className={styles.criterion}>
                <input
                  type="checkbox"
                  checked={Boolean(checked[`${index}`])}
                  onChange={(event) => {
                    setChecked((prev) => ({
                      ...prev,
                      [`${index}`]: event.target.checked,
                    }))
                  }}
                />
                <span>{criterion}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <label className={styles.feedbackLabel}>
        {ts('agentFlow.pool.continueFeedback')}
        <textarea
          className={styles.feedback}
          value={feedback}
          rows={3}
          placeholder={ts('agentFlow.pool.continueFeedbackPlaceholder')}
          onChange={(event) => setFeedback(event.target.value)}
        />
      </label>

      <div className={styles.actions}>
        <Button
          variant="primary"
          disabled={!allChecked}
          onClick={() => useAgentPoolStore.getState().acceptTask(task.taskId)}
        >
          {ts('agentFlow.pool.accept')}
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            useAgentPoolStore.getState().continueTask(task.taskId, feedback)
          }
        >
          {ts('agentFlow.pool.continueOptimize')}
        </Button>
      </div>
    </section>
  )
}
