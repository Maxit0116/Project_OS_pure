import { useMemo, useState } from 'react'
import type {
  FirstPrinciplesAnswerKind,
  FirstPrinciplesQuestion,
  FirstPrinciplesSession,
} from '@contracts/index'
import { FIRST_PRINCIPLES_LAYER_ORDER } from '@contracts/index'
import { useI18n } from '../../../i18n'
import Button from '../../ui/Button'
import PlanClarificationQuestionItem from '../PlanClarificationQuestionItem'
import type { PlanQuestionDraft } from '../planClarification'
import refinementStyles from '../PromptRefinementCard.module.css'
import styles from './FirstPrinciples.module.css'

interface Props {
  session: FirstPrinciplesSession
  submitting?: boolean
  onAnswer: (input: {
    questionId: string
    kind: FirstPrinciplesAnswerKind
    selectedOptionId?: string
    text?: string
  }) => void
}

export default function FirstPrinciplesLayerCard({
  session,
  submitting = false,
  onAnswer,
}: Props) {
  const { ts } = useI18n()
  const question = session.activeQuestion
  const [draft, setDraft] = useState<PlanQuestionDraft>(null)

  const layerIndex = useMemo(
    () => FIRST_PRINCIPLES_LAYER_ORDER.indexOf(session.currentLayerId) + 1,
    [session.currentLayerId],
  )

  if (!question || session.status !== 'layer_active') return null

  const clarificationQuestion: FirstPrinciplesQuestion = question
  const canSubmit =
    draft?.kind === 'option' ||
    (draft?.kind === 'custom' && draft.text.trim().length > 0)

  return (
    <div
      className={refinementStyles.card}
      data-testid="first-principles-layer-card"
      style={{ ['--mode-color' as string]: 'var(--color-mode-ask, var(--tech-accent))' }}
    >
      <div className={refinementStyles.header}>
        <span className={refinementStyles.title}>{ts('firstPrinciples.layerTitle')}</span>
        <span className={refinementStyles.badge}>
          {ts('firstPrinciples.progress', {
            current: layerIndex,
            layer: session.currentLayerId,
          })}
        </span>
      </div>

      <div className={styles.progress}>
        <span>{ts('firstPrinciples.progressHint')}</span>
        <div className={styles.layerDots} aria-hidden>
          {FIRST_PRINCIPLES_LAYER_ORDER.map((id) => {
            const layer = session.layers.find((item) => item.id === id)
            const done = layer?.status === 'complete' || layer?.status === 'skipped'
            const active = id === session.currentLayerId
            return (
              <span
                key={id}
                className={`${styles.dot} ${done ? styles.dotDone : ''} ${active ? styles.dotActive : ''}`}
              />
            )
          })}
        </div>
      </div>

      {question.reflect ? <p className={styles.reflect}>{question.reflect}</p> : null}

      <PlanClarificationQuestionItem
        question={clarificationQuestion}
        index={0}
        draft={draft}
        disabled={submitting}
        onChange={setDraft}
      />

      <div className={styles.metaRow}>
        {(question.metaOptions ?? ['unsure', 'skip_layer', 'wrong_question']).map((meta) => (
          <button
            key={meta}
            type="button"
            className={styles.metaButton}
            disabled={submitting}
            onClick={() =>
              onAnswer({
                questionId: question.id,
                kind: meta,
                text: meta === 'unsure' ? ts('firstPrinciples.meta.unsure') : undefined,
              })
            }
          >
            {ts(`firstPrinciples.meta.${meta}` as 'firstPrinciples.meta.unsure')}
          </button>
        ))}
      </div>

      <div className={refinementStyles.actions}>
        <Button
          variant="mode"
          disabled={!canSubmit || submitting}
          onClick={() => {
            if (!draft) return
            if (draft.kind === 'option') {
              onAnswer({
                questionId: question.id,
                kind: 'option',
                selectedOptionId: draft.optionId,
              })
              return
            }
            onAnswer({
              questionId: question.id,
              kind: 'custom',
              text: draft.text.trim(),
            })
          }}
        >
          {ts('firstPrinciples.submitAnswer')}
        </Button>
      </div>
    </div>
  )
}
