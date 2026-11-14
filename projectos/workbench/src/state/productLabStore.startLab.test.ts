import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LabStateDocument, ProjectOSApi } from '@contracts/index'
import {
  createEmptyLabDocument,
  startLabSession,
  patchLabSession,
} from '../../../services/product-lab/index'
import { useBrowserStore } from './browserStore'
import { useChatSessionStore } from './chatSessionStore'
import { useProductLabStore } from './productLabStore'
import { useTerminalStore } from './terminalStore'
import { useWorkbenchStore } from './workbenchStore'

describe('productLabStore startLab session focus', () => {
  const labChatId = 'chat_lab_dedicated'
  const recreatedChatId = 'chat_lab_recreated'
  let knownChatIds: Set<string>

  beforeEach(() => {
    knownChatIds = new Set([labChatId])
    useProductLabStore.getState().clear()
    useWorkbenchStore.setState({
      project: {
        projectId: 'proj_lab',
        name: 'Lab Proj',
        rootPath: '/tmp/lab',
        workspaceRoot: '/tmp/lab',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      } as never,
      client: {
        getLabLaunchProfile: vi.fn(async () => ({
          hasWebPreview: true,
          needsTerminalStart: true,
          needsIdeCapabilities: false,
          capabilityNeeds: [],
          surface: 'web',
          suggestedCommands: ['npm run dev'],
          startHints: ['test'],
          rationale: 'unit_test',
        })),
        upsertLabState: vi.fn(async (_projectId: string, document: LabStateDocument) => document),
        getLabState: vi.fn(async () => createEmptyLabDocument()),
        listWorkspaceDirectory: vi.fn(async () => []),
        getChatSession: vi.fn(async (_projectId: string, sessionId: string) => {
          if (!knownChatIds.has(sessionId)) return null
          return {
            version: '0.2.0',
            head: {
              id: sessionId,
              title: 'Product Lab',
              createdAt: '2026-01-01T00:00:00.000Z',
              lastUpdatedAt: '2026-01-01T00:00:00.000Z',
              chatMode: 'ask',
              isArchived: false,
              status: 'idle',
              classification: 'misc',
              classificationSource: 'auto',
            },
            messages: [],
            draftComposer: { text: '', attachments: [] },
          }
        }),
      } as unknown as ProjectOSApi,
      chatMode: 'ask',
      rightPanelOpen: false,
      rightPanelTab: 'harness' as const,
      centerTab: 'function-map',
      selectedNodeId: null,
      graph: null,
      locale: 'en',
      toasts: [],
      settings: { mcpServers: [] } as never,
      installedMarketplaceSkillIds: [],
      messages: [],
      globalAgentActive: true,
      setChatMode: vi.fn(async (mode: string, options?: { isolate?: boolean }) => {
        if (options?.isolate) {
          throw new Error('Lab start must not isolate into a new chat session')
        }
        useWorkbenchStore.setState({ chatMode: mode as never })
      }),
      sendPrompt: vi.fn(async () => undefined),
      pushToast: vi.fn(),
      setRightPanelOpen: (open: boolean) =>
        useWorkbenchStore.setState({ rightPanelOpen: open }),
      setRightPanelTab: (tab: 'chat' | 'harness') =>
        useWorkbenchStore.setState({ rightPanelTab: tab }),
      setCenterTab: (tab: string) =>
        useWorkbenchStore.setState({ centerTab: tab as never }),
    })

    useChatSessionStore.setState({
      activeSessionId: 'chat_previous',
      pinnedIds: [],
      createSession: vi.fn(async () => {
        const id =
          useProductLabStore.getState().activeSession()?.chatSessionId ===
          'chat_orphaned'
            ? recreatedChatId
            : labChatId
        knownChatIds.add(id)
        useChatSessionStore.setState({ activeSessionId: id })
        return id
      }),
      switchSession: vi.fn(async (sessionId: string) => {
        useChatSessionStore.setState({ activeSessionId: sessionId })
      }),
      setPinned: vi.fn(async (sessionId: string, pinned: boolean) => {
        const pinnedIds = useChatSessionStore.getState().pinnedIds
        useChatSessionStore.setState({
          pinnedIds: pinned
            ? [...new Set([...pinnedIds, sessionId])]
            : pinnedIds.filter((id) => id !== sessionId),
        })
      }),
      setMarketplaceOpen: vi.fn(),
    } as never)

    useTerminalStore.setState({
      getActivePtyId: () => 'pty_1',
      createTab: vi.fn(async () => 'tab_1'),
      writeToActivePty: vi.fn(),
    } as never)

    useBrowserStore.setState({
      openOrSwitchTab: vi.fn(() => 'tab_browser'),
      activeTabId: 'tab_browser',
    } as never)
  })

  afterEach(() => {
    useProductLabStore.getState().clear()
    vi.restoreAllMocks()
  })

  it('keeps the Lab chat active after terminal start kick so Lab Card can mount', async () => {
    await useProductLabStore.getState().startLab()

    const lab = useProductLabStore.getState().activeSession()
    expect(lab?.chatSessionId).toBe(labChatId)
    expect(useChatSessionStore.getState().activeSessionId).toBe(labChatId)
    expect(useWorkbenchStore.getState().rightPanelTab).toBe('chat')
    expect(useWorkbenchStore.getState().rightPanelOpen).toBe(true)
    expect(useChatSessionStore.getState().pinnedIds).toContain(labChatId)

    expect(
      Boolean(
        lab?.chatSessionId &&
          lab.chatSessionId === useChatSessionStore.getState().activeSessionId,
      ),
    ).toBe(true)

    expect(useWorkbenchStore.getState().setChatMode).toHaveBeenCalledWith(
      'change',
      { isolate: false },
    )
    expect(useChatSessionStore.getState().createSession).toHaveBeenCalledTimes(1)
    expect(useWorkbenchStore.getState().sendPrompt).toHaveBeenCalled()
  })

  it('recreates an orphaned Lab chatSessionId on flask re-entry so Lab Card can mount', async () => {
    const started = startLabSession(createEmptyLabDocument(), {
      projectId: 'proj_lab',
    })
    let document = patchLabSession(started.document, started.session.id, {
      status: 'starting',
      cardPhase: 'bootstrapping',
      chatSessionId: 'chat_orphaned',
      capabilityNeeds: ['xcode'],
      capabilityProposals: [],
    })
    useProductLabStore.setState({
      document,
      launchProfile: {
        hasWebPreview: false,
        needsTerminalStart: true,
        needsIdeCapabilities: true,
        capabilityNeeds: ['xcode'],
        surface: 'native',
        suggestedCommands: [],
        startHints: [],
        rationale: 'unit_orphan',
      },
      findingsOpen: false,
      noteDraft: '',
      busy: false,
      error: null,
      draftDebugListIds: [],
      labMarketplacePrepOpen: false,
      nodeFindingCounts: {},
      openFindingCount: 0,
    })

    // Simulate GC: orphaned id is not a known chat record.
    knownChatIds.delete('chat_orphaned')

    await useProductLabStore.getState().toggleOrStartLab()

    const lab = useProductLabStore.getState().activeSession()
    expect(lab?.chatSessionId).toBe(recreatedChatId)
    expect(useChatSessionStore.getState().activeSessionId).toBe(recreatedChatId)
    expect(useWorkbenchStore.getState().rightPanelTab).toBe('chat')
    expect(
      Boolean(
        lab?.chatSessionId &&
          lab.chatSessionId === useChatSessionStore.getState().activeSessionId,
      ),
    ).toBe(true)
  })
})
