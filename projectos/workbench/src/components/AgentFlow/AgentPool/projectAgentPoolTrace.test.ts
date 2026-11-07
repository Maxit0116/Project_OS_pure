import { describe, expect, it } from 'vitest'
import type { AgentActionEvent, AgentFlowStep, AgentRunEvent } from '@contracts/index'
import {
  aggregateAgentPoolRunKpi,
  projectAgentPoolTrace,
  resolvePoolOriginMs,
  stableDefinitionId,
} from './projectAgentPoolTrace'

function step(
  partial: Partial<AgentFlowStep> & Pick<AgentFlowStep, 'id' | 'label' | 'kind'>,
): AgentFlowStep {
  return {
    status: 'complete',
    relatedNodeIds: [],
    relatedFiles: [],
    ...partial,
  }
}

describe('projectAgentPoolTrace', () => {
  it('projects Major Actions from AgentFlowStep allowlist with nested spans', () => {
    const origin = Date.parse('2026-01-01T00:00:00.000Z')
    const events: AgentRunEvent[] = [
      {
        eventId: 'e1',
        runId: 'run-1',
        timestamp: '2026-01-01T00:00:01.000Z',
        type: 'step_started',
        step: step({ id: 's-plan', label: 'Plan', kind: 'locate_plan', status: 'running' }),
      },
      {
        eventId: 'e2',
        runId: 'run-1',
        timestamp: '2026-01-01T00:00:02.000Z',
        type: 'step_completed',
        step: step({ id: 's-plan', label: 'Plan', kind: 'locate_plan', status: 'complete' }),
      },
      {
        eventId: 'e3',
        runId: 'run-1',
        timestamp: '2026-01-01T00:00:03.000Z',
        type: 'step_started',
        step: step({
          id: 's-gen',
          label: 'Generate',
          kind: 'generate_proposal',
          status: 'running',
        }),
      },
      {
        eventId: 'e4',
        runId: 'run-1',
        timestamp: '2026-01-01T00:00:04.500Z',
        type: 'model_request',
        payload: {
          stage: 'generate',
          requestId: 'req-1',
          requestKind: 'change_generation',
          provider: 'test',
          model: 'm1',
          durationMs: 400,
          status: 'ok',
          backend: 'model',
          usage: 'reported',
          tokenUsage: { input: 10, output: 20 },
        },
      },
      {
        eventId: 'e5',
        runId: 'run-1',
        timestamp: '2026-01-01T00:00:05.000Z',
        type: 'step_completed',
        step: step({
          id: 's-gen',
          label: 'Generate',
          kind: 'generate_proposal',
          status: 'complete',
        }),
      },
    ]

    const projection = projectAgentPoolTrace({
      agentRunId: 'run-1',
      events,
      poolOriginMs: origin,
      live: false,
    })

    expect(projection.majorActions.map((a) => a.name)).toEqual(['Plan', 'Generate'])
    expect(projection.compactBars).toHaveLength(2)
    expect(projection.spans.some((span) => span.kind === 'model')).toBe(true)
    const model = projection.spans.find((span) => span.kind === 'model')
    expect(model?.timingQuality).toBe('exact')
    expect(model?.attributes).not.toHaveProperty('prompt')
    expect(projection.majorActions[1]?.subActions.length).toBeGreaterThan(0)
  })

  it('falls back to custom majors without claiming step provenance', () => {
    const actions: AgentActionEvent[] = [
      {
        eventId: 'a1',
        runId: 'run-2',
        timestamp: '2026-01-01T00:00:01.000Z',
        type: 'file_read',
        payload: { path: 'a.ts', byteLength: 10, status: 'ok' },
      },
      {
        eventId: 'a2',
        runId: 'run-2',
        timestamp: '2026-01-01T00:00:02.000Z',
        type: 'model_request',
        payload: {
          stage: 'generate',
          requestId: 'r',
          requestKind: 'change_generation',
          provider: 'p',
          model: 'm',
          durationMs: 100,
          status: 'ok',
          backend: 'fixture',
          usage: 'missing',
          tokenUsage: { input: 0, output: 0 },
        },
      },
    ]
    const projection = projectAgentPoolTrace({
      agentRunId: 'run-2',
      actions,
      poolOriginMs: Date.parse('2026-01-01T00:00:00.000Z'),
      live: false,
    })
    expect(projection.majorActions.every((major) => major.kind === 'custom')).toBe(true)
    expect(projection.majorActions.length).toBeGreaterThanOrEqual(2)
  })

  it('keeps definition ids stable and independent of display names', () => {
    expect(
      stableDefinitionId({ source: 'root', taskId: 'root:run-1', chatSessionId: 's1' }),
    ).toBe('def_root_s1')
    expect(stableDefinitionId({ source: 'delegation', taskId: 'task-a' })).toBe(
      'def_task_task-a',
    )
  })

  it('resolves shared pool origin from absolute starts', () => {
    expect(resolvePoolOriginMs([200, 100, null, undefined])).toBe(100)
  })

  it('aggregates KPI and omits tokens when usage is missing', () => {
    const origin = Date.parse('2026-01-01T00:00:00.000Z')
    const projection = projectAgentPoolTrace({
      agentRunId: 'run-kpi',
      poolOriginMs: origin,
      live: false,
      actions: [
        {
          eventId: 'm1',
          runId: 'run-kpi',
          timestamp: '2026-01-01T00:00:01.000Z',
          type: 'model_request',
          payload: {
            stage: 'generate',
            requestId: 'r1',
            requestKind: 'change_generation',
            provider: 'p',
            model: 'm',
            durationMs: 200,
            status: 'ok',
            backend: 'model',
            usage: 'reported',
            tokenUsage: { input: 5, output: 7 },
          },
        },
        {
          eventId: 'm2',
          runId: 'run-kpi',
          timestamp: '2026-01-01T00:00:02.000Z',
          type: 'model_request',
          payload: {
            stage: 'generate',
            requestId: 'r2',
            requestKind: 'change_generation',
            provider: 'p',
            model: 'm',
            durationMs: 100,
            status: 'failed',
            backend: 'model',
            usage: 'missing',
            tokenUsage: { input: 0, output: 0 },
          },
        },
        {
          eventId: 't1',
          runId: 'run-kpi',
          timestamp: '2026-01-01T00:00:03.000Z',
          type: 'mcp_tool_call',
          payload: {
            serverId: 's',
            toolName: 'search',
            callId: 'call-1',
            status: 'completed',
            durationMs: 50,
          },
        },
      ],
    })
    expect(projection.kpi.modelCallCount).toBe(2)
    expect(projection.kpi.toolCallCount).toBe(1)
    expect(projection.kpi.errorCount).toBeGreaterThanOrEqual(1)
    expect(projection.kpi.tokensIn).toBeUndefined()
    expect(projection.kpi.tokensOut).toBeUndefined()

    const reportedOnly = projectAgentPoolTrace({
      agentRunId: 'run-kpi-2',
      poolOriginMs: origin,
      live: false,
      actions: [
        {
          eventId: 'm3',
          runId: 'run-kpi-2',
          timestamp: '2026-01-01T00:00:01.000Z',
          type: 'model_request',
          payload: {
            stage: 'generate',
            requestId: 'r3',
            requestKind: 'change_generation',
            provider: 'p',
            model: 'm',
            durationMs: 100,
            status: 'ok',
            backend: 'model',
            usage: 'reported',
            tokenUsage: { input: 3, output: 4 },
          },
        },
      ],
    })
    expect(reportedOnly.kpi.tokensIn).toBe(3)
    expect(reportedOnly.kpi.tokensOut).toBe(4)
    expect(aggregateAgentPoolRunKpi(reportedOnly, 1000).durationMs).toBeGreaterThan(0)
  })

  it('projects handoff and wait spans only with evidence', () => {
    const origin = Date.parse('2026-01-01T00:00:00.000Z')
    const projection = projectAgentPoolTrace({
      agentRunId: 'run-hand',
      poolOriginMs: origin,
      live: true,
      nowMs: origin + 5000,
      events: [
        {
          eventId: 'd1',
          runId: 'run-hand',
          timestamp: '2026-01-01T00:00:01.000Z',
          type: 'task_delegated',
          payload: {
            planId: 'p1',
            taskId: 'task-child',
            childRunId: 'child-1',
            nodeId: 'n1',
            filePath: 'a.ts',
          },
        },
        {
          eventId: 'c1',
          runId: 'run-hand',
          timestamp: '2026-01-01T00:00:04.000Z',
          type: 'child_run_completed',
          payload: {
            planId: 'p1',
            taskId: 'task-child',
            childRunId: 'child-1',
            status: 'awaiting_review',
          },
        },
      ],
    })
    expect(projection.spans.some((span) => span.kind === 'handoff')).toBe(true)
    const wait = projection.spans.find((span) => span.kind === 'wait')
    expect(wait).toBeTruthy()
    expect(wait?.endMs).toBeUndefined()
    expect(wait?.status).toBe('running')
    expect(projection.compactBars.some((bar) => bar.kind === 'handoff')).toBe(true)
    expect(projection.compactBars.some((bar) => bar.kind === 'wait')).toBe(true)
  })
})
