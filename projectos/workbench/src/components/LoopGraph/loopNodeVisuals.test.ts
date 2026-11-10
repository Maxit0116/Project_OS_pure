import { describe, expect, it } from 'vitest'

import {
  decodePaletteDragPayload,
  encodePaletteDragPayload,
  visualForIntentNode,
  visualForPaletteItem,
  visualKeyFromArchitecture,
} from './loopNodeVisuals'

describe('loopNodeVisuals', () => {
  it('maps every built-in palette id to a distinct non-draft visual', () => {
    const ids = [
      'agent.planner',
      'agent.coder',
      'agent.reviewer',
      'action.test',
      'action.github.create_pr',
      'action.github.create_branch',
      'action.slack.post_message',
      'action.feishu.post_message',
      'action.lark.post_message',
      'action.sentry.list_issues',
      'action.terminal',
      'logic.condition',
      'logic.loop',
      'logic.merge',
      'logic.exit',
      'human.approval',
      'human.review',
      'human.input',
    ] as const
    const keys = ids.map((id) => visualForPaletteItem({ id }).key)
    expect(new Set(keys).size).toBe(ids.length)
    expect(keys.every((key) => key !== 'draft')).toBe(true)
  })

  it('attaches brand icon keys for GitHub/Slack/Lark actions', () => {
    expect(visualForPaletteItem({ id: 'action.github.create_pr' }).integrationIconKey).toBe(
      'github',
    )
    expect(visualForPaletteItem({ id: 'action.slack.post_message' }).integrationIconKey).toBe(
      'slack',
    )
    expect(visualForPaletteItem({ id: 'action.feishu.post_message' }).integrationIconKey).toBe(
      'feishu',
    )
    expect(visualForPaletteItem({ id: 'action.lark.post_message' }).integrationIconKey).toBe(
      'lark',
    )
    expect(visualForPaletteItem({ id: 'action.sentry.list_issues' }).integrationIconKey).toBe(
      'sentry',
    )
    expect(visualKeyFromArchitecture({ actionIntegration: 'slack' })).toBe(
      'action.slack.post_message',
    )
    expect(visualKeyFromArchitecture({ actionIntegration: 'feishu' })).toBe(
      'action.feishu.post_message',
    )
    expect(visualKeyFromArchitecture({ actionIntegration: 'lark' })).toBe(
      'action.lark.post_message',
    )
  })

  it('resolves architecture fields in priority order', () => {
    expect(
      visualKeyFromArchitecture({
        actionIntegration: 'github',
        actionOperation: 'create_pr',
        agentRole: 'coder',
      }),
    ).toBe('action.github.create_pr')
    expect(visualKeyFromArchitecture({ agentRole: 'planner' })).toBe('agent.planner')
    expect(visualKeyFromArchitecture({ logicKind: 'loop' })).toBe('logic.loop')
    expect(visualKeyFromArchitecture({ humanMode: 'approval' })).toBe('human.approval')
  })

  it('maps intent nodes via architecture defaults', () => {
    const visual = visualForIntentNode({
      id: 'n1',
      title: 'Plan',
      prompt: 'Plan the feature',
      position: { x: 0, y: 0 },
      type: 'agent',
      agentRole: 'planner',
      role: 'implement',
    })
    expect(visual.key).toBe('agent.planner')
    expect(visual.shortLabel).toBe('Planner')
  })

  it('round-trips palette drag payload', () => {
    const raw = encodePaletteDragPayload('agent.coder')
    expect(decodePaletteDragPayload(raw)).toBe('agent.coder')
    expect(decodePaletteDragPayload('not-json')).toBeNull()
  })
})
