import type { ClarifyingQuestion, ImplementationPlan } from '@contracts/index'

export const PLAN_CUSTOM_OPTION_ID = '__custom__'

export type PlanQuestionDraft =
  | { kind: 'option'; optionId: string }
  | { kind: 'custom'; text: string }
  | null

export function createInitialQuestionDrafts(
  questions: ClarifyingQuestion[] | undefined,
): Record<string, PlanQuestionDraft> {
  return Object.fromEntries(
    (questions ?? []).map((question) => {
      if (question.selectedOptionId === PLAN_CUSTOM_OPTION_ID && question.answer?.trim()) {
        return [question.id, { kind: 'custom', text: question.answer }]
      }
      if (question.selectedOptionId && question.options?.some((option) => option.id === question.selectedOptionId)) {
        return [question.id, { kind: 'option', optionId: question.selectedOptionId }]
      }
      if (question.answer?.trim()) {
        return [question.id, { kind: 'custom', text: question.answer }]
      }
      return [question.id, null]
    }),
  )
}

export function ensureQuestionOptions(question: ClarifyingQuestion): ClarifyingQuestion {
  if (question.options && question.options.length >= 2) {
    return question
  }
  return {
    ...question,
    options: [
      {
        id: `${question.id}_recommended`,
        label: 'Use the recommended approach for this codebase',
        description: 'Follow existing patterns in the selected scope.',
      },
      {
        id: `${question.id}_minimal`,
        label: 'Keep the change as small as possible',
        description: 'Prefer the smallest viable implementation.',
      },
      {
        id: `${question.id}_comprehensive`,
        label: 'Use a more comprehensive solution',
        description: 'Allow broader changes if they improve maintainability.',
      },
    ],
  }
}

export function withPlanQuestionOptions(
  plan: ImplementationPlan,
): ImplementationPlan {
  if (!plan.clarifyingQuestions?.length) return plan
  return {
    ...plan,
    clarifyingQuestions: plan.clarifyingQuestions.map(ensureQuestionOptions),
  }
}

export function resolvePlanQuestionAnswer(
  question: ClarifyingQuestion,
  draft: PlanQuestionDraft,
): { answer: string; selectedOptionId?: string } | null {
  const resolvedQuestion = ensureQuestionOptions(question)
  if (!draft) return null
  if (draft.kind === 'custom') {
    const answer = draft.text.trim()
    if (!answer) return null
    return { answer, selectedOptionId: PLAN_CUSTOM_OPTION_ID }
  }
  const option = resolvedQuestion.options?.find((item) => item.id === draft.optionId)
  if (!option) return null
  return {
    answer: option.description ? `${option.label} — ${option.description}` : option.label,
    selectedOptionId: option.id,
  }
}

export function isPlanQuestionDraftComplete(
  question: ClarifyingQuestion,
  draft: PlanQuestionDraft,
): boolean {
  return resolvePlanQuestionAnswer(question, draft) !== null
}
