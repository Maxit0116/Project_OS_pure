import type { LatestPlanTrace } from '../../state/workbenchStore'
import { useI18n } from '../../i18n'
import AgentActivityIndicator from '../ui/AgentActivityIndicator'
import styles from './AskTraceView.module.css'

export default function PlanTraceView({ trace }: { trace: LatestPlanTrace }) {
  const { ts } = useI18n()

  if (trace.status === 'running') {
    return (
      <div className={styles.trace}>
        <AgentActivityIndicator
          variant="pill"
          state="composing"
          label={ts('plan.building')}
        />
      </div>
    )
  }

  if (trace.status === 'error') {
    return (
      <div className={styles.trace}>
        <section className={`${styles.card} ${styles.error}`} role="alert">
          <h3>{ts('plan.failure', { message: trace.message })}</h3>
        </section>
      </div>
    )
  }

  const plan = trace.result
  return (
    <div className={styles.trace}>
      <section className={styles.card}>
        <h3>{ts('plan.title')}</h3>
        <p>{plan.objective}</p>
        <p>{ts(`plan.status.${plan.status}`)}</p>
        <ol>
          {plan.steps.map((step) => (
            <li key={step.id}>{step.description}</li>
          ))}
        </ol>
      </section>
    </div>
  )
}
