import { describe, expect, it } from 'vitest'

import { ProjectOSError } from '../../errors.js'
import { childRunFailureCategory } from './child-failure-category.js'

describe('delegated child failure audit category', () => {
  it('preserves a specific safe category and falls back to the typed error code', () => {
    expect(childRunFailureCategory(new ProjectOSError(
      'agent_orchestration_failed',
      'model output failed',
      { details: { failureCategory: 'search_ambiguous' } },
    ))).toBe('search_ambiguous')
    expect(childRunFailureCategory(new ProjectOSError(
      'proposal_validation_failed',
      'proposal failed',
    ))).toBe('proposal_validation_failed')
    expect(childRunFailureCategory(new Error('unknown'))).toBe('unexpected_error')
  })
})
