import type {
  AlignmentContract,
  AlignmentItem,
  AlignmentQuestion,
  ConfirmAlignmentAnswer,
  ConfirmAlignmentItemPatch,
  PromptRefinement,
} from '@contracts/index'
import {
  createInitialQuestionDrafts,
  isPlanQuestionDraftComplete,
  resolvePlanQuestionAnswer,
  type PlanQuestionDraft,
} from './planClarification'

export type AlignmentItemDraft = {
  selected: boolean
  comment: string
  commentOpen: boolean
}

export type AlignmentDraftState = {
  items: Record<string, AlignmentItemDraft>
  questions: Record<string, PlanQuestionDraft>
}

export function ensureRefinementAlignment(refinement: PromptRefinement): AlignmentContract {
  if (refinement.alignment) return refinement.alignment
  // Client-side fallback if an older payload arrives without alignment.
  return {
    version: '0.1.0',
    id: `align_${refinement.id}`,
    items: [
      {
        id: `${refinement.id}_stated_1`,
        kind: 'stated',
        text: refinement.understood.trim() || 'Implement the user request',
        selected: true,
      },
      ...refinement.ambiguities.filter(Boolean).map((text, index) => ({
        id: `${refinement.id}_guess_${index + 1}`,
        kind: 'guess' as const,
        text,
        selected: false,
      })),
    ],
    questions: [],
    confidence: refinement.confidence,
    status: 'awaiting_user',
  }
}

export function createAlignmentDraft(contract: AlignmentContract): AlignmentDraftState {
  return {
    items: Object.fromEntries(
      contract.items.map((item) => [
        item.id,
        {
          selected: item.selected,
          comment: item.comment ?? '',
          commentOpen: Boolean(item.comment?.trim()),
        },
      ]),
    ),
    questions: createInitialQuestionDrafts(contract.questions as AlignmentQuestion[]),
  }
}

export function statedItems(contract: AlignmentContract): AlignmentItem[] {
  return contract.items.filter((item) => item.kind === 'stated' || item.kind === 'constraint')
}

export function guessItems(contract: AlignmentContract): AlignmentItem[] {
  return contract.items.filter((item) => item.kind === 'guess' || item.kind === 'out_of_scope')
}

export function buildConfirmAlignmentPayload(
  refinement: PromptRefinement,
  contract: AlignmentContract,
  draft: AlignmentDraftState,
): {
  request: {
    refinementId: string
    contractId: string
    items: ConfirmAlignmentItemPatch[]
    answers: ConfirmAlignmentAnswer[]
  }
  ready: boolean
  reason?: string
} {
  const items: ConfirmAlignmentItemPatch[] = contract.items.map((item) => {
    const itemDraft = draft.items[item.id]
    return {
      id: item.id,
      selected: itemDraft?.selected ?? item.selected,
      ...(itemDraft?.comment.trim() ? { comment: itemDraft.comment.trim() } : {}),
    }
  })

  const answers: ConfirmAlignmentAnswer[] = []
  for (const question of contract.questions) {
    const questionDraft = draft.questions[question.id] ?? null
    if (question.blocking === false && !isPlanQuestionDraftComplete(question, questionDraft)) {
      continue
    }
    const resolved = resolvePlanQuestionAnswer(question, questionDraft)
    if (!resolved) {
      if (question.blocking !== false) {
        return {
          request: {
            refinementId: refinement.id,
            contractId: contract.id,
            items,
            answers,
          },
          ready: false,
          reason: 'blocking',
        }
      }
      continue
    }
    answers.push({
      questionId: question.id,
      answer: resolved.answer,
      ...(resolved.selectedOptionId
        ? { selectedOptionId: resolved.selectedOptionId }
        : {}),
    })
  }

  if (!items.some((item) => item.selected)) {
    return {
      request: {
        refinementId: refinement.id,
        contractId: contract.id,
        items,
        answers,
      },
      ready: false,
      reason: 'none_selected',
    }
  }

  return {
    request: {
      refinementId: refinement.id,
      contractId: contract.id,
      items,
      answers,
    },
    ready: true,
  }
}
