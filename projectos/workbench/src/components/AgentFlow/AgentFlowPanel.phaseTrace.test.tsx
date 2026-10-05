import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AgentActionEvent, AgentFlowStep, AgentTransientTrace } from '@contracts/index'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { AutomaticApplySummary, groupAgentFlowPhaseTrace } from './AgentFlowPanel'

afterEach(() => {
  useWorkbenchStore.setState({
    applyResult: null,
    verificationResult: null,
    agentFlowSubject: 'run',
    locale: 'en',
  })
})

const steps: AgentFlowStep[] = [
  {
    id: 'step_context',
    label: 'Context prepared',
    kind: 'context_prepared',
    status: 'complete',
    relatedNodeIds: ['feat_login'],
    relatedFiles: ['app/login/page.tsx'],
  },
  {
    id: 'step_locate',
    label: 'Locate & plan',
    kind: 'locate_plan',
    status: 'complete',
    relatedNodeIds: ['feat_login'],
    relatedFiles: ['app/login/page.tsx'],
  },
  {
    id: 'step_generate',
    label: 'Generate proposal',
    kind: 'generate_proposal',
    status: 'complete',
    relatedNodeIds: ['feat_login'],
    relatedFiles: ['app/login/page.tsx'],
  },
  {
    id: 'step_validate',
    label: 'Validate proposal',
    kind: 'validate_proposal',
    status: 'complete',
    relatedNodeIds: ['feat_login'],
    relatedFiles: ['app/login/page.tsx'],
  },
]

const planAction: AgentActionEvent = {
  eventId: 'evt_plan',
  runId: 'run_trace',
  timestamp: '2026-07-19T00:00:00.000Z',
  type: 'edit_plan_created',
  phaseId: 'step_locate',
  payload: {
    path: 'app/login/page.tsx',
    objective: 'Update the login interaction',
    anchors: ['login form submit handler'],
    acceptanceCriteria: ['The requested interaction works'],
    rationale: 'The selected file owns the interaction.',
  },
}

const reasoningTrace: AgentTransientTrace = {
  traceId: 'trace_locate',
  runId: 'run_trace',
  timestamp: '2026-07-19T00:00:00.000Z',
  type: 'provider_reasoning',
  phaseId: 'step_locate',
  content: 'Provider-supplied locate trace',
  source: 'provider_supplied',
  truncated: false,
}

describe('AgentFlowPanel phase-linked trace', () => {
  it('interleaves durable actions and transient reasoning under their real phase', () => {
    const timeline = groupAgentFlowPhaseTrace(steps, [planAction], [reasoningTrace])

    expect(timeline.map(({ step }) => step.kind)).toEqual([
      'context_prepared',
      'locate_plan',
      'generate_proposal',
      'validate_proposal',
    ])
    expect(timeline[0]).toMatchObject({ actions: [], traces: [] })
    expect(timeline[1]).toMatchObject({
      step: { id: 'step_locate' },
      actions: [planAction],
      traces: [reasoningTrace],
    })
    expect(timeline[2]).toMatchObject({ actions: [], traces: [] })
    expect(timeline[3]).toMatchObject({ actions: [], traces: [] })
  })

  it('shows no reasoning disclosure when the provider supplied none', () => {
    const timeline = groupAgentFlowPhaseTrace(steps, [planAction], [])

    expect(timeline[1]?.actions).toEqual([planAction])
    expect(timeline[1]?.traces).toEqual([])
  })

  it('shows an applied-change summary and review action in Agent Flow', () => {
    useWorkbenchStore.setState({
      locale: 'en',
      agentFlowSubject: 'run',
      agentFlowViewMode: 'timeline',
      flowActions: [],
      flowTransientTraces: [],
      flowDelegationEvents: [],
      delegatedRunTraces: {},
      flowCorrections: [],
      applyResult: {
        runId: 'run_trace',
        applied: true,
        filesChanged: ['app/login/page.tsx'],
        verificationStatus: 'passed',
        outcome: 'applied',
        backupId: 'backup_trace',
      },
      verificationResult: { runId: 'run_trace', status: 'passed', results: [] },
    })

    const html = renderToStaticMarkup(<AutomaticApplySummary
      applyResult={useWorkbenchStore.getState().applyResult!}
      verificationResult={useWorkbenchStore.getState().verificationResult!}
      onReviewDiff={vi.fn()}
    />)

    expect(html).toContain('data-agent-flow="automatic-apply-summary"')
    expect(html).toContain('验证：passed')
    expect(html).toContain('查看已应用的修改')
  })
})
