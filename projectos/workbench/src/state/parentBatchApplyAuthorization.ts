/**
 * Delegated Apply authorization — parent batch must authorize the *active* run.
 * Cross-run residual `valid` events and post-cancel / revoked runs must not unlock Apply.
 */

export type ParentBatchAuthEvent = {
  runId: string
  type: string
  // AgentActionEvent payloads vary; only `verdict` is read for batch auth.
  payload?: { verdict?: unknown } | Record<string, unknown> | null
}

export type ParentBatchAuthStatus =
  | 'idle'
  | 'running'
  | 'complete'
  | 'awaiting_review'
  | 'error'
  | 'cancelled'
  | 'interrupted'

export function hasAuthorizingParentBatchValid(input: {
  activeRunId: string
  flowActions: readonly ParentBatchAuthEvent[]
}): boolean {
  return input.flowActions.some(
    (event) =>
      event.runId === input.activeRunId &&
      event.type === 'batch_validation_result' &&
      event.payload?.verdict === 'valid',
  )
}

export function isApplyAuthorizationRevoked(input: {
  activeRunId: string
  revokedApplyRunIds: readonly string[] | undefined
  flowStatus: ParentBatchAuthStatus
}): boolean {
  if (input.revokedApplyRunIds?.includes(input.activeRunId)) return true
  // Cancel / interrupt / Stop: Apply must stay closed for that run.
  if (input.flowStatus === 'error' || input.flowStatus === 'cancelled' || input.flowStatus === 'interrupted') return true
  return false
}

/**
 * Returns whether delegated Apply is authorized for the active parent run.
 * Non-delegated flows are always allowed by this gate (other gates still apply).
 */
export function delegatedParentBatchAllowsApply(input: {
  activeRunId: string
  hasDelegatedChildren: boolean
  flowActions: readonly ParentBatchAuthEvent[]
  revokedApplyRunIds: readonly string[] | undefined
  flowStatus: ParentBatchAuthStatus
}): { allowed: boolean; reason: 'ok' | 'needs_parent_batch' | 'revoked' } {
  if (!input.hasDelegatedChildren) return { allowed: true, reason: 'ok' }
  if (
    isApplyAuthorizationRevoked({
      activeRunId: input.activeRunId,
      revokedApplyRunIds: input.revokedApplyRunIds,
      flowStatus: input.flowStatus,
    })
  ) {
    return { allowed: false, reason: 'revoked' }
  }
  if (
    !hasAuthorizingParentBatchValid({
      activeRunId: input.activeRunId,
      flowActions: input.flowActions,
    })
  ) {
    return { allowed: false, reason: 'needs_parent_batch' }
  }
  return { allowed: true, reason: 'ok' }
}

/** Late valid after cancel must not clear review-only / unlock Apply. */
export function shouldUnlockApplyOnParentBatchValid(input: {
  runId: string
  revokedApplyRunIds: readonly string[] | undefined
  flowStatus: ParentBatchAuthStatus
}): boolean {
  if (input.revokedApplyRunIds?.includes(input.runId)) return false
  if (input.flowStatus === 'error' || input.flowStatus === 'cancelled' || input.flowStatus === 'interrupted') return false
  return true
}
