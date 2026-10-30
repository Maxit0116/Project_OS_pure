import { emptyPinComposerHub } from '@contracts/index'
import { describe, expect, it } from 'vitest'
import {
  appendComposerHubToPrompt,
  stageSlotBadgeCount,
} from './composerHubPrompt'

describe('composerHubPrompt', () => {
  it('appends hub lines after the user prompt', () => {
    const hub = {
      ...emptyPinComposerHub(),
      skillIds: ['foo'],
      researchEnabled: true,
    }
    expect(appendComposerHubToPrompt('Ship it', hub)).toBe(
      'Ship it\n\nhub.skills=foo\nhub.research=enabled',
    )
  })

  it('returns trimmed prompt when hub is empty', () => {
    expect(appendComposerHubToPrompt('  hello  ', emptyPinComposerHub())).toBe(
      'hello',
    )
  })

  it('counts stage slot badges', () => {
    const hub = {
      ...emptyPinComposerHub(),
      repo: { label: 'app', branch: 'main' },
      skillIds: ['a', 'b'],
      mcpServerIds: ['m'],
      references: [
        {
          id: 'r1',
          kind: 'url' as const,
          url: 'https://example.com',
        },
      ],
      scopes: [
        { kind: 'folder' as const, id: 'folder_src', path: 'src' },
      ],
      researchEnabled: true,
    }
    expect(stageSlotBadgeCount('repo', hub)).toBe(1)
    expect(stageSlotBadgeCount('skills', hub)).toBe(2)
    expect(stageSlotBadgeCount('mcp', hub)).toBe(1)
    expect(stageSlotBadgeCount('references', hub)).toBe(1)
    expect(stageSlotBadgeCount('scope', hub)).toBe(1)
    expect(stageSlotBadgeCount('research', hub)).toBe(1)
  })
})
