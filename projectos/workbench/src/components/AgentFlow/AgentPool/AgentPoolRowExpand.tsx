import { useEffect, useRef } from 'react'
import { useI18n } from '../../../i18n'
import type { AgentPoolFlowStep } from './projectAgentPool'
import styles from './AgentPoolRow.module.css'

interface Props {
  steps: AgentPoolFlowStep[]
  currentAction: string
}

export default function AgentPoolRowExpand({ steps, currentAction }: Props) {
  const { ts } = useI18n()
  const endRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    endRef.current?.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'nearest',
    })
  }, [steps.length, currentAction])

  return (
    <div className={styles.expand} aria-label={ts('agentFlow.pool.miniFlow')}>
      {steps.length === 0 ? (
        <p className={styles.expandEmpty}>{currentAction || ts('agentFlow.pool.noStepsYet')}</p>
      ) : (
        <ol className={styles.miniFlow}>
          {steps.map((step, index) => (
            <li
              key={step.id}
              className={styles.miniStep}
              data-status={step.status}
              ref={index === steps.length - 1 ? endRef : undefined}
            >
              <span className={styles.miniDot} aria-hidden />
              <span className={styles.miniLabel}>{step.label}</span>
              <span className={styles.miniStatus}>{step.status}</span>
            </li>
          ))}
        </ol>
      )}
      <p className={styles.expandCurrent}>
        <span className={styles.expandCurrentLabel}>{ts('agentFlow.pool.currentAction')}</span>
        {currentAction}
      </p>
    </div>
  )
}
