import { describe, expect, it } from 'vitest'
import type { ContextAssembly } from '@contracts/index'
import {
  buildContextUsageMetrics,
  estimateTokensFromChars,
  formatTokenCount,
} from './contextUsageMetrics'

function assemblyWith(chars: Partial<Record<string, number>>): ContextAssembly {
  const slot = (value = 0) => ({
    chars: value,
    sha256: `sha256:${'ab'.repeat(32)}`,
  })
  return {
    version: '0.1.0',
    assemblyId: 'asm_test',
    contentHash: slot().sha256,
    slots: {
      instructions: slot(chars.instructions ?? 0),
      scope: slot(chars.scope ?? 0),
      pins: slot(chars.pins ?? 0),
      retrieval: { ...slot(chars.retrieval ?? 0), searched: false },
      memory: slot(chars.memory ?? 0),
      session: slot(chars.session ?? 0),
    },
    omissions: [],
    reserved: 0,
  }
}

describe('contextUsageMetrics', () => {
  it('estimates tokens with chars/4', () => {
    expect(estimateTokensFromChars(400)).toBe(100)
    expect(formatTokenCount(475)).toBe('475')
    expect(formatTokenCount(3700)).toBe('3.7K')
    expect(formatTokenCount(103_500)).toBe('103.5K')
  })

  it('builds a window percent and colored segments from assembly slots', () => {
    const metrics = buildContextUsageMetrics(
      assemblyWith({ instructions: 400, session: 39_600 }),
      100_000,
    )

    expect(metrics.usedTokens).toBe(10_000)
    expect(metrics.percentFull).toBe(10)
    expect(metrics.segments.find((s) => s.slot === 'session')?.tokens).toBe(9_900)
    expect(metrics.segments.find((s) => s.slot === 'instructions')?.windowPercent).toBeCloseTo(0.1, 5)
  })

  it('returns a zeroed ring when assembly is missing', () => {
    const metrics = buildContextUsageMetrics(null, 128_000)
    expect(metrics.percentFull).toBe(0)
    expect(metrics.usedTokens).toBe(0)
  })
})
