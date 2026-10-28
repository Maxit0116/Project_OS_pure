import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ContextAssembly } from '@contracts/index'
import ContextUsageCard from './ContextUsageCard'

vi.mock('../../../i18n', () => ({
  useI18n: () => ({
    ts: (key: string, vars?: Record<string, string | number>) => {
      if (!vars) return key
      return Object.entries(vars).reduce(
        (message, [name, value]) => message.replace(`{${name}}`, String(value)),
        key,
      )
    },
  }),
}))

function sampleAssembly(): ContextAssembly {
  const slot = (chars: number) => ({
    chars,
    sha256: `sha256:${'ab'.repeat(32)}`,
  })
  return {
    version: '0.1.0',
    assemblyId: 'asm_test',
    contentHash: slot(0).sha256,
    slots: {
      instructions: slot(400),
      scope: slot(0),
      pins: slot(0),
      retrieval: { ...slot(0), searched: false },
      memory: slot(0),
      session: slot(39_600),
    },
    omissions: [{ reason: 'editor_buffer', count: 1 }],
    reserved: 0,
  }
}

describe('ContextUsageCard', () => {
  it('renders nothing while closed', () => {
    const html = renderToStaticMarkup(
      <ContextUsageCard assembly={sampleAssembly()} open={false} onClose={() => undefined} />,
    )
    expect(html).toBe('')
  })

  it('shows the detailed legend and colored summary when open', () => {
    const html = renderToStaticMarkup(
      <ContextUsageCard
        assembly={sampleAssembly()}
        open
        detailed
        onClose={() => undefined}
        onToggleDetailed={() => undefined}
      />,
    )

    expect(html).toContain('context.usageCardTitle')
    expect(html).toContain('context.usageSlots.session')
    expect(html).toContain('context.usageSlots.instructions')
    expect(html).toContain('context.usageOmissions.editor_buffer')
    expect(html).toContain('context.usageCompact')
    expect(html).toContain('#a66b6b')
  })

  it('hides the legend in compact mode', () => {
    const html = renderToStaticMarkup(
      <ContextUsageCard
        assembly={sampleAssembly()}
        open
        detailed={false}
        onClose={() => undefined}
        onToggleDetailed={() => undefined}
      />,
    )

    expect(html).toContain('context.usagePercentFull')
    expect(html).not.toContain('context.usageSlots.session')
    expect(html).toContain('context.usageDetailed')
  })
})
