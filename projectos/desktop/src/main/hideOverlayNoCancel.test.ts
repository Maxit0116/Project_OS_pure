import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guardrail: Esc / hideOverlay must solidify UI state only — never cancel agent runs.
 * Scans the overlay window module for cancel/stop run call sites.
 */
describe('hideOverlay no-cancel guarantee', () => {
  it('createOverlayWindow hide path does not cancel runs', () => {
    const source = readFileSync(
      join(__dirname, 'createOverlayWindow.ts'),
      'utf8',
    )
    expect(source).toContain('requestHide')
    expect(source).toMatch(/hideOverlayWindow/)
    expect(source).not.toMatch(/cancelRun|stopRun|abortRun/)
  })
})
