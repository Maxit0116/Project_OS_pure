import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { emptyPinComposerHub } from '@contracts/spatial-pin'
import { COMPOSE_HUB_STRINGS_EN } from './composeHubStrings'
import type { ComposerRepoOpsHost } from './composerRepoOpsHost'
import ComposerRepoQuickOps from './ComposerRepoQuickOps'

vi.mock('../../state/workbenchStore', () => ({
  useWorkbenchStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      githubAuthStatus: { connected: false },
    }),
}))

const mockHost: ComposerRepoOpsHost = {
  githubConnected: false,
  pushToast: vi.fn(),
  connectGitHub: vi.fn(),
  askAgent: vi.fn(),
  requestGithubGraphRefresh: vi.fn(),
}

const hub = {
  ...emptyPinComposerHub(),
  repo: { label: 'acme/app', branch: 'main' },
}

describe('ComposerRepoQuickOps', () => {
  it('shows Connect GitHub and Push when disconnected and ahead', () => {
    const html = renderToStaticMarkup(
      <ComposerRepoQuickOps
        hub={hub}
        onHubChange={vi.fn()}
        strings={COMPOSE_HUB_STRINGS_EN}
        host={mockHost}
        liveGitStatus={{
          branch: 'main',
          dirty: false,
          ahead: 2,
          behind: 0,
          remoteUrl: 'https://github.com/acme/app.git',
        }}
        dataSource={{
          pushBranch: vi.fn(),
          pullBranch: vi.fn(),
          fetchGit: vi.fn(),
        }}
      />,
    )
    expect(html).toContain('Connect GitHub')
    expect(html).toContain('Push')
  })

  it('shows Ask Agent when dirty and hides Push', () => {
    const html = renderToStaticMarkup(
      <ComposerRepoQuickOps
        hub={hub}
        onHubChange={vi.fn()}
        strings={COMPOSE_HUB_STRINGS_EN}
        host={mockHost}
        liveGitStatus={{
          branch: 'main',
          dirty: true,
          ahead: 1,
          behind: 0,
        }}
        dataSource={{
          pushBranch: vi.fn(),
          fetchGit: vi.fn(),
        }}
      />,
    )
    expect(html).toContain('Ask Agent')
    expect(html).not.toContain('>Push<')
  })

  it('shows Checkout and Cancel when hub branch differs from workspace', () => {
    const html = renderToStaticMarkup(
      <ComposerRepoQuickOps
        hub={{ ...hub, repo: { label: 'acme/app', branch: 'feat/x' } }}
        onHubChange={vi.fn()}
        strings={COMPOSE_HUB_STRINGS_EN}
        host={mockHost}
        liveGitStatus={{
          branch: 'main',
          dirty: false,
        }}
        dataSource={{
          checkoutBranch: vi.fn(),
        }}
      />,
    )
    expect(html).toContain('Checkout')
    expect(html).toContain('Checkout feat/x?')
    expect(html).toContain('Cancel')
    expect(html).toContain('main → feat/x')
  })
})
