import { describe, expect, it } from 'vitest'
import { validateVerificationCommands } from './verificationCommandDraft'

describe('validateVerificationCommands', () => {
  it('accepts a normal command', () => {
    expect(validateVerificationCommands([
      { command: 'npx', args: ['tsc', '--noEmit'], timeoutMs: 120_000 },
    ])).toBeNull()
  })

  it('rejects an empty command before save', () => {
    expect(validateVerificationCommands([
      { command: '   ', args: [], timeoutMs: 5_000 },
    ])).toBe('command_required')
  })

  it('rejects out-of-range timeouts before save', () => {
    expect(validateVerificationCommands([
      { command: 'npm', args: ['test'], timeoutMs: 50 },
    ])).toBe('timeout_invalid')
    expect(validateVerificationCommands([
      { command: 'npm', args: ['test'], timeoutMs: 300_001 },
    ])).toBe('timeout_invalid')
  })
})
