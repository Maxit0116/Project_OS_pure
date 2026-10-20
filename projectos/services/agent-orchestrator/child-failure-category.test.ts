import { describe, expect, it } from 'vitest'

import type { AgentRunEvent } from '../../contracts/events.js'
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

  it('reads verification, policy, and empty retrieval from the child run events', () => {
    const error = new ProjectOSError('agent_orchestration_failed', 'child failed')
    expect(childRunFailureCategory(error, [
      event('verification_completed', { status: 'failed', reason: 'command_failed' }),
      event('model_request', {
        stage: 'edit',
        requestId: 'req_child',
        requestKind: 'change_generation',
        provider: 'test',
        model: 'test-model',
        durationMs: 1,
        status: 'failed',
        backend: 'model',
        usage: 'missing',
        tokenUsage: { input: 0, output: 0 },
      }),
    ])).toBe('verification_failed')
    expect(childRunFailureCategory(error, [
      event('verification_result', { status: 'not_run', reason: 'policy_denied' }),
      event('verification_completed', { status: 'not_run' }),
    ])).toBe('policy_denied')
    expect(childRunFailureCategory(error, [
      event('step_failed', { retrieval: { searched: true, hitCount: 0 } }),
    ])).toBe('retrieval_empty')
    expect(childRunFailureCategory(new ProjectOSError(
      'tool_policy_denied',
      'shell denied',
    ))).toBe('policy_denied')
  })
})

function event(type: AgentRunEvent['type'], payload: Record<string, unknown>): AgentRunEvent {
  return {
    eventId: `evt_${type}`,
    runId: 'child-1',
    timestamp: '2026-10-20T00:00:00.000Z',
    type,
    payload,
  } as AgentRunEvent
}
