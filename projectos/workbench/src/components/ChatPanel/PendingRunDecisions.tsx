import { useEffect, useRef, useState } from 'react'
import type { RunDecision } from '@contracts/index'
import { useI18n } from '../../i18n'
import styles from './PendingRunDecisions.module.css'

interface Props {
  decisions: RunDecision[]
  resolvingIds: string[]
  focusedDecisionId?: string | null
  onResolve: (
    decision: RunDecision,
    optionId: string,
    text?: string,
    status?: 'resolved' | 'declined',
  ) => void
}

export default function PendingRunDecisions({ decisions, resolvingIds, focusedDecisionId, onResolve }: Props) {
  const { ts } = useI18n()
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [historyOpen, setHistoryOpen] = useState(false)
  const cardRef = useRef<HTMLElement>(null)
  const focusedAnswer = decisions.some((decision) =>
    decision.id === focusedDecisionId && decision.status !== 'pending')
  useEffect(() => {
    if (!focusedDecisionId) return
    const focusedItem = Array.from(cardRef.current?.querySelectorAll<HTMLElement>('[data-decision-id]') ?? [])
      .find((item) => item.dataset.decisionId === focusedDecisionId)
    focusedItem?.scrollIntoView?.({ block: 'center' })
  }, [focusedDecisionId, decisions])
  useEffect(() => {
    if (focusedAnswer) setHistoryOpen(true)
  }, [focusedAnswer])
  if (decisions.length === 0) return null
  const pending = decisions.filter((decision) => decision.status === 'pending')
  const answered = decisions.filter((decision) => decision.status !== 'pending')

  return (
    <section ref={cardRef} className={styles.card} aria-label={ts('decisions.title')}>
      <header className={styles.header}>
        <span>{ts('decisions.title')}</span>
        <span className={styles.count}>{pending.length}</span>
      </header>
      {pending.map((decision) => {
        const resolving = resolvingIds.includes(decision.id)
        return (
          <article
            key={decision.id}
            className={styles.decision}
            data-decision-id={decision.id}
            data-focused={focusedDecisionId === decision.id}
          >
            <span className={styles.kind}>{ts(`decisions.kind.${decision.kind}`)}</span>
            <p>{decision.question}</p>
            {decision.recommendation ? (
              <p className={styles.recommendation}>
                {ts('decisions.recommendation', { value: decision.recommendation })}
              </p>
            ) : null}
            <label className={styles.noteLabel}>
              {ts('decisions.note')}
              <input
                value={notes[decision.id] ?? ''}
                disabled={resolving}
                onChange={(event) => setNotes((current) => ({
                  ...current,
                  [decision.id]: event.target.value,
                }))}
              />
            </label>
            <div className={styles.options}>
              {decision.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={resolving}
                  onClick={() => onResolve(
                    decision,
                    option.id,
                    notes[decision.id]?.trim() || undefined,
                    /^(decline|stop|cancel)$/iu.test(option.id) ? 'declined' : 'resolved',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </article>
        )
      })}
      {answered.length > 0 ? (
        <details
          className={styles.history}
          open={historyOpen}
          onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
        >
          <summary>{ts('decisions.history', { count: answered.length })}</summary>
          {answered.map((decision) => (
            <div
              key={decision.id}
              className={styles.historyItem}
              data-decision-id={decision.id}
              data-focused={focusedDecisionId === decision.id}
            >
              <span>{decision.question}</span>
              <strong>{decision.answer?.text || decision.answer?.optionId || decision.status}</strong>
            </div>
          ))}
        </details>
      ) : null}
    </section>
  )
}
