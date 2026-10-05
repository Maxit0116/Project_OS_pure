import type { ClarifyingQuestion } from '@contracts/index'
import { useI18n } from '../../i18n'
import { ensureQuestionOptions, type PlanQuestionDraft } from './planClarification'
import styles from './PromptRefinementCard.module.css'

interface Props {
  question: ClarifyingQuestion
  index: number
  draft: PlanQuestionDraft
  disabled: boolean
  onChange: (draft: PlanQuestionDraft) => void
}

export default function PlanClarificationQuestionItem({
  question,
  index,
  draft,
  disabled,
  onChange,
}: Props) {
  const { ts } = useI18n()
  const resolvedQuestion = ensureQuestionOptions(question)
  const options = resolvedQuestion.options ?? []
  const customSelected = draft?.kind === 'custom'
  const selectedOptionId = draft?.kind === 'option' ? draft.optionId : null

  return (
    <fieldset className={styles.questionItem} disabled={disabled}>
      <legend className={styles.questionLabel}>
        {ts('plan.questionNumber', { number: index + 1 })}
        {' '}
        {question.question}
      </legend>

      <div
        className={styles.optionList}
        role="radiogroup"
        aria-label={question.question}
      >
        {options.map((option) => {
          const active = selectedOptionId === option.id
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`${styles.optionCard} ${active ? styles.optionCardActive : ''}`}
              onClick={() => onChange({ kind: 'option', optionId: option.id })}
            >
              <span className={styles.optionLabel}>{option.label}</span>
              {option.description ? (
                <span className={styles.optionDescription}>{option.description}</span>
              ) : null}
            </button>
          )
        })}

        <button
          type="button"
          role="radio"
          aria-checked={customSelected}
          className={`${styles.optionCard} ${customSelected ? styles.optionCardActive : ''}`}
          onClick={() => onChange({ kind: 'custom', text: draft?.kind === 'custom' ? draft.text : '' })}
        >
          <span className={styles.optionLabel}>{ts('plan.customAnswer')}</span>
          <span className={styles.optionDescription}>{ts('plan.customAnswerHint')}</span>
        </button>
      </div>

      {customSelected ? (
        <textarea
          className={styles.questionInput}
          value={draft.text}
          onChange={(event) => onChange({ kind: 'custom', text: event.target.value })}
          placeholder={ts('plan.customAnswerPlaceholder')}
          rows={3}
          autoFocus
        />
      ) : null}
    </fieldset>
  )
}
