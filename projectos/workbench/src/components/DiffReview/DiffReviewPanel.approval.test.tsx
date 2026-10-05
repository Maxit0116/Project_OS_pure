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
