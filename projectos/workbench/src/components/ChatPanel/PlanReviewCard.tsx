import { useEffect, useMemo, useState } from 'react'
import type { ClarifyingQuestion, ImplementationPlan } from '@contracts/index'
import { useI18n } from '../../i18n'
import Button from '../ui/Button'
import PlanClarificationQuestionItem from './PlanClarificationQuestionItem'
import {
  createInitialQuestionDrafts,
  isPlanQuestionDraftComplete,
  resolvePlanQuestionAnswer,
  withPlanQuestionOptions,
  type PlanQuestionDraft,
} from './planClarification'
import styles from './PromptRefinementCard.module.css'

interface Props {
  plan: ImplementationPlan
  confirmed: boolean
  submittingClarification: boolean
  onBuild: () => void
  onRevise: () => void
  onSubmitClarification: (
    answers: Array<{ questionId: string; answer: string; selectedOptionId?: string }>,
  ) => void
}

export default function PlanReviewCard({
  plan,
  confirmed,
  submittingClarification,
  onBuild,
  onRevise,
  onSubmitClarification,
}: Props) {
  const { ts } = useI18n()
  const displayPlan = useMemo(
    () => withPlanQuestionOptions(plan),
    [plan],
  )
  const unansweredQuestions = useMemo(
    () => displayPlan.clarifyingQuestions?.filter((question) => !question.answer?.trim()) ?? [],
    [displayPlan.clarifyingQuestions],
  )
  const [drafts, setDrafts] = useState<Record<string, PlanQuestionDraft>>(() =>
    createInitialQuestionDrafts(displayPlan.clarifyingQuestions),
  )

  useEffect(() => {
    setDrafts(createInitialQuestionDrafts(displayPlan.clarifyingQuestions))
  }, [displayPlan.id, displayPlan.clarifyingQuestions])

  const updateDraft = (questionId: string, draft: PlanQuestionDraft) => {
    setDrafts((current) => ({ ...current, [questionId]: draft }))
  }

  const handleSubmitClarification = () => {
    const answers = unansweredQuestions
      .map((question) => {
        const resolved = resolvePlanQuestionAnswer(question, drafts[question.id] ?? null)
        if (!resolved) return null
        return {
          questionId: question.id,
          answer: resolved.answer,
          ...(resolved.selectedOptionId ? { selectedOptionId: resolved.selectedOptionId } : {}),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
    if (answers.length !== unansweredQuestions.length) return
    onSubmitClarification(answers)
  }

  const clarificationComplete = unansweredQuestions.every((question) =>
    isPlanQuestionDraftComplete(question, drafts[question.id] ?? null),
  )

  return (
    <div className={`${styles.card} fade-slide-up ${confirmed ? styles.confirmed : ''}`} data-tour="plan-review">
      <div className={styles.header}>
        <span className={styles.title}>{ts('plan.title')}</span>
        <span className={styles.badge}>{ts(`plan.status.${displayPlan.status}`)}</span>
      </div>
      <p className={styles.explanation}>
        {displayPlan.status === 'needs_clarification'
          ? ts('plan.clarificationPanelIntro')
          : ts('plan.explanation')}
      </p>

      {displayPlan.status === 'needs_clarification' && unansweredQuestions.length > 0 && (
        <section className={styles.section} data-plan-section="clarification">
          <h4>{ts('plan.clarificationTitle')}</h4>
          <p className={styles.sectionHelp}>{ts('plan.clarificationHelp')}</p>
          <div className={styles.questionList}>
            {unansweredQuestions.map((question, index) => (
              <PlanClarificationQuestionItem
                key={question.id}
                question={question}
                index={index}
                draft={drafts[question.id] ?? null}
                disabled={submittingClarification}
                onChange={(draft) => updateDraft(question.id, draft)}
              />
            ))}
          </div>
          <div className={styles.actions}>
            <Button
              onClick={handleSubmitClarification}
              disabled={!clarificationComplete || submittingClarification}
            >
              {ts('plan.submitClarification')}
            </Button>
            <Button variant="secondary" onClick={onRevise} disabled={submittingClarification}>
              {ts('plan.revise')}
            </Button>
          </div>
        </section>
      )}

      {displayPlan.status !== 'needs_clarification' && (
        <>
          <section className={styles.section}>
            <h4>{ts('plan.objective')}</h4>
            <p>{displayPlan.objective}</p>
          </section>

          {displayPlan.steps.length > 0 && (
            <section className={styles.section}>
              <h4>{ts('plan.steps')}</h4>
              <ol>
                {displayPlan.steps.map((step) => (
                  <li key={step.id}>
                    <strong>{step.description}</strong>
                    {step.affectedFiles.length > 0 && (
                      <div className={styles.chips}>
                        {step.affectedFiles.map((file) => (
                          <span key={file} className={styles.chip}>{file}</span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {displayPlan.todos.length > 0 && (
            <section className={styles.section}>
              <h4>{ts('plan.todos')}</h4>
              <ul>
                {displayPlan.todos.map((todo) => (
                  <li key={todo.id}>{todo.content}</li>
                ))}
              </ul>
            </section>
          )}

          {displayPlan.ambiguities.length > 0 && (
            <section className={styles.section}>
              <h4>{ts('plan.resolvedAmbiguities')}</h4>
              <ul>
                {displayPlan.ambiguities.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          <section className={styles.section}>
            <h4>{ts('plan.rationale')}</h4>
            <p>{displayPlan.rationale}</p>
          </section>

          {!confirmed && displayPlan.status === 'ready' && (
            <div className={styles.actions}>
              <Button onClick={onBuild}>{ts('plan.build')}</Button>
              <Button variant="secondary" onClick={onRevise}>{ts('plan.revise')}</Button>
            </div>
          )}
        </>
      )}

      {displayPlan.status === 'needs_clarification' && answeredQuestions(displayPlan.clarifyingQuestions).length > 0 && (
        <section className={styles.section}>
          <h4>{ts('plan.answeredQuestions')}</h4>
          <ul className={styles.answeredList}>
            {answeredQuestions(displayPlan.clarifyingQuestions).map((question) => (
              <li key={question.id}>
                <strong>{question.question}</strong>
                <p>{question.answer}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {confirmed && <div className={styles.confirmedLabel}>{ts('plan.building')}</div>}
    </div>
  )
}

function answeredQuestions(questions: ClarifyingQuestion[] | undefined): ClarifyingQuestion[] {
  return questions?.filter((question) => Boolean(question.answer?.trim())) ?? []
}
