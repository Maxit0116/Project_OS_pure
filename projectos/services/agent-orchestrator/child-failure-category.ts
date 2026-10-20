import type { AgentRunEvent } from '../../contracts/events.js'
import { ProjectOSError } from '../../errors.js'
import { classifyRunOutcome } from '../harness/run-outcome.js'

const SAFE_FAILURE_CATEGORY = /^[a-z][a-z0-9_]{0,63}$/u

/**
 * Child-run audit category (O-1). Verification and policy come from the
 * child run's events. Empty retrieval is a separate layer from a model error.
 */
export function childRunFailureCategory(
  error: unknown,
  events?: readonly AgentRunEvent[],
): string {
  const fromEvents = categoryFromChildEvents(events)
  if (fromEvents) return fromEvents
  if (error instanceof ProjectOSError) {
    if (error.code === 'tool_policy_denied' || error.code === 'verification_approval_required') {
      return 'policy_denied'
    }
    const detailed = error.details?.['failureCategory'] ??
      error.details?.['lastFailureCategory']
    if (typeof detailed === 'string' && SAFE_FAILURE_CATEGORY.test(detailed)) {
      return detailed
    }
    return error.code
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'category' in error &&
    typeof (error as { category?: unknown }).category === 'string' &&
    SAFE_FAILURE_CATEGORY.test((error as { category: string }).category)
  ) {
    return (error as { category: string }).category
  }
  return 'unexpected_error'
}

function categoryFromChildEvents(
  events: readonly AgentRunEvent[] | undefined,
): 'verification_failed' | 'policy_denied' | 'retrieval_empty' | undefined {
  if (!events || events.length === 0) return undefined
  const outcome = classifyRunOutcome(events)
  if (outcome === 'verification_failed') return 'verification_failed'
  if (outcome === 'policy_denied') return 'policy_denied'
  if (retrievalWasEmpty(events)) return 'retrieval_empty'
  return undefined
}

function retrievalWasEmpty(events: readonly AgentRunEvent[]): boolean {
  return events.some((event) => {
    if (!('payload' in event) || !event.payload || typeof event.payload !== 'object') return false
    const payload = event.payload as Record<string, unknown>
    if (payload.failureCategory === 'retrieval_empty') return true
    if (payload.searched === true && payload.hitCount === 0) return true
    const retrieval = payload.retrieval
    if (!retrieval || typeof retrieval !== 'object' || Array.isArray(retrieval)) return false
    const record = retrieval as { searched?: unknown; hitCount?: unknown }
    return record.searched === true && record.hitCount === 0
  })
}
