import { describe, expect, it } from 'vitest'

import {
  normalizedProjectDescriptionDraft,
  reconcileProjectDescriptionDraft,
} from './projectDescriptionDraft'

describe('project description draft reconciliation', () => {
  it('preserves dirty edits across source identity changes', () => {
    expect(reconcileProjectDescriptionDraft({
      draft: 'My in-progress edit',
      source: 'Analyzer description',
    }, 'New analyzer description')).toEqual({
      draft: 'My in-progress edit',
      source: 'New analyzer description',
    })
  })

  it('adopts clean source updates and trims save payloads', () => {
    expect(reconcileProjectDescriptionDraft({
      draft: 'Old description',
      source: 'Old description',
    }, 'New description').draft).toBe('New description')
    expect(normalizedProjectDescriptionDraft('  Saved description  \n')).toBe('Saved description')
  })
})
