import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import ChatContextHeader from './ChatContextHeader'

vi.mock('../../state/workbenchStore', () => ({
  useWorkbenchStore: vi.fn(),
}))

vi.mock('../../i18n', () => ({
  useI18n: () => ({
    ts: (key: string) => key,
  }),
}))

import { useWorkbenchStore } from '../../state/workbenchStore'

const mockedUseWorkbenchStore = vi.mocked(useWorkbenchStore)

function mockStoreState(state: Record<string, unknown>) {
  mockedUseWorkbenchStore.mockImplementation((selector) =>
    selector(state as never),
  )
}

describe('ChatContextHeader', () => {
  it('keeps context details collapsed by default', () => {
    mockStoreState({
      context: {
        scope: 'feature',
        title: 'Visitor',
        summary: 'Browse public pages and enter login flow.',
        linkedFiles: [],
        upstream: [],
        downstream: ['system_saas_starter'],
        nodeId: 'feat_visitor',
      },
      contextLoading: false,
      graph: { nodes: [{ id: 'feat_visitor', name: '访客 feature Visitor' }] },
      selectedNodeId: 'feat_visitor',
      globalAgentActive: false,
      selectedFilePath: null,
      pendingFileOwnerChoice: null,
      fileScopeError: null,
      selectFile: vi.fn(),
      chooseFileOwner: vi.fn(),
    })

    const html = renderToStaticMarkup(<ChatContextHeader />)

    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('system_saas_starter')
    expect(html).toContain('访客 feature Visitor')
    expect(html).toContain('Browse public pages and enter login flow.')
  })
})
