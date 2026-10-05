import type { ChatSessionHead, ChatSessionIndex, ChatSessionRecord } from '@contracts/index'
import { emptyComposerDraft, resolveChatSessionTitleSource } from '@contracts/index'
import { create } from 'zustand'
import { resolveClientMode } from '../data/clientMode'
import {
  createSampleChatSessionFixtures,
  sampleActiveSessionId,
  samplePinnedSessionId,
} from '../fixtures/sampleChatSessions'
import { applyRunEventsToState } from './handleRunEvent'
import {
  buildChatSessionRecord,
  buildResetMessages,
  buildWelcomeMessages,
  hydrateChatSessionState,
} from './chatSessionSync'
import { useWorkbenchStore, type ChatMode } from './workbenchStore'

const PERSIST_DEBOUNCE_MS = 500
const TITLE_SUMMARIZE_DEBOUNCE_MS = 1500

let persistTimer: ReturnType<typeof setTimeout> | null = null
let titleSummarizeTimer: ReturnType<typeof setTimeout> | null = null

interface ChatSessionStore {
  heads: ChatSessionHead[]
  pinnedIds: string[]
  activeSessionId: string | null
  historyOpen: boolean
  loading: boolean

  loadForWorkspace: () => Promise<void>
  clear: () => void
  setHistoryOpen: (open: boolean) => void
  toggleHistory: () => void
  switchSession: (sessionId: string) => Promise<void>
  createSession: (options?: {
    seedWelcome?: boolean
    chatMode?: ChatMode
    draftInput?: string
    activate?: boolean
  }) => Promise<string>
  persistActiveSession: () => Promise<void>
  schedulePersist: () => void
  scheduleTitleSummarize: (sessionId?: string) => void
  summarizeSessionTitle: (sessionId: string) => Promise<void>
  setPinned: (sessionId: string, pinned: boolean) => Promise<void>
  setArchived: (sessionId: string, archived: boolean) => Promise<void>
  renameSession: (sessionId: string, title: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  findWithAgent: (query: string) => Promise<void>
  resetForDemo: () => Promise<void>
}

async function restoreRunFlow(activeRunId: string): Promise<void> {
  const { client } = useWorkbenchStore.getState()
  if (!client) return
  try {
    await client.getAgentRun(activeRunId)
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: string }).code
      : null
    if (code === 'run_not_found') {
      useWorkbenchStore.setState({
        activeRunId: null,
        flowStatus: 'idle',
        refineLoading: false,
        runDisposable: null,
      })
      return
    }
    console.error('[chatSessionStore] failed to resolve run before restore', error)
    return
  }

  try {
    const events = await client.getAgentRunEvents(activeRunId)
    if (events.length === 0) return
    useWorkbenchStore.setState((state) => ({
      ...state,
      ...applyRunEventsToState(state, events),
      activeRunId,
    }))
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: string }).code
      : null
    if (code === 'run_not_found') {
      useWorkbenchStore.setState({
        activeRunId: null,
        flowStatus: 'idle',
        refineLoading: false,
        runDisposable: null,
      })
      return
    }
    console.error('[chatSessionStore] failed to restore run flow', error)
  }
}

function applySessionToWorkbench(record: ChatSessionRecord): void {
  const hydrated = hydrateChatSessionState(record)
  useWorkbenchStore.setState({
    messages: hydrated.messages,
    composerDraft: hydrated.composerDraft,
    chatMode: hydrated.chatMode,
    pendingRefinement: hydrated.pendingRefinement,
    refinementConfirmed: hydrated.refinementConfirmed,
    pendingPlan: hydrated.pendingPlan,
    planConfirmed: hydrated.planConfirmed,
    latestAskTrace: hydrated.latestAskTrace,
    latestPlanTrace: hydrated.latestPlanTrace,
    debugSession: hydrated.debugSession,
    agentFlowSubject: hydrated.agentFlowSubject,
    flowStatus: hydrated.flowStatus,
    activeRunId: hydrated.activeRunId,
    flowSteps: [],
    flowActions: [],
    flowDelegationEvents: [],
    delegatedRunTraces: {},
    flowTransientTraces: [],
    flowCorrections: [],
    diffReady: false,
    generatedDiff: null,
    applyResult: null,
    verificationResult: null,
    refineLoading: false,
  })
  if (hydrated.activeRunId) {
    void restoreRunFlow(hydrated.activeRunId)
  }
}

export const useChatSessionStore = create<ChatSessionStore>((set, get) => ({
  heads: [],
  pinnedIds: [],
  activeSessionId: null,
  historyOpen: false,
  loading: false,

  clear: () => {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    if (titleSummarizeTimer) {
      clearTimeout(titleSummarizeTimer)
      titleSummarizeTimer = null
    }
    set({
      heads: [],
      pinnedIds: [],
      activeSessionId: null,
      historyOpen: false,
      loading: false,
    })
  },

  setHistoryOpen: (open) => set({ historyOpen: open }),

  toggleHistory: () => set((state) => ({ historyOpen: !state.historyOpen })),

  loadForWorkspace: async () => {
    const { client, project, locale } = useWorkbenchStore.getState()
    if (!client || !project) return

    set({ loading: true })
    try {
      let index = await client.getChatSessionIndex(project.projectId)
      let heads = index.heads

      if (heads.length === 0 && resolveClientMode() === 'mock') {
        const fixtures = createSampleChatSessionFixtures(locale)
        for (const record of fixtures) {
          await client.upsertChatSession(project.projectId, record)
        }
        await client.setChatSessionPinned(project.projectId, samplePinnedSessionId(fixtures), true)
        index = await client.getChatSessionIndex(project.projectId)
        heads = index.heads
        const activeId = sampleActiveSessionId(fixtures)
        await client.setLastActiveChatSession(project.projectId, activeId)
        index = { ...index, lastActiveId: activeId }
      }

      if (heads.length === 0) {
        const welcomeRecord: ChatSessionRecord = {
          version: '0.2.0',
          head: {
            id: `chat_${crypto.randomUUID()}`,
            title: '',
            createdAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString(),
            chatMode: 'ask',
            isArchived: false,
            status: 'idle',
          },
          messages: buildWelcomeMessages(locale),
        }
        await client.upsertChatSession(project.projectId, welcomeRecord)
        index = await client.getChatSessionIndex(project.projectId)
        heads = index.heads
        await client.setLastActiveChatSession(project.projectId, welcomeRecord.head.id)
        index = { ...index, lastActiveId: welcomeRecord.head.id }
      }

      const activeId =
        index.lastActiveId && heads.some((head) => head.id === index.lastActiveId)
          ? index.lastActiveId
          : heads[0]?.id ?? null

      set({
        heads,
        pinnedIds: index.pinnedIds,
        activeSessionId: activeId,
        loading: false,
      })

      if (activeId) {
        const record = await client.getChatSession(project.projectId, activeId)
        if (record) applySessionToWorkbench(record)
      }
    } catch (error) {
      console.error('[chatSessionStore] failed to load sessions', error)
      set({ loading: false })
    }
  },

  persistActiveSession: async () => {
    const { client, project } = useWorkbenchStore.getState()
    const { activeSessionId, heads } = get()
    if (!client || !project || !activeSessionId) return

    const workbench = useWorkbenchStore.getState()
    const existingHead = heads.find((head) => head.id === activeSessionId)
    const record = buildChatSessionRecord(workbench, activeSessionId, existingHead)
    await client.upsertChatSession(project.projectId, record)
    await client.setLastActiveChatSession(project.projectId, activeSessionId)

    const index = await client.getChatSessionIndex(project.projectId)
    set({
      heads: index.heads,
      pinnedIds: index.pinnedIds,
      activeSessionId,
    })
  },

  schedulePersist: () => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      void get().persistActiveSession()
    }, PERSIST_DEBOUNCE_MS)
  },

  scheduleTitleSummarize: (sessionId) => {
    const targetSessionId = sessionId ?? get().activeSessionId
    if (!targetSessionId) return

    if (titleSummarizeTimer) clearTimeout(titleSummarizeTimer)
    titleSummarizeTimer = setTimeout(() => {
      titleSummarizeTimer = null
      void get().summarizeSessionTitle(targetSessionId)
    }, TITLE_SUMMARIZE_DEBOUNCE_MS)
  },

  summarizeSessionTitle: async (sessionId) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return

    const head = get().heads.find((item) => item.id === sessionId)
    if (head && resolveChatSessionTitleSource(head.titleSource) === 'manual') return

    try {
      const updatedHead = await client.summarizeChatSessionTitle(project.projectId, sessionId)
      if (!updatedHead) return

      set((state) => ({
        heads: state.heads.map((item) =>
          item.id === sessionId ? updatedHead : item,
        ),
      }))
    } catch (error) {
      console.error('[chatSessionStore] failed to summarize session title', error)
    }
  },

  switchSession: async (sessionId) => {
    if (sessionId === get().activeSessionId) {
      set({ historyOpen: false })
      return
    }

    await get().persistActiveSession()

    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return

    const record = await client.getChatSession(project.projectId, sessionId)
    if (!record) return

    applySessionToWorkbench(record)
    await client.setLastActiveChatSession(project.projectId, sessionId)

    const index = await client.getChatSessionIndex(project.projectId)
    set({
      activeSessionId: sessionId,
      heads: index.heads,
      pinnedIds: index.pinnedIds,
      historyOpen: false,
    })
  },

  createSession: async (options = {}) => {
    const { seedWelcome = true, chatMode = 'ask', draftInput = '', activate = true } = options
    await get().persistActiveSession()

    const { client, project, locale } = useWorkbenchStore.getState()
    if (!client || !project) return ''

    const now = new Date().toISOString()
    const sessionId = `chat_${crypto.randomUUID()}`
    const record: ChatSessionRecord = {
      version: '0.2.0',
      head: {
        id: sessionId,
        title: '',
        createdAt: now,
        lastUpdatedAt: now,
        chatMode,
        isArchived: false,
        status: 'idle',
      },
      messages: seedWelcome ? buildWelcomeMessages(locale) : [],
      draftComposer: emptyComposerDraft(draftInput),
    }

    await client.upsertChatSession(project.projectId, record)

    const index = await client.getChatSessionIndex(project.projectId)
    set({
      heads: index.heads,
      pinnedIds: index.pinnedIds,
      activeSessionId: sessionId,
      historyOpen: false,
    })

    if (activate) {
      applySessionToWorkbench(record)
      await client.setLastActiveChatSession(project.projectId, sessionId)
    }

    return sessionId
  },

  setPinned: async (sessionId, pinned) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return
    const index = await client.setChatSessionPinned(project.projectId, sessionId, pinned)
    set({ heads: index.heads, pinnedIds: index.pinnedIds })
  },

  setArchived: async (sessionId, archived) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return

    const wasActive = get().activeSessionId === sessionId
    await client.setChatSessionArchived(project.projectId, sessionId, archived)
    const index = await client.getChatSessionIndex(project.projectId)

    if (wasActive && archived) {
      const nextId = index.heads.find((head) => !head.isArchived)?.id
      if (nextId) {
        await get().switchSession(nextId)
        return
      }
    }

    set({ heads: index.heads, pinnedIds: index.pinnedIds })
  },

  renameSession: async (sessionId, title) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return
    await client.renameChatSession(project.projectId, sessionId, title)
    const index = await client.getChatSessionIndex(project.projectId)
    set({ heads: index.heads })
  },

  deleteSession: async (sessionId) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return

    const wasActive = get().activeSessionId === sessionId
    await client.deleteChatSession(project.projectId, sessionId)
    const index = await client.getChatSessionIndex(project.projectId)
    set({ heads: index.heads, pinnedIds: index.pinnedIds })

    if (wasActive) {
      const nextId = index.heads.find((head) => !head.isArchived)?.id ?? index.heads[0]?.id
      if (nextId) {
        set({ activeSessionId: nextId })
        const record = await client.getChatSession(project.projectId, nextId)
        if (record) applySessionToWorkbench(record)
      } else {
        await get().createSession({ seedWelcome: true })
      }
    }
  },

  findWithAgent: async (query) => {
    const trimmed = query.trim()
    if (!trimmed) return
    set({ historyOpen: false })
    await get().createSession({ seedWelcome: false, chatMode: 'change', draftInput: trimmed })
    useWorkbenchStore.setState({ rightPanelTab: 'chat', rightPanelOpen: true })
    requestAnimationFrame(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>(
        '[data-tour="chat-panel"] textarea',
      )
      textarea?.focus()
    })
  },

  resetForDemo: async () => {
    const { client, project, locale } = useWorkbenchStore.getState()
    if (!client || !project) return

    const index = await client.getChatSessionIndex(project.projectId)
    for (const head of index.heads) {
      await client.deleteChatSession(project.projectId, head.id)
    }

    const sessionId = `chat_${crypto.randomUUID()}`
    const record: ChatSessionRecord = {
      version: '0.2.0',
      head: {
        id: sessionId,
        title: '',
        createdAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        chatMode: 'ask',
        isArchived: false,
        status: 'idle',
      },
      messages: buildResetMessages(locale),
      draftComposer: emptyComposerDraft(),
    }
    await client.upsertChatSession(project.projectId, record)
    await client.setLastActiveChatSession(project.projectId, sessionId)

    const nextIndex = await client.getChatSessionIndex(project.projectId)
    set({
      heads: nextIndex.heads,
      pinnedIds: nextIndex.pinnedIds,
      activeSessionId: sessionId,
      historyOpen: false,
    })
    applySessionToWorkbench(record)
  },
}))
