import { describe, expect, it } from 'vitest'
import type { ChatSessionHead } from '@contracts/chat-session'
import type { SpatialCaptureSession } from '@contracts/spatial-capture-session'
import { createDraftSpatialPin, type SpatialPin } from '@contracts/spatial-pin'
import {
  deriveCaptureActivity,
  loadCaptureActivities,
  type CaptureActivitySource,
} from './captureSessionActivity'

const location = { surface: 'screen' as const, url: 'spatial://screen' }

function session(
  arrows: SpatialCaptureSession['regions'][number]['arrows'],
  mode: SpatialCaptureSession['regions'][number]['mode'] = 'change',
): SpatialCaptureSession {
  return {
    version: '0.1.0',
    id: 'cap_1',
    projectId: 'proj',
    createdAt: '2026-10-18T00:00:00.000Z',
    updatedAt: '2026-10-18T00:00:00.000Z',
    status: 'archived',
    location,
    viewport: { width: 800, height: 600 },
    regions: [
      {
        id: 'region_1',
        captureRect: { x: 0, y: 0, width: 100, height: 80 },
        mode,
        regionPrompt: '',
        drawStrokes: [],
        flowComplete: true,
        showAnchors: false,
        tool: 'arrow',
        arrows,
      },
    ],
  }
}

function arrow(
  overrides: Partial<SpatialCaptureSession['regions'][number]['arrows'][number]> = {},
): SpatialCaptureSession['regions'][number]['arrows'][number] {
  return {
    id: 'arrow_1',
    index: 1,
    color: '#4c7dff',
    anchor: 'top',
    head: { x: 0.5, y: 0 },
    tail: { x: 0.5, y: -0.4 },
    composeAttach: 'bottom',
    prompt: 'Fix the button',
    pinId: 'pin_1',
    status: 'submitted',
    ...overrides,
  }
}

function pin(overrides: Partial<SpatialPin> = {}): SpatialPin {
  const draft = createDraftSpatialPin({
    id: overrides.id ?? 'pin_1',
    projectId: 'proj',
    location,
  })
  return {
    ...draft,
    ...overrides,
    composer: { ...draft.composer, ...overrides.composer },
    links: overrides.links,
  }
}

function chat(overrides: Partial<ChatSessionHead> = {}): ChatSessionHead {
  return {
    id: 'chat_1',
    title: 'Fix the button',
    createdAt: '2026-10-18T00:00:00.000Z',
    lastUpdatedAt: '2026-10-18T00:05:00.000Z',
    chatMode: 'change',
    isArchived: false,
    status: 'idle',
    ...overrides,
  }
}

describe('deriveCaptureActivity', () => {
  it('lists a draft compose card without marking it working', () => {
    const activity = deriveCaptureActivity({
      session: session([arrow({ status: 'draft', prompt: 'Not sent yet' })]),
      pinsById: new Map(),
      chatsById: new Map(),
      runsById: new Map(),
    })
    expect(activity.level).toBe('idle')
    expect(activity.workingCount).toBe(0)
    expect(activity.sessions).toMatchObject([
      { key: 'arrow_1', chatSessionId: null, presence: 'idle', title: 'Not sent yet' },
    ])
  })

  it('does not treat a stuck running head as a live agent flow', () => {
    const activity = deriveCaptureActivity({
      session: session([arrow()]),
      pinsById: new Map([
        [
          'pin_1',
          pin({
            status: 'running',
            links: { chatSessionId: 'chat_1' },
          }),
        ],
      ]),
      chatsById: new Map([['chat_1', chat({ status: 'running' })]]),
      runsById: new Map(),
      flowsById: new Map([['chat_1', 'idle']]),
    })
    expect(activity.workingCount).toBe(0)
    expect(activity.sessions[0]?.presence).toBe('idle')
  })

  it('marks a live run as working even when the pin stays running after submit', () => {
    const activity = deriveCaptureActivity({
      session: session([arrow({ runId: 'run_1' })]),
      pinsById: new Map([
        [
          'pin_1',
          pin({
            status: 'running',
            links: { chatSessionId: 'chat_1', runId: 'run_1' },
          }),
        ],
      ]),
      chatsById: new Map([['chat_1', chat({ status: 'running' })]]),
      runsById: new Map([['run_1', 'running']]),
    })
    expect(activity.level).toBe('working')
    expect(activity.workingCount).toBe(1)
    expect(activity.sessions[0]).toMatchObject({
      chatSessionId: 'chat_1',
      presence: 'working',
      title: 'Fix the button',
    })
  })

  it('treats a finished run as idle when the pin and chat head are still marked running', () => {
    const activity = deriveCaptureActivity({
      session: session([arrow({ runId: 'run_1' })]),
      pinsById: new Map([
        [
          'pin_1',
          pin({
            status: 'running',
            links: { chatSessionId: 'chat_1', runId: 'run_1' },
          }),
        ],
      ]),
      chatsById: new Map([['chat_1', chat({ status: 'running' })]]),
      runsById: new Map([['run_1', 'complete']]),
    })
    expect(activity.level).toBe('idle')
    expect(activity.sessions[0]?.presence).toBe('idle')
  })

  it('asks for attention when a plan is waiting and a run has failed', () => {
    const activity = deriveCaptureActivity({
      session: session([
        arrow({ id: 'arrow_plan', pinId: 'pin_plan', prompt: 'Plan the header' }),
        arrow({
          id: 'arrow_err',
          index: 2,
          pinId: 'pin_err',
          prompt: 'Broken submit',
          status: 'error',
        }),
      ]),
      pinsById: new Map([
        [
          'pin_plan',
          pin({
            id: 'pin_plan',
            status: 'awaiting_review',
            composer: { mode: 'plan', prompt: 'Plan the header' },
            links: { chatSessionId: 'chat_plan' },
          }),
        ],
        ['pin_err', null],
      ]),
      chatsById: new Map([
        ['chat_plan', chat({ id: 'chat_plan', title: 'Header plan', status: 'awaiting_review', chatMode: 'plan' })],
      ]),
      runsById: new Map(),
    })
    expect(activity.level).toBe('needs_you')
    expect(activity.sessions.map((item) => item.presence)).toEqual(['needs_you', 'needs_you'])
  })

  it('keeps one row per compose card and sorts a live flow first', () => {
    const activity = deriveCaptureActivity({
      session: session([
        arrow({
          id: 'arrow_idle',
          pinId: 'pin_idle',
          prompt: 'Already done',
          runId: 'run_done',
        }),
        arrow({
          id: 'arrow_live',
          index: 2,
          pinId: 'pin_live',
          prompt: 'Still going',
          runId: 'run_live',
        }),
        arrow({
          id: 'arrow_same',
          index: 3,
          pinId: 'pin_live_again',
          prompt: 'Still going',
          runId: 'run_live',
        }),
      ]),
      pinsById: new Map([
        [
          'pin_idle',
          pin({
            id: 'pin_idle',
            status: 'done',
            links: { chatSessionId: 'chat_idle', runId: 'run_done' },
          }),
        ],
        [
          'pin_live',
          pin({
            id: 'pin_live',
            status: 'running',
            links: { chatSessionId: 'chat_live', runId: 'run_live' },
          }),
        ],
        [
          'pin_live_again',
          pin({
            id: 'pin_live_again',
            status: 'running',
            links: { chatSessionId: 'chat_live', runId: 'run_live' },
          }),
        ],
      ]),
      chatsById: new Map([
        ['chat_idle', chat({ id: 'chat_idle', title: 'Done', lastUpdatedAt: '2026-10-18T00:02:00.000Z' })],
        ['chat_live', chat({ id: 'chat_live', title: 'Live', status: 'running', lastUpdatedAt: '2026-10-18T00:04:00.000Z' })],
      ]),
      runsById: new Map([
        ['run_done', 'complete'],
        ['run_live', 'running'],
      ]),
    })
    expect(activity.sessions.map((item) => item.key)).toEqual([
      'arrow_live',
      'arrow_same',
      'arrow_idle',
    ])
    expect(activity.workingCount).toBe(2)
    expect(activity.level).toBe('working')
  })
})

describe('loadCaptureActivities', () => {
  it('reads pins and runs, and ignores a missing run', async () => {
    const source: CaptureActivitySource = {
      async getChatSessionIndex() {
        return {
          version: '0.2.0',
          pinnedIds: [],
          heads: [chat({ status: 'running' })],
        }
      },
      async getSpatialCaptureSession() {
        return session([arrow({ runId: 'run_missing' })])
      },
      async getSpatialPin() {
        return pin({
          status: 'running',
          links: { chatSessionId: 'chat_1', runId: 'run_missing' },
        })
      },
      async getChatSession() {
        return {
          version: '0.2.0',
          head: chat({ status: 'running' }),
          messages: [],
          snapshot: { flowStatus: 'idle' },
        }
      },
      async getAgentRun() {
        throw new Error('run_not_found')
      },
    }
    const activities = await loadCaptureActivities(source, 'proj', ['cap_1'])
    expect(activities.cap_1?.level).toBe('idle')
  })
})
