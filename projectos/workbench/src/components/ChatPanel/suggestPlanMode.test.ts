import { describe, expect, it } from 'vitest'
import { shouldSuggestPlanMode } from './suggestPlanMode'

describe('shouldSuggestPlanMode', () => {
  it('does not suggest when already in plan mode', () => {
    expect(
      shouldSuggestPlanMode('Implement a multi-file architecture refactor across modules', 'plan'),
    ).toBe(false)
  })

  it('suggests for long multi-step / architecture prompts', () => {
    expect(
      shouldSuggestPlanMode(
        'Please design and implement a multi-file refactor for the auth module architecture.',
        'change',
      ),
    ).toBe(true)
  })

  it('ignores short prompts', () => {
    expect(shouldSuggestPlanMode('fix login', 'ask')).toBe(false)
  })
})
