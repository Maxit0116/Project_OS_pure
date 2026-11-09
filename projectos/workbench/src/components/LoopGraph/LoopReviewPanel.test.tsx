import { describe, expect, it } from 'vitest'
import { reviewApproveEnabled } from './LoopReviewPanel'
import type { LoopCompileResult } from '@contracts/index'

function compileFixture(overrides?: Partial<LoopCompileResult>): LoopCompileResult {
  return {
    specDraft: {
      version: 'spec_1',
      graphRevision: 2,
      goal: 'Ship login',
      nodes: [
        {
          id: 'n1',
          role: 'implement',
          type: 'agent',
          agentRole: 'coder',
          goal: 'Implement login',
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [],
      acceptance: [],
      retryPolicy: { onFailure: 'retry', maxAutoRetries: 1 },
      stopPolicy: { maxRounds: 5 },
      permissions: [],
      openQuestions: [],
      createdAt: new Date().toISOString(),
    },
    assumptions: [{ id: 'a1', text: 'Inferred role' }],
    cycleGates: [],
    ...overrides,
  }
}

describe('reviewApproveEnabled', () => {
  it('blocks approve when gates are unchecked or compile is stale', () => {
    const compileResult = compileFixture()
    expect(
      reviewApproveEnabled({
        compileResult,
        draftRevision: 2,
        acceptedAssumptions: {},
        confirmedCycles: {},
      }),
    ).toBe(false)

    expect(
      reviewApproveEnabled({
        compileResult,
        draftRevision: 2,
        acceptedAssumptions: { a1: true },
        confirmedCycles: {},
      }),
    ).toBe(true)

    expect(
      reviewApproveEnabled({
        compileResult,
        draftRevision: 3,
        acceptedAssumptions: { a1: true },
        confirmedCycles: {},
      }),
    ).toBe(false)
  })
})
