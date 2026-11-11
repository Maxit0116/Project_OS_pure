import { describe, expect, it } from 'vitest'
import {
  getLoopIntegration,
  integrationIdFromActionNode,
  listLoopIntegrations,
  resolveLoopIntegrationIconUrl,
  runtimeStatusBlocksExecution,
  runtimeStatusNextStep,
} from './loopIntegrationRegistry'

describe('loopIntegrationRegistry', () => {
  it('registers GitHub/Slack/Lark with local icon keys (no remote URLs)', () => {
    const list = listLoopIntegrations()
    const ids = list.map((item) => item.id)
    expect(ids).toEqual(
      expect.arrayContaining(['github', 'slack', 'feishu', 'lark', 'sentry', 'gmail']),
    )
    for (const item of ['github', 'slack', 'feishu', 'lark', 'sentry', 'gmail'] as const) {
      const meta = getLoopIntegration(item)!
      const url = resolveLoopIntegrationIconUrl(meta.iconKey)
      expect(url).toBeTruthy()
      expect(url).not.toMatch(/^https?:\/\//)
      expect(runtimeStatusBlocksExecution(meta.defaultRuntimeStatus)).toBe(true)
    }
  })

  it('keeps Feishu and Lark brand notes distinct and maps action nodes', () => {
    expect(getLoopIntegration('lark')?.brandNote).toMatch(/Feishu/i)
    expect(getLoopIntegration('feishu')?.brandNote).toMatch(/Lark/i)
    expect(getLoopIntegration('feishu')?.displayName).not.toBe(
      getLoopIntegration('lark')?.displayName,
    )
    expect(
      integrationIdFromActionNode({ actionIntegration: 'github', actionOperation: 'create_pr' }),
    ).toBe('github')
  })

  it('fallback icon key yields null URL (neutral glyph path)', () => {
    expect(resolveLoopIntegrationIconUrl('fallback')).toBeNull()
    expect(
      runtimeStatusNextStep(getLoopIntegration('slack')!, 'auth_missing'),
    ).toMatch(/Connect Slack/i)
  })

  it('local SVG assets are sanitized (no script / external href)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const dir = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      'icons',
    )
    for (const file of [
      'github.svg',
      'slack.svg',
      'feishu.svg',
      'lark.svg',
      'sentry.svg',
      'gmail.svg',
    ]) {
      const raw = await fs.readFile(path.join(dir, file), 'utf8')
      expect(raw.toLowerCase()).not.toMatch(/<script/)
      // Allow only W3C xmlns namespace URLs — reject any other http(s) hotlinks.
      const urls = raw.match(/https?:\/\/[^\s"'<>]+/g) ?? []
      expect(urls.every((url) => url.startsWith('http://www.w3.org/'))).toBe(true)
      expect(raw).not.toMatch(/xlink:href\s*=\s*["'](?!#)/)
    }
  })
})
