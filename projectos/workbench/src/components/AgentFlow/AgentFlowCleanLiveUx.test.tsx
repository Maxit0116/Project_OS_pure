import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AgentActionEvent, AgentActivity, AgentFlowStep } from '@contracts/index'
import AgentActionRow from './AgentActionRow'
import AgentActivityDetails from './AgentActivityDetails'
import AgentActivitySummaryRow from './AgentActivitySummaryRow'
import AgentFlowStepRow from './AgentFlowStepRow'

const step: AgentFlowStep = {
  id: 'step_generate',
  label: 'Generate proposal',
  kind: 'generate_proposal',
  status: 'running',
  relatedNodeIds: [],
  relatedFiles: ['src/a.ts'],
  outputSummary: 'Drafting file changes',
}

const action: AgentActionEvent = {
  eventId: 'evt_1',
  runId: 'run_1',
  timestamp: '2026-11-08T12:00:00.000Z',
  type: 'file_read',
  phaseId: 'step_generate',
  payload: {
    path: 'src/a.ts',
    byteLength: 12,
    status: 'ok',
  },
}

const activityComplete: AgentActivity = {
  id: 'act_1',
  runId: 'run_1',
  mode: 'change',
  kind: 'thinking',
  status: 'complete',
  summary: 'Thinking',
  startedAt: '2026-11-08T12:00:00.000Z',
  completedAt: '2026-11-08T12:00:01.000Z',
  detail: {
    kind: 'thinking',
    content: 'hello chain',
    truncated: false,
  },
}

describe('Agent Flow Clean Live UX', () => {
  it('marks running activity summary rows as live', () => {
    const html = renderToStaticMarkup(
      <AgentActivitySummaryRow id="act_1" status="running" summary="Thinking" onOpen={() => {}} />,
    )
    expect(html).toContain('data-live="true"')
    expect(html).toContain('Thinking')
  })

  it('keeps action metadata collapsed by default', () => {
    const html = renderToStaticMarkup(<AgentActionRow event={action} />)
    expect(html).toContain('data-action="file_read"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('src/a.ts')
  })

  it('keeps step details collapsed while showing live running state', () => {
    const html = renderToStaticMarkup(
      <AgentFlowStepRow
        step={step}
        isLast
        index={0}
        onSelect={() => {}}
        selected={false}
      />,
    )
    expect(html).toContain('data-live="true"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('Drafting file changes')
  })

  it('collapses activity details by default and expands selected when preferred', () => {
    const collapsed = renderToStaticMarkup(
      <AgentActivityDetails activities={[activityComplete]} selectedId={null} />,
    )
    expect(collapsed).toContain('aria-expanded="false"')
    expect(collapsed).not.toContain('hello chain')

    const expanded = renderToStaticMarkup(
      <AgentActivityDetails
        activities={[activityComplete]}
        selectedId="act_1"
        preferExpandSelected
      />,
    )
    expect(expanded).toContain('data-expanded="true"')
    expect(expanded).toContain('hello chain')
  })
})
