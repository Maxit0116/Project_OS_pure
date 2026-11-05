import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import ChatContextHeader from './ChatContextHeader'

vi.mock('../../state/workbenchStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../state/workbenchStore')>()
  return {
    ...actual,
    useWorkbenchStore: vi.fn(),
  }
})

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

  it('shows the owner choice without expanding, because Send is disabled until a file has an owner', () => {
    mockStoreState({
      context: null,
      contextLoading: false,
      graph: { nodes: [{ id: 'feat_database', name: 'Prisma 数据访问' }, { id: 'feat_blog', name: '内容与搜索' }] },
      selectedNodeId: null,
      globalAgentActive: false,
      selectedFilePath: 'lib/data.ts',
      pendingFileOwnerChoice: { filePath: 'lib/data.ts', candidateNodeIds: ['feat_database', 'feat_blog'] },
      fileScopeError: null,
      selectFile: vi.fn(),
      chooseFileOwner: vi.fn(),
    })

    const html = renderToStaticMarkup(<ChatContextHeader />)

    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('context.ownershipChooser')
    expect(html).toContain('lib/data.ts')
    expect(html).toContain('Prisma 数据访问')
    expect(html).toContain('内容与搜索')
  })

  it('says why a file with no owning node cannot be sent, without expanding', () => {
    mockStoreState({
      context: null,
      contextLoading: false,
      graph: { nodes: [] },
      selectedNodeId: null,
      globalAgentActive: false,
      selectedFilePath: 'lib/validators.ts',
      pendingFileOwnerChoice: null,
      fileScopeError: 'not_mapped',
      selectFile: vi.fn(),
      chooseFileOwner: vi.fn(),
    })

    const html = renderToStaticMarkup(<ChatContextHeader />)

    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('context.fileNotMapped')
  })

  it('adds no owner prompt when the scope is already resolved', () => {
    mockStoreState({
      context: null,
      contextLoading: false,
      graph: { nodes: [{ id: 'feat_database', name: 'Prisma 数据访问' }] },
      selectedNodeId: 'feat_database',
      globalAgentActive: false,
      selectedFilePath: 'lib/data.ts',
      pendingFileOwnerChoice: null,
      fileScopeError: null,
      selectFile: vi.fn(),
      chooseFileOwner: vi.fn(),
    })

    const html = renderToStaticMarkup(<ChatContextHeader />)

    expect(html).not.toContain('context.ownershipChooser')
    expect(html).not.toContain('context.fileNotMapped')
  })

  it('defaults the trigger to global / whole project when nothing is selected', () => {
    mockStoreState({
      context: null,
      contextLoading: false,
      graph: { nodes: [] },
      selectedNodeId: null,
      globalAgentActive: true,
      selectedFilePath: null,
      pendingFileOwnerChoice: null,
      fileScopeError: null,
      selectFile: vi.fn(),
      chooseFileOwner: vi.fn(),
    })

    const html = renderToStaticMarkup(<ChatContextHeader />)

    expect(html).toContain('context.scopeGlobal')
    expect(html).not.toContain('context.empty')
  })

  it('reads the delivered assembly and keeps an unsearched retrieval slot', () => {
    const slot = { chars: 0, sha256: `sha256:${'ab'.repeat(32)}` }
    mockStoreState({
      context: null,
      contextLoading: false,
      graph: { nodes: [] },
      selectedNodeId: null,
      globalAgentActive: true,
      selectedFilePath: null,
      pendingFileOwnerChoice: null,
      fileScopeError: null,
      selectFile: vi.fn(),
      chooseFileOwner: vi.fn(),
      latestContextAssembly: {
        version: '0.1.0',
        assemblyId: 'asm_test',
        contentHash: slot.sha256,
        slots: {
          instructions: { ...slot, chars: 12 },
          scope: slot,
          pins: slot,
          retrieval: { ...slot, searched: false },
          memory: slot,
          session: slot,
        },
        omissions: [{ reason: 'editor_buffer', count: 1 }],
        reserved: 0,
      },
    })

    const html = renderToStaticMarkup(<ChatContextHeader />)

    expect(html).toContain('context.usageTitle')
    expect(html).toContain('context.usageNotSearched')
    expect(html).toContain('context.usageOmissions.editor_buffer')
  })

  it('offers the features that own files beside an unmapped file, instead of a dead end', () => {
    // Observed in the sample: lib/validators.ts has no owner, so Agent could never change it and the
    // screen only said so. The nodes that own files next to it are offered, nearest first.
    mockStoreState({
      context: null,
      contextLoading: false,
      graph: {
        nodes: [
          { id: 'system', name: 'SaaS', level: 'context', linkedFiles: [] },
          { id: 'feat_team', name: 'Team & Roles', level: 'component', linkedFiles: [{ path: 'lib/team.ts', role: 'primary' }, { path: 'lib/team-roles.ts', role: 'supporting' }] },
          { id: 'feat_ui', name: 'UI kit', level: 'component', linkedFiles: [{ path: 'components/ui/Button.tsx', role: 'primary' }] },
        ],
      },
      selectedNodeId: null,
      globalAgentActive: false,
      selectedFilePath: 'lib/validators.ts',
      pendingFileOwnerChoice: null,
      fileScopeError: 'not_mapped',
      selectFile: vi.fn(),
      chooseFileOwner: vi.fn(),
      assignFileOwner: vi.fn(),
    })

    const html = renderToStaticMarkup(<ChatContextHeader />)

    expect(html).toContain('context.fileNotMapped')
    expect(html).toContain('context.fileNotMappedHelp')
    // The nearest owner is the one-click choice; the whole-project node is never offered.
    expect(html).toContain('context.assignOwnerButton')
    // Each choice says why it is offered, so the person can judge a guess made from folders.
    expect(html).toContain('context.assignOwnerSharedDir')
    expect(html.indexOf('context.assignOwnerButton')).toBeLessThan(html.indexOf('context.assignOwnerOther'))
    expect(html).toContain('Team &amp; Roles')
    expect(html).not.toContain('>SaaS<')
  })

  it('offers no way to add an owner when the file already has one', () => {
    mockStoreState({
      context: null,
      contextLoading: false,
      graph: { nodes: [{ id: 'feat_team', name: 'Team', level: 'component', linkedFiles: [{ path: 'lib/team.ts', role: 'primary' }] }] },
      selectedNodeId: 'feat_team',
      globalAgentActive: false,
      selectedFilePath: 'lib/team.ts',
      pendingFileOwnerChoice: null,
      fileScopeError: null,
      selectFile: vi.fn(),
      chooseFileOwner: vi.fn(),
      assignFileOwner: vi.fn(),
    })

    expect(renderToStaticMarkup(<ChatContextHeader />)).not.toContain('context.fileNotMappedHelp')
  })
})
