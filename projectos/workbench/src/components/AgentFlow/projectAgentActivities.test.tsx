import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { AgentActionEvent } from '@contracts/index'
import AgentActivityDetails from './AgentActivityDetails'
import AgentActivitySummaryRow from './AgentActivitySummaryRow'
import {
  projectAgentActivities,
  type ActivityLabels,
} from './projectAgentActivities'

const labels: ActivityLabels = {
  thinking: () => 'Thinking',
  planning: (objective) => objective?.trim() || 'Planning next move',
  explored: (count) => `Explored · ${count} files`,
  exploredEmpty: () => 'Explored · no extra files',
  grepHits: (count) => `Grep · ${count} hits`,
  readFile: (file) => `Read ${file}`,
  edited: (file) => `Edited ${file}`,
  ran: (command, status) => `Ran ${command} · ${status}`,
  context: (count) => `Context · ${count} files`,
  mcp: (tool, status) => `${tool} · ${status}`,
  askFailed: () => 'Ask failed',
}

const emptyInput = {
  messages: [],
  latestAskTrace: null,
  latestPlanTrace: null,
  activeRunId: null,
  flowActions: [],
  flowTransientTraces: [],
  chatMode: 'ask' as const,
}

describe('projectAgentActivities', () => {
  it('puts grep previews in detail and only the count in the summary', () => {
    const activities = projectAgentActivities({
      ...emptyInput,
      messages: [{
        id: 'm1',
        timestamp: '2026-10-19T00:00:00.000Z',
        explorationTrace: {
          queriedSymbols: ['login'],
          hits: [{ path: 'src/auth.ts', line: 12, preview: 'SECRET_PREVIEW_LINE' }],
          readPaths: ['src/auth.ts'],
          truncated: false,
          roundsUsed: 1,
          maxRounds: 2,
        },
      }],
    }, labels)

    const explore = activities.find((item) => item.id === 'msg:m1:explore')
    expect(explore?.summary).toBe('Explored · 1 files')
    expect(explore?.summary).not.toContain('SECRET_PREVIEW_LINE')
    expect(explore?.detail).toMatchObject({
      kind: 'grep',
      hits: [{ path: 'src/auth.ts', line: 12, preview: 'SECRET_PREVIEW_LINE' }],
    })

    const summaryHtml = renderToStaticMarkup(
      <AgentActivitySummaryRow
        id={explore!.id}
        status={explore!.status}
        summary={explore!.summary}
        onOpen={() => undefined}
      />,
    )
    expect(summaryHtml).toContain('Explored · 1 files')
    expect(summaryHtml).not.toContain('SECRET_PREVIEW_LINE')
    expect(summaryHtml).not.toContain('src/auth.ts')

    const detailHtml = renderToStaticMarkup(
      <AgentActivityDetails activities={[explore!]} selectedId={explore!.id} />,
    )
    expect(detailHtml).toContain('SECRET_PREVIEW_LINE')
    expect(detailHtml).toContain('src/auth.ts:12')
    expect(detailHtml).toContain(`data-activity-detail="${explore!.id}"`)
  })

  it('projects read, edit, and shell rows from real run events only', () => {
    const actions: AgentActionEvent[] = [
      {
        eventId: 'evt_read',
        runId: 'run_1',
        timestamp: '2026-10-19T00:00:00.000Z',
        type: 'file_read',
        payload: { path: 'src/app.ts', byteLength: 20, status: 'ok' },
      },
      {
        eventId: 'evt_diff',
        runId: 'run_1',
        timestamp: '2026-10-19T00:00:01.000Z',
        type: 'diff_proposed',
        payload: { files: [{ path: 'src/app.ts', operation: 'modify' }] },
      },
      {
        eventId: 'evt_shell',
        runId: 'run_1',
        timestamp: '2026-10-19T00:00:02.000Z',
        type: 'verification_result',
        payload: {
          command: 'npm test',
          status: 'failed',
          exitCode: 1,
          stdout: 'FAIL_OUTPUT_BODY',
          stderr: 'Error: boom\n    at stack',
          truncated: true,
          durationMs: 40,
        },
      },
    ]
    const activities = projectAgentActivities({
      ...emptyInput,
      chatMode: 'change',
      activeRunId: 'run_1',
      flowActions: actions,
    }, labels)

    expect(activities.map((item) => item.summary)).toEqual([
      'Read app.ts',
      'Edited app.ts',
      'Ran npm test · failed',
    ])
    expect(activities[2]?.status).toBe('error')
    expect(activities[2]?.summary).not.toContain('FAIL_OUTPUT_BODY')
    expect(activities[2]?.detail).toMatchObject({
      kind: 'shell',
      stdout: 'FAIL_OUTPUT_BODY',
      exitCode: 1,
      truncated: true,
    })
    const detailHtml = renderToStaticMarkup(
      <AgentActivityDetails activities={[activities[2]!]} selectedId={null} />,
    )
    expect(detailHtml).toContain('FAIL_OUTPUT_BODY')
    expect(detailHtml).toMatch(/Output truncated|输出已截断/)
    expect(activities[2]?.summary).not.toContain('FAIL_OUTPUT_BODY')
    expect(activities.some((item) => item.kind === 'thinking')).toBe(false)
  })

  it('emits one grep row per exploration round and keeps previews out of the summary', () => {
    const activities = projectAgentActivities({
      ...emptyInput,
      messages: [{
        id: 'm2',
        timestamp: '2026-10-19T00:00:00.000Z',
        explorationTrace: {
          queriedSymbols: ['Auth', 'Token'],
          hits: [
            { path: 'src/auth.ts', line: 1, preview: 'ROUND_ONE_PREVIEW' },
            { path: 'src/token.ts', line: 4, preview: 'ROUND_TWO_PREVIEW' },
          ],
          readPaths: ['src/auth.ts'],
          reads: [{
            path: 'src/auth.ts',
            startLine: 1,
            endLine: 3,
            excerpt: 'EXCERPT_BODY',
            truncated: false,
          }],
          rounds: [
            {
              index: 1,
              symbols: ['Auth'],
              hits: [{ path: 'src/auth.ts', line: 1, preview: 'ROUND_ONE_PREVIEW' }],
              reads: [{
                path: 'src/auth.ts',
                startLine: 1,
                endLine: 3,
                excerpt: 'EXCERPT_BODY',
                truncated: false,
              }],
            },
            {
              index: 2,
              symbols: ['Token'],
              hits: [{ path: 'src/token.ts', line: 4, preview: 'ROUND_TWO_PREVIEW' }],
              reads: [],
            },
          ],
          truncated: false,
          roundsUsed: 2,
          maxRounds: 2,
        },
      }],
    }, labels)

    const greps = activities.filter((item) => item.kind === 'grep')
    expect(greps.map((item) => item.summary)).toEqual(['Grep · 1 hits', 'Grep · 1 hits'])
    expect(greps.map((item) => item.summary).join(' ')).not.toContain('ROUND_ONE_PREVIEW')
    expect(activities.find((item) => item.kind === 'read_file')?.summary).toBe('Read auth.ts')
    expect(activities.find((item) => item.kind === 'read_file')?.summary).not.toContain('EXCERPT_BODY')
    const detail = renderToStaticMarkup(
      <AgentActivityDetails activities={greps} selectedId={null} />,
    )
    expect(detail).toContain('ROUND_ONE_PREVIEW')
    expect(detail).toContain('ROUND_TWO_PREVIEW')
  })

  it('does not invent an explore row when Ask did not search', () => {
    const activities = projectAgentActivities(emptyInput, labels)
    expect(activities).toEqual([])
  })
})
