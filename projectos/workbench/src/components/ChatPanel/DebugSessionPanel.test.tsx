import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DebugSession } from '@contracts/index'
import DebugSessionPanel from './DebugSessionPanel'

const session = {
  sessionId: 'debug_1',
  projectId: 'project',
  phase: 'verify',
  bugDescription: 'Open tasks count includes done tasks',
  reproSteps: [],
  hypotheses: [],
  instrumentation: [],
  proposedFix: { summary: 'Drop done from the constant' },
} as unknown as DebugSession

function render(overrides: Partial<{ phase: string; fixPending: boolean }>) {
  return renderToStaticMarkup(
    <DebugSessionPanel
      session={{ ...session, phase: overrides.phase ?? 'verify' } as DebugSession}
      fixInProgress={false}
      {...(overrides.fixPending === undefined ? {} : { fixPending: overrides.fixPending })}
      onReproduced={() => undefined}
      onConfirmFix={() => undefined}
      onMarkFixed={() => undefined}
      onConfirmBugAlignment={() => undefined}
      onMarkBugFixed={() => undefined}
    />,
  )
}

describe('DebugSessionPanel clean-up while the fix is pending', () => {
  it('says the fix has not been applied and in which order to proceed', () => {
    // Observed live: the fix waited in the diff review, "clean up" was pressed, and the fix could
    // never be applied after that. The panel has to say it before, not the refused apply after.
    const html = render({ fixPending: true })
    expect(html).toMatch(/has not been applied|尚未应用/u)
    expect(html).toMatch(/Apply it in Code \/ Diff first|请先在“代码 \/ Diff”里点“应用”/u)
  })

  it('shows no warning once the fix is applied, nor outside the verify phase', () => {
    const warning = /has not been applied|尚未应用/u
    expect(render({ fixPending: false })).not.toMatch(warning)
    expect(render({})).not.toMatch(warning)
    expect(render({ phase: 'fix', fixPending: true })).not.toMatch(warning)
  })
})
