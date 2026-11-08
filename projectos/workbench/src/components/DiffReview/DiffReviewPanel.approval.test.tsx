import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useWorkbenchStore } from '../../state/workbenchStore'
import DiffReviewPanel from './DiffReviewPanel'

afterEach(() => {
  useWorkbenchStore.setState({ locale: 'en' })
})

describe('DiffReviewPanel verification approval', () => {
  it('shows the exact structured project commands before approval', () => {
    useWorkbenchStore.setState({ locale: 'en' })
    const html = renderToStaticMarkup(
      <DiffReviewPanel
        diff={{
          runId: 'run-approval',
          summary: 'Approval surface',
          files: [{
            path: 'app/page.tsx',
            changeType: 'modify',
            before: 'before',
            after: 'after',
          }],
        }}
        applyResult={{
          runId: 'run-approval',
          applied: true,
          filesChanged: ['app/page.tsx'],
          verificationStatus: 'not_run',
          outcome: 'applied',
          backupId: 'backup-approval',
        }}
        verificationResult={null}
        verificationCommandApproval={{
          projectId: 'project-approval',
          status: 'approval_required',
          commandSetHash: `sha256:${'a'.repeat(64)}`,
          commands: [{
            command: './project-check',
            args: ['--all', 'argument with spaces'],
            timeoutMs: 10_000,
          }],
        }}
        verificationLoading={false}
        undoLoading={false}
        onApply={vi.fn()}
        onVerify={vi.fn()}
        onApproveVerification={vi.fn()}
        onUndo={vi.fn()}
      />,
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('./project-check')
    expect(html).toContain('--all')
    expect(html).toContain('argument with spaces')
    expect(html).toContain('&quot;timeoutMs&quot;:10000')
  })
})

describe('DiffReviewPanel for a change held over an unmet requirement', () => {
  // renderToStaticMarkup reads the store's initial locale, so each text is matched in both languages.
  const diff = {
    runId: 'run-held',
    summary: 'Held change',
    files: [{ path: 'app/page.tsx', changeType: 'modify' as const, before: 'a', after: 'b' }],
  }
  const render = (unmetRequirements: Array<{ path: string; problems: string[] }>) =>
    renderToStaticMarkup(
      <DiffReviewPanel
        diff={diff}
        applyResult={null}
        verificationResult={null}
        verificationCommandApproval={null}
        verificationLoading={false}
        undoLoading={false}
        unmetRequirements={unmetRequirements}
        onApply={vi.fn()}
        onVerify={vi.fn()}
        onApproveVerification={vi.fn()}
        onUndo={vi.fn()}
      />,
    )

  it('lists what is unmet and offers Apply anyway instead of Apply', () => {
    const html = render([{ path: 'app/page.tsx', problems: ['The heading must say Welcome'] }])
    expect(html).toContain('data-testid="unmet-requirements"')
    expect(html).toMatch(/The independent review says this change does not meet:|独立评审认为这项改动没有满足：/u)
    expect(html).toContain('app/page.tsx')
    expect(html).toContain('The heading must say Welcome')
    expect(html).toMatch(/Apply anyway|仍然应用/u)
    // The ordinary Apply label is gone: the only way through is the explicit one.
    expect(html).not.toMatch(/>Apply<|>应用</u)
  })

  it('shows the ordinary Apply and no warning when nothing is unmet', () => {
    const html = render([])
    expect(html).not.toContain('unmet-requirements')
    expect(html).not.toMatch(/Apply anyway|仍然应用/u)
    expect(html).toMatch(/>Apply<|>应用</u)
  })
})
