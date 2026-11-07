import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { RunDecision } from '@contracts/index'
import PendingRunDecisions from './PendingRunDecisions'

const pending: RunDecision = {
  version: '0.1.0',
  id: 'decision_pending',
  projectId: 'project',
  rootRunId: 'run',
  runId: 'run',
  kind: 'scope_change',
  question: 'Approve the additional settings file?',
  options: [{ id: 'approve', label: 'Approve' }, { id: 'decline', label: 'Decline' }],
  recommendation: 'Approve because the preference is required.',
  status: 'pending',
  revision: 1,
  createdAt: '2026-10-27T00:00:00.000Z',
}

describe('PendingRunDecisions', () => {
  it('shows pending options and answered history from the same records', () => {
    const answered: RunDecision = {
      ...pending,
      id: 'decision_answered',
      status: 'resolved',
      revision: 2,
      answer: { optionId: 'approve', text: 'Use the existing preference.' },
      resolvedAt: '2026-10-27T00:01:00.000Z',
    }
    const html = renderToStaticMarkup(
      <PendingRunDecisions
        decisions={[pending, answered]}
        resolvingIds={[]}
        onResolve={vi.fn()}
      />,
    )
    expect(html).toContain('Approve the additional settings file?')
    expect(html).toContain('Approve')
    expect(html).toMatch(/<summary>[^<]*[（(]1[）)]<\/summary>/u)
    expect(html).toContain('Use the existing preference.')
  })

  it('marks a decision reached from a notification, including answered history', () => {
    const answered = { ...pending, status: 'resolved' as const, answer: { optionId: 'approve' } }
    const html = renderToStaticMarkup(
      <PendingRunDecisions
        decisions={[answered]}
        resolvingIds={[]}
        focusedDecisionId={answered.id}
        onResolve={vi.fn()}
      />,
    )
    expect(html).toContain('data-decision-id="decision_pending"')
    expect(html).toContain('data-focused="true"')
    expect(html).toContain('Approve the additional settings file?')
  })
})
