import { describe, expect, it } from 'vitest'

import {
  delegatedParentBatchAllowsApply,
  hasAuthorizingParentBatchValid,
  shouldUnlockApplyOnParentBatchValid,
} from './parentBatchApplyAuthorization'

const validFor = (runId: string) => ({
  runId,
  type: 'batch_validation_result',
  payload: { verdict: 'valid' as const },
})

describe('parentBatchApplyAuthorization', () => {
  it('accepts a valid parent batch for the active run', () => {
    expect(
      hasAuthorizingParentBatchValid({
        activeRunId: 'run_parent',
        flowActions: [validFor('run_parent')],
      }),
    ).toBe(true)
    expect(
      delegatedParentBatchAllowsApply({
        activeRunId: 'run_parent',
        hasDelegatedChildren: true,
        flowActions: [validFor('run_parent')],
        revokedApplyRunIds: [],
        flowStatus: 'awaiting_review',
      }).allowed,
    ).toBe(true)
  })

  it('rejects cross-run residual valid from a previous parent', () => {
    expect(
      hasAuthorizingParentBatchValid({
        activeRunId: 'run_new',
        flowActions: [validFor('run_old')],
      }),
    ).toBe(false)
    expect(
      delegatedParentBatchAllowsApply({
        activeRunId: 'run_new',
        hasDelegatedChildren: true,
        flowActions: [validFor('run_old')],
        revokedApplyRunIds: [],
        flowStatus: 'awaiting_review',
      }),
    ).toEqual({ allowed: false, reason: 'needs_parent_batch' })
  })

  it('rejects after cancel/revoke even when a late valid exists for the same run', () => {
    expect(
      delegatedParentBatchAllowsApply({
        activeRunId: 'run_parent',
        hasDelegatedChildren: true,
        flowActions: [validFor('run_parent')],
        revokedApplyRunIds: ['run_parent'],
        flowStatus: 'awaiting_review',
      }),
    ).toEqual({ allowed: false, reason: 'revoked' })
    expect(
      shouldUnlockApplyOnParentBatchValid({
        runId: 'run_parent',
        revokedApplyRunIds: ['run_parent'],
        flowStatus: 'error',
      }),
    ).toBe(false)
  })

  it('rejects when flowStatus is error (cancel/interrupt) without sticky id yet', () => {
    expect(
      delegatedParentBatchAllowsApply({
        activeRunId: 'run_parent',
        hasDelegatedChildren: true,
        flowActions: [validFor('run_parent')],
        revokedApplyRunIds: [],
        flowStatus: 'error',
      }),
    ).toEqual({ allowed: false, reason: 'revoked' })
  })

  it('allows non-delegated flows without a parent batch', () => {
    expect(
      delegatedParentBatchAllowsApply({
        activeRunId: 'run_leaf',
        hasDelegatedChildren: false,
        flowActions: [],
        revokedApplyRunIds: [],
        flowStatus: 'awaiting_review',
      }).allowed,
    ).toBe(true)
  })
})
