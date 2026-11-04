import { useMemo, useState } from 'react'
import type { RequestIntent } from '@contracts/index'
import { useI18n } from '../../i18n'
import Button from '../ui/Button'
import styles from './PromptRefinementCard.module.css'

interface Props {
  intent: RequestIntent
  busy: boolean
  executorLabel: string
  /** For a runtime executor: who validates its proposal. Undefined for a model run. */
  validation?: { kind: 'model'; label: string } | { kind: 'devOnly' } | { kind: 'none' }
  onApprove: (answers: Array<{ questionId: string; answer: string; selectedOptionId?: string }>) => void
  onRevise: () => void
}

export default function RequestIntentCard({ intent, busy, executorLabel, validation, onApprove, onRevise }: Props) {
  const { ts } = useI18n()
  const [answers, setAnswers] = useState<Record<string, { answer: string; selectedOptionId?: string }>>(() =>
    Object.fromEntries(intent.questions.filter((question) => question.answer).map((question) => [
      question.id,
      { answer: question.answer!, ...(question.selectedOptionId ? { selectedOptionId: question.selectedOptionId } : {}) },
    ])),
  )
  const missingAnswers = useMemo(
    () => intent.questions.some((question) => !answers[question.id]?.answer.trim()),
    [answers, intent.questions],
  )
  const approvalAnswers = () => intent.questions.flatMap((question) => {
    const answer = answers[question.id]
    return answer?.answer.trim()
      ? [{ questionId: question.id, ...answer }]
      : []
  })

  return (
    <div className={`${styles.card} fade-slide-up`} data-tour="request-intent" data-intent-id={intent.id}>
      <div className={styles.header}>
        <span className={styles.title}>{ts('intent.title')}</span>
        <span className={styles.badge}>{executorLabel}</span>
      </div>
      <p className={styles.explanation}>{ts('intent.explanation')}</p>
      <section className={styles.section}>
        <h4>{ts('intent.goal')}</h4>
        <p>{intent.goal}</p>
      </section>
      {validation ? (
        <section className={styles.section}>
          <h4>{ts('intent.validation')}</h4>
          <p>{validation.kind === 'model'
            ? ts('intent.validatedBy', { name: validation.label })
            : validation.kind === 'devOnly' ? ts('intent.devStandIn') : ts('intent.noValidator')}</p>
        </section>
      ) : null}
      <section className={styles.section}>
        <h4>{ts('intent.touchedCapabilities')}</h4>
        <ul>{intent.touches.map((touch) => <li key={touch.nodeId}>{touch.nodeId}: {touch.reason}</li>)}</ul>
      </section>
      {intent.structuralEffects.length > 0 ? (
        <section className={styles.section}>
          <h4>{ts('intent.structuralEffects')}</h4>
          <ul>{intent.structuralEffects.map((effect, index) => (
            <li key={`${effect.kind}-${index}`}>
              {effect.kind === 'delete_node'
                ? ts('intent.deleteEffect', { nodeId: effect.nodeId, nodes: effect.descendantCount, files: effect.ownedFileCount })
                : effect.kind === 'add_node'
                  ? <>
                    {ts('intent.addEffect', { name: effect.name, parent: effect.parentNodeId, level: effect.level ?? ts('intent.legacyLevel') })}
                    {(effect.wiring ?? []).length > 0 ? (
                      <ul>{(effect.wiring ?? []).map((wire, wireIndex) => (
                        <li key={`${wire.existingNodeId}-${wireIndex}`}>
                          {ts('intent.addWiringEffect', {
                            direction: wire.direction === 'from_new' ? 'from' : 'to',
                            nodeId: wire.existingNodeId,
                            relation: wire.relation,
                            label: wire.label,
                          })}
                        </li>
                      ))}</ul>
                    ) : null}
                  </>
                  : ts('intent.connectEffect', { source: effect.sourceNodeId, target: effect.targetNodeId })}
            </li>
          ))}</ul>
        </section>
      ) : null}
      {intent.assumptions.length > 0 ? (
        <section className={styles.section}>
          <h4>{ts('intent.assumptions')}</h4>
          <ul>{intent.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}
      {intent.outOfScope.length > 0 ? (
        <section className={styles.section}>
          <h4>{ts('intent.outOfScope')}</h4>
          <ul>{intent.outOfScope.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}
      <section className={styles.section}>
        <h4>{ts('intent.acceptance')}</h4>
        <ul>{intent.acceptance.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      {intent.questions.map((question) => (
        <section className={styles.section} key={question.id}>
          <h4>{ts('intent.question')}</h4>
          <p>{question.text}</p>
          {question.options?.length ? (
            <div className={styles.questionList} role="radiogroup" aria-label={question.text}>
              {question.options.map((option) => (
                <label key={option.id} className={styles.intentOption}>
                  <input
                    type="radio"
                    name={`intent-${intent.id}-${question.id}`}
                    value={option.id}
                    checked={answers[question.id]?.selectedOptionId === option.id}
                    disabled={busy}
                    onChange={() => setAnswers((current) => ({
                      ...current,
                      [question.id]: { answer: option.label, selectedOptionId: option.id },
                    }))}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          ) : (
            <label className={styles.sectionHelp}>
              {ts('intent.answer')}
              <input
                value={answers[question.id]?.answer ?? ''}
                disabled={busy}
                onChange={(event) => setAnswers((current) => ({
                  ...current,
                  [question.id]: { answer: event.target.value },
                }))}
              />
            </label>
          )}
          {question.recommendation ? <p className={styles.sectionHelp}>{ts('intent.recommendation', { value: question.recommendation })}</p> : null}
        </section>
      ))}
      <div className={styles.actions}>
        <Button disabled={busy || missingAnswers} onClick={() => onApprove(approvalAnswers())}>
          {busy ? ts('intent.approving') : ts('intent.approve')}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onRevise}>{ts('intent.revise')}</Button>
      </div>
    </div>
  )
}
