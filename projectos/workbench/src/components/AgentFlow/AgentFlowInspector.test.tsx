import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { AgentActionEvent, AgentFlowStep, AgentTransientTrace } from '@contracts/index'
import AgentFlowInspector from './AgentFlowInspector'
import AgentFlowPanel, { resolveInspectedFlowStepId } from './AgentFlowPanel'

const locateStep: AgentFlowStep = {
  id: 'step_locate',
  label: 'Locate & plan',
  kind: 'locate_plan',
  status: 'complete',
  relatedNodeIds: ['feat_login'],
  relatedFiles: ['app/login/page.tsx'],
}

const generateStep: AgentFlowStep = {
  id: 'step_generate',
  label: 'Generate proposal',
  kind: 'generate_proposal',
  status: 'running',
  relatedNodeIds: ['feat_login'],
  relatedFiles: ['app/login/page.tsx'],
}

const planAction: AgentActionEvent = {
  eventId: 'evt_plan',
  runId: 'run_inspector',
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
  runId: 'run_inspector',
  timestamp: '2026-07-19T00:00:00.000Z',
  type: 'provider_reasoning',
  phaseId: 'step_locate',
  content: 'Provider-supplied locate trace for inspector',
  source: 'provider_supplied',
  truncated: false,
}

describe('resolveInspectedFlowStepId', () => {
  it('follows the running step while follow-live is on', () => {
    expect(
      resolveInspectedFlowStepId({
        steps: [locateStep, generateStep],
        followLive: true,
        selectedFlowStepId: 'step_locate',
        activityPhaseId: null,
      }),
    ).toBe('step_generate')
  })

  it('pins to the manual selection when follow-live is off', () => {
    expect(
      resolveInspectedFlowStepId({
        steps: [locateStep, generateStep],
        followLive: false,
        selectedFlowStepId: 'step_locate',
        activityPhaseId: null,
      }),
    ).toBe('step_locate')
  })

  it('falls back to activity phase when nothing else is selected', () => {
    expect(
      resolveInspectedFlowStepId({
        steps: [locateStep],
        followLive: true,
        selectedFlowStepId: null,
        activityPhaseId: 'step_locate',
      }),
    ).toBe('step_locate')
  })
})

describe('AgentFlowInspector', () => {
  it('renders provider reasoning for the inspected step', () => {
    const html = renderToStaticMarkup(
      <AgentFlowInspector
        step={locateStep}
        followLive={false}
        corrections={[]}
        actions={[planAction]}
        traces={[reasoningTrace]}
        activities={[]}
        selectedActivityId={null}
        onFollowLive={vi.fn()}
        onClearSelection={vi.fn()}
      />,
    )

    expect(html).toContain('data-agent-flow-inspector')
    expect(html).toContain('role="complementary"')
    expect(html).toContain('Provider-supplied locate trace for inspector')
    expect(html).toContain('data-transient-trace="provider_reasoning"')
    expect(html).toContain('data-action="edit_plan_created"')
    expect(html).toContain('data-agent-flow-follow-live')
  })

  it('shows an honest empty reasoning state when the provider supplied none', () => {
    const html = renderToStaticMarkup(
      <AgentFlowInspector
        step={locateStep}
        followLive={false}
        corrections={[]}
        actions={[planAction]}
        traces={[]}
        activities={[]}
        selectedActivityId={null}
        onFollowLive={vi.fn()}
        onClearSelection={vi.fn()}
      />,
    )

    expect(html).toContain('data-agent-flow-reasoning-empty')
    expect(html).not.toContain('data-transient-trace="provider_reasoning"')
  })
})

describe('AgentFlowPanel inspector layout', () => {
  it('renders a split layout with an inspector complementary region', () => {
    // renderToStaticMarkup uses zustand getServerSnapshot (initial store), so this is a
    // structural smoke check only — selection/projection are covered above.
    const html = renderToStaticMarkup(
      <AgentFlowPanel
        steps={[locateStep, generateStep]}
        status="running"
        diffReady={false}
        onReviewDiff={vi.fn()}
      />,
    )

    expect(html).toContain('data-agent-flow-split')
    expect(html).toContain('data-agent-flow-inspector')
    expect(html).toContain('role="complementary"')
  })
})
