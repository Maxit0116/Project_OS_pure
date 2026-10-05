import { describe, expect, it } from 'vitest'

import { moveWorkGroupSuggestionIndex } from './mapWorkGroupDialogKeyboard'

describe('work-group dialog suggestion keyboard navigation', () => {
  const candidates = [
    { disabled: false },
    { disabled: true },
    { disabled: false },
  ]

  it('moves with arrows, wraps, and skips disabled suggestions', () => {
    expect(moveWorkGroupSuggestionIndex(candidates, 0, 'next')).toBe(2)
    expect(moveWorkGroupSuggestionIndex(candidates, 2, 'next')).toBe(0)
    expect(moveWorkGroupSuggestionIndex(candidates, 0, 'previous')).toBe(2)
  })

  it('supports first and last navigation', () => {
    expect(moveWorkGroupSuggestionIndex(candidates, 2, 'first')).toBe(0)
    expect(moveWorkGroupSuggestionIndex(candidates, 0, 'last')).toBe(2)
  })
})
