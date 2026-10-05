import { describe, expect, it } from 'vitest'

import { ClarifyingQuestionSchema } from '@contracts/index'
import {
  createInitialQuestionDrafts,
  ensureQuestionOptions,
  isPlanQuestionDraftComplete,
  PLAN_CUSTOM_OPTION_ID,
  resolvePlanQuestionAnswer,
} from './planClarification'

describe('planClarification helpers', () => {
  const question = ClarifyingQuestionSchema.parse({
    id: 'q_1',
    question: 'How should unread badges behave?',
    options: [
      { id: 'opt_a', label: 'Clear on open', description: 'Reset when panel opens' },
      { id: 'opt_b', label: 'Persist until action' },
    ],
  })

  it('ensures fallback options for display', () => {
    const ensured = ensureQuestionOptions({
      id: 'q_1',
      question: 'Which approach?',
    })
    expect(ensured.options?.length).toBeGreaterThanOrEqual(2)
  })

  it('resolves a selected option into an answer', () => {
    const resolved = resolvePlanQuestionAnswer(question, { kind: 'option', optionId: 'opt_a' })
    expect(resolved?.selectedOptionId).toBe('opt_a')
    expect(resolved?.answer).toContain('Clear on open')
  })

  it('resolves a custom answer', () => {
    const resolved = resolvePlanQuestionAnswer(question, {
      kind: 'custom',
      text: 'Only clear after explicit dismiss',
    })
    expect(resolved?.selectedOptionId).toBe(PLAN_CUSTOM_OPTION_ID)
    expect(resolved?.answer).toBe('Only clear after explicit dismiss')
  })

  it('requires custom text when custom is selected', () => {
    expect(isPlanQuestionDraftComplete(question, { kind: 'custom', text: '' })).toBe(false)
    expect(
      isPlanQuestionDraftComplete(question, { kind: 'custom', text: 'My preference' }),
    ).toBe(true)
  })

  it('restores drafts from persisted answers', () => {
    const drafts = createInitialQuestionDrafts([
      {
        ...question,
        answer: 'Clear on open — Reset when panel opens',
        selectedOptionId: 'opt_a',
      },
    ])
    expect(drafts.q_1).toEqual({ kind: 'option', optionId: 'opt_a' })
  })
})
