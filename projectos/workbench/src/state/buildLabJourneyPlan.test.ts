import { describe, expect, it } from 'vitest'
import type { LabSession } from '@contracts/index'
import { buildLabJourneyPlan } from './buildLabJourneyPlan'

function session(partial: Partial<LabSession> = {}): LabSession {
  return {
    id: 'lab_1',
    projectId: 'p1',
    status: 'experiencing',
    cardPhase: 'experiencing',
    scopeNodeIds: [],
    previewUrl: 'http://localhost:5173/',
    browserTabId: null,
    capture: {
      consoleErrors: true,
      unhandledRejections: true,
      failedNetwork: true,
      manualNotes: true,
    },
    journeyId: null,
    findingIds: [],
    debugListFindingIds: null,
    capabilityNeeds: [],
    capabilityProposals: [],
    chatSessionId: null,
    activeFixRunId: null,
    startError: null,
    createdAt: '2026-11-05T00:00:00.000Z',
    updatedAt: '2026-11-05T00:00:00.000Z',
    endedAt: null,
    ...partial,
  }
}

describe('buildLabJourneyPlan', () => {
  it('falls back to generic smoke steps', () => {
    const plan = buildLabJourneyPlan({
      session: session(),
      graph: null,
      mapContent: null,
    })
    expect(plan.source).toBe('generic')
    expect(plan.steps.length).toBeGreaterThan(0)
  })

  it('uses acceptance criteria when present', () => {
    const plan = buildLabJourneyPlan({
      session: session({ scopeNodeIds: ['n1'] }),
      graph: null,
      mapContent: {
        version: '1',
        artifacts: [
          {
            id: 'a1',
            type: 'acceptance_list',
            scope: 'node',
            nodeId: 'n1',
            createdAt: '2026-11-05T00:00:00.000Z',
            updatedAt: '2026-11-05T00:00:00.000Z',
            size: { width: 300, height: 220 },
            acceptance: {
              items: [{ id: 'c1', text: 'User can sign up', done: false }],
            },
          },
        ],
        stacks: [],
        workGroups: [],
      } as never,
    })
    expect(plan.source).toBe('acceptance')
    expect(plan.steps[0]?.label).toContain('sign up')
  })
})
