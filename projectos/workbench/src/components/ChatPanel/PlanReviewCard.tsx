import { useEffect, useMemo, useState } from 'react'
import type {
  ClarifyingQuestion,
  ImplementationPlan,
  ImplementationPlanStep,
  ImplementationPlanTodo,
} from '@contracts/index'
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
  savingEdits?: boolean
  onBuild: () => void
  onRevise: () => void
  onSaveEdits: (patch: {
    objective: string
    steps: ImplementationPlanStep[]
    todos: ImplementationPlanTodo[]
    rationale: string
  }) => void
  onSaveToWorkspace?: () => void
  onLoadFromWorkspace?: () => void
  workspacePlans?: Array<{ id: string; objective: string; updatedAt?: string }>
  onBrowseWorkspacePlans?: () => void
  onSelectWorkspacePlan?: (planId: string) => void
  onSubmitClarification: (
    answers: Array<{ questionId: string; answer: string; selectedOptionId?: string }>,
  ) => void
}

export default function PlanReviewCard({
  plan,
  confirmed,
  submittingClarification,
  savingEdits = false,
  onBuild,
  onRevise,
  onSaveEdits,
  onSaveToWorkspace,
  onLoadFromWorkspace,
  workspacePlans,
  onBrowseWorkspacePlans,
  onSelectWorkspacePlan,
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
  const [editing, setEditing] = useState(false)
  const [objective, setObjective] = useState(displayPlan.objective)
  const [rationale, setRationale] = useState(displayPlan.rationale)
  const [stepTexts, setStepTexts] = useState(() =>
    displayPlan.steps.map((step) => step.description),
  )
  const [todoTexts, setTodoTexts] = useState(() =>
    displayPlan.todos.map((todo) => todo.content),
  )

  useEffect(() => {
    setDrafts(createInitialQuestionDrafts(displayPlan.clarifyingQuestions))
  }, [displayPlan.id, displayPlan.clarifyingQuestions])

  useEffect(() => {
    if (editing) return
    setObjective(displayPlan.objective)
    setRationale(displayPlan.rationale)
    setStepTexts(displayPlan.steps.map((step) => step.description))
    setTodoTexts(displayPlan.todos.map((todo) => todo.content))
  }, [displayPlan, editing])

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

  const canBuild =
    displayPlan.status === 'ready' &&
    displayPlan.steps.length > 0 &&
    displayPlan.steps.every((step) => step.description.trim().length > 0) &&
    !editing

  const handleSaveEdits = () => {
    const trimmedObjective = objective.trim()
    const trimmedRationale = rationale.trim()
    if (!trimmedObjective || !trimmedRationale) return
    const steps = displayPlan.steps.map((step, index) => ({
      ...step,
      description: (stepTexts[index] ?? step.description).trim() || step.description,
    }))
    if (steps.length === 0 || steps.some((step) => !step.description.trim())) return
    const todos = displayPlan.todos.map((todo, index) => ({
      ...todo,
      content: (todoTexts[index] ?? todo.content).trim() || todo.content,
    }))
    onSaveEdits({
      objective: trimmedObjective,
      steps,
      todos,
      rationale: trimmedRationale,
    })
    setEditing(false)
  }

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
            {editing ? (
              <textarea
                className={styles.editArea}
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                rows={2}
              />
            ) : (
              <p>{displayPlan.objective}</p>
            )}
          </section>

          {(editing || displayPlan.steps.length > 0) && (
            <section className={styles.section}>
              <h4>{ts('plan.steps')}</h4>
              <ol>
                {displayPlan.steps.map((step, index) => (
                  <li key={step.id}>
                    {editing ? (
                      <textarea
                        className={styles.editArea}
                        value={stepTexts[index] ?? ''}
                        onChange={(event) => {
                          const next = [...stepTexts]
                          next[index] = event.target.value
                          setStepTexts(next)
                        }}
                        rows={2}
                      />
                    ) : (
                      <strong>{step.description}</strong>
                    )}
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

          {(editing || displayPlan.todos.length > 0) && (
            <section className={styles.section}>
              <h4>{ts('plan.todos')}</h4>
              <ul>
                {displayPlan.todos.map((todo, index) => (
                  <li key={todo.id}>
                    {editing ? (
                      <input
                        className={styles.editInput}
                        value={todoTexts[index] ?? ''}
                        onChange={(event) => {
                          const next = [...todoTexts]
                          next[index] = event.target.value
                          setTodoTexts(next)
                        }}
                      />
                    ) : (
                      todo.content
                    )}
                  </li>
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
            {editing ? (
              <textarea
                className={styles.editArea}
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                rows={3}
              />
            ) : (
              <p>{displayPlan.rationale}</p>
            )}
          </section>

          {!confirmed && displayPlan.status === 'ready' && (
            <div className={styles.actions}>
              {editing ? (
                <>
                  <Button onClick={handleSaveEdits} disabled={savingEdits}>
                    {ts('plan.saveEdits')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setEditing(false)}
                    disabled={savingEdits}
                  >
                    {ts('common.cancel')}
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={onBuild} disabled={!canBuild}>
                    {ts('plan.build')}
                  </Button>
                  <Button variant="secondary" onClick={() => setEditing(true)}>
                    {ts('plan.editInPlace')}
                  </Button>
                  <Button variant="secondary" onClick={onRevise}>
                    {ts('plan.revise')}
                  </Button>
                  {onSaveToWorkspace ? (
                    <Button variant="ghost" onClick={onSaveToWorkspace}>
                      {ts('plan.saveToWorkspace')}
                    </Button>
                  ) : null}
                  {onBrowseWorkspacePlans ? (
                    <Button variant="ghost" onClick={onBrowseWorkspacePlans}>
                      {ts('plan.browseWorkspacePlans')}
                    </Button>
                  ) : onLoadFromWorkspace ? (
                    <Button variant="ghost" onClick={onLoadFromWorkspace}>
                      {ts('plan.loadFromWorkspace')}
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          )}
          {workspacePlans && workspacePlans.length > 0 && onSelectWorkspacePlan ? (
            <div className={styles.actions}>
              <label className={styles.section}>
                <span>{ts('plan.selectWorkspacePlan')}</span>
                <select
                  className={styles.editArea}
                  defaultValue=""
                  onChange={(event) => {
                    const value = event.target.value
                    if (value) onSelectWorkspacePlan(value)
                  }}
                >
                  <option value="" disabled>
                    {ts('plan.selectWorkspacePlanPlaceholder')}
                  </option>
                  {workspacePlans.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.objective}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
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
