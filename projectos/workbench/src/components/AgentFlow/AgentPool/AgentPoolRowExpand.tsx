import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../../i18n'
import AgentPoolMiniWaterfall from './AgentPoolMiniWaterfall'
import type { AgentPoolFlowStep, AgentPoolSpan } from './projectAgentPool'
import styles from './AgentPoolRow.module.css'

interface Props {
  steps: AgentPoolFlowStep[]
  spans: AgentPoolSpan[]
  originMs: number
  nowMs: number
  currentAction: string
}

export default function AgentPoolRowExpand({
  steps,
  spans,
  originMs,
  nowMs,
  currentAction,
}: Props) {
  const { ts } = useI18n()
  const endRef = useRef<HTMLLIElement>(null)
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)
  const selectedSpan = spans.find((span) => span.id === selectedSpanId) ?? null
  const useWaterfall = spans.length > 0

  useEffect(() => {
    if (useWaterfall) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    endRef.current?.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'nearest',
    })
  }, [steps.length, currentAction, useWaterfall])

  return (
    <div className={styles.expand} aria-label={ts('agentFlow.pool.miniFlow')}>
      {useWaterfall ? (
        <>
          <AgentPoolMiniWaterfall
            spans={spans}
            originMs={originMs}
            nowMs={nowMs}
            selectedSpanId={selectedSpanId}
            onSelectSpan={(span) => setSelectedSpanId(span?.id ?? null)}
          />
          {selectedSpan ? (
            <p className={styles.expandCurrent}>
              <span className={styles.expandCurrentLabel}>{ts('agentFlow.pool.spanDetail')}</span>
              {selectedSpan.label}
              <span className={styles.spanKind}> · {selectedSpan.kind}</span>
            </p>
          ) : (
            <p className={styles.expandCurrent}>
              <span className={styles.expandCurrentLabel}>{ts('agentFlow.pool.currentAction')}</span>
              {currentAction}
            </p>
          )}
        </>
      ) : steps.length === 0 ? (
        <p className={styles.expandEmpty}>{currentAction || ts('agentFlow.pool.noStepsYet')}</p>
      ) : (
        <>
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
          <p className={styles.expandCurrent}>
            <span className={styles.expandCurrentLabel}>{ts('agentFlow.pool.currentAction')}</span>
            {currentAction}
          </p>
        </>
      )}
    </div>
  )
}
