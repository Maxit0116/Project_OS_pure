import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLoopPaletteItem } from '@contracts/index'
import { LoopSaaSNodeCard } from './LoopSaaSNodeCard'
import {
  getLoopIntegration,
  runtimeStatusBlocksExecution,
} from './loopIntegrationRegistry'
import { visualForPaletteItem, visualKeyFromArchitecture } from '../loopNodeVisuals'

vi.mock('../../../i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    ts: (key: string) => key,
  }),
}))

vi.mock('../../ChatPanel/composer/useComposePromptVoice', () => ({
  useComposePromptVoice: () => ({
    voice: {
      state: {},
      isRecording: false,
      isTranscribing: false,
      dismissError: vi.fn(),
    },
    voiceLabels: {},
    dockProps: {
      isRecording: false,
      isTranscribing: false,
      labels: { start: 'start', stop: 'stop', recording: 'recording' },
      isSupported: false,
      onMicToggle: vi.fn(),
    },
    syncBaseFromExternalText: vi.fn(),
    cancelVoice: vi.fn(),
    stopVoice: vi.fn(),
  }),
}))

vi.mock('../../../state/loopGraphStore', () => ({
  useLoopGraphStore: (selector: (s: { document: null }) => unknown) =>
    selector({ document: null }),
}))

vi.mock('../../../state/workbenchStore', () => ({
  useWorkbenchStore: (selector: (s: { settings: null }) => unknown) =>
    selector({ settings: null }),
}))

describe('Loop SaaS node flow (palette → config → states)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('palette seeds Slack/Lark/GitHub with consistent registry metadata', () => {
    for (const id of [
      'action.github.create_pr',
      'action.slack.post_message',
      'action.feishu.post_message',
      'action.lark.post_message',
      'action.sentry.list_issues',
    ] as const) {
      const item = getLoopPaletteItem(id)
      expect(item).toBeTruthy()
      const visual = visualForPaletteItem({ id })
      expect(visual.integrationIconKey).toBeTruthy()
      expect(visual.defaultRuntimeStatus).toBeTruthy()
      expect(runtimeStatusBlocksExecution(visual.defaultRuntimeStatus!)).toBe(true)
      expect(
        visualKeyFromArchitecture({
          actionIntegration: item!.seed.actionIntegration,
          actionOperation: item!.seed.actionOperation,
        }),
      ).toBe(id)
    }
  })

  it('inspector exposes Action select + blocked next-step for Slack', async () => {
    const { default: LoopNodeInspector } = await import('../LoopNodeInspector')
    const html = renderToStaticMarkup(
      <LoopNodeInspector
        node={{
          id: 'n_slack',
          title: 'Slack Message',
          prompt: 'Post status',
          position: { x: 0, y: 0 },
          type: 'action',
          actionIntegration: 'slack',
          actionOperation: 'post_message',
          role: 'implement',
        }}
        onChange={() => {}}
      />,
    )
    expect(html).toContain('data-testid="saas-action-config"')
    expect(html).toContain('data-testid="saas-action-select"')
    expect(html).toContain('data-testid="saas-runtime-next-step"')
    expect(html).toContain('Configure Slack')
  })

  it('card states cover selected/error/unconfigured/awaiting_hitl for brand nodes', () => {
    const states = ['selected', 'error', 'awaiting_hitl'] as const
    for (const id of ['github', 'slack', 'feishu', 'lark', 'sentry'] as const) {
      const meta = getLoopIntegration(id)!
      for (const state of states) {
        const html = renderToStaticMarkup(
          <LoopSaaSNodeCard
            integrationId={id}
            operationLabel={meta.actions[0]!.label}
            runtimeStatus={meta.defaultRuntimeStatus}
            state={state}
          />,
        )
        expect(html).toContain(`data-integration="${id}"`)
        expect(html).toContain(`data-state="${state}"`)
        expect(html).toContain('data-blocked="true"')
      }
    }
  })
})
