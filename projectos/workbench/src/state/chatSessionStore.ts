import type {
  ChatSessionHead,
  ChatSessionRecord,
  SessionContextDigest,
  SessionGraphPlacement,
} from '@contracts/index'
import {
  demoteChatSessionToMisc,
  emptyComposerDraft,
  extractSubtreeToNewGraph,
  mergeSessionGraphs,
  placeChatSessionOnGraph,
} from '@contracts/index'
import { create } from 'zustand'
import { resolveClientMode } from '../data/clientMode'
import {
  createSampleChatSessionFixtures,
  sampleActiveSessionId,
  samplePinnedSessionId,
} from '../fixtures/sampleChatSessions'
import { getStoreMessage } from '../i18n/storeMessages'
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
/** Legacy keys — overlays must not auto-restore; clear on boot / project open. */
const CANVAS_OVERLAY_KEY = 'projectos_canvas_overlay'
const SESSION_GRAPH_OPEN_KEY = 'projectos_session_graph_open'

export type CanvasOverlay =
  | 'none'
  | 'session'
  | 'loop'
  | 'spatial'
  | 'agent-flow'
  | 'github'
  | 'marketplace'

/** Suppresses auto-open while a run id is not known yet (Ask / Plan still starting). */
const AGENT_FLOW_DISMISS_IDLE = '__agent_flow_idle__'

/**
 * Center GraphOverlayFrame panels are session-ephemeral: C4 is the default
 * center surface until the user (or an in-session run) opens an overlay.
 * Never restore a previous overlay from localStorage on boot / project open.
 */
function clearPersistedCanvasOverlay(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(CANVAS_OVERLAY_KEY)
    localStorage.removeItem(SESSION_GRAPH_OPEN_KEY)
  } catch {
    /* ignore quota and private-mode failures */
  }
}

clearPersistedCanvasOverlay()

let persistTimer: ReturnType<typeof setTimeout> | null = null
let titleSummarizeTimer: ReturnType<typeof setTimeout> | null = null

interface ChatSessionStore {
  heads: ChatSessionHead[]
  pinnedIds: string[]
  activeSessionId: string | null
  historyOpen: boolean
  canvasOverlay: CanvasOverlay
  /** Derived: canvasOverlay === 'session' (kept for existing callers). */
  sessionGraphOpen: boolean
  loopGraphOpen: boolean
  spatialCaptureOpen: boolean
  agentFlowOpen: boolean
  githubGraphOpen: boolean
  marketplaceOpen: boolean
  /** Run id the user hid for this round. Auto-open skips that id until a new present. */
  agentFlowDismissedRunId: string | null
  inheritedDigest: SessionContextDigest | null
  loading: boolean

  loadForWorkspace: () => Promise<void>
  clear: () => void
  setHistoryOpen: (open: boolean) => void
  toggleHistory: () => void
  setCanvasOverlay: (overlay: CanvasOverlay) => void
  setSessionGraphOpen: (open: boolean) => void
  toggleSessionGraph: () => void
  setLoopGraphOpen: (open: boolean) => void
  toggleLoopGraph: () => void
  setSpatialCaptureOpen: (open: boolean) => void
  toggleSpatialCapture: () => void
  setAgentFlowOpen: (open: boolean) => void
  toggleAgentFlow: () => void
  setGithubGraphOpen: (open: boolean) => void
  toggleGithubGraph: () => void
  setMarketplaceOpen: (open: boolean) => void
  toggleMarketplace: () => void
  /** User or command asked to see Agent Flow. Clears a previous dismiss. */
  presentAgentFlow: () => void
  /** Live run start. Stays closed when the user already dismissed this run. */
  openAgentFlowForRun: (runId: string | null) => void
  /** Close the Agent Flow card. A busy run will not auto-open again. */
  closeAgentFlow: () => void
  switchSession: (sessionId: string) => Promise<void>
  createSession: (options?: {
    seedWelcome?: boolean
    chatMode?: ChatMode
    draftInput?: string
    activate?: boolean
    /** Provisional title (e.g. mode name when switching modes). */
    title?: string
  }) => Promise<string>
  persistActiveSession: () => Promise<void>
  schedulePersist: () => void
  scheduleTitleSummarize: (sessionId?: string) => void
  summarizeSessionTitle: (sessionId: string) => Promise<void>
  setPinned: (sessionId: string, pinned: boolean) => Promise<void>
  setArchived: (sessionId: string, archived: boolean) => Promise<void>
  renameSession: (sessionId: string, title: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<boolean>
  forkSession: (parentSessionId: string, forkMessageId?: string) => Promise<string | null>
  setSessionClassification: (
    sessionId: string,
    classification: 'topic' | 'misc',
  ) => Promise<void>
  /** Promote/demote with explicit graph placement (independent root, no parent). */
  placeSessionOnGraph: (
    sessionId: string,
    placement: SessionGraphPlacement | { mode: 'misc' },
  ) => Promise<ChatSessionHead | null>
  /** Extract a canvas node and its full subtree onto a brand-new graph. */
  extractSubtreeToGraph: (rootSessionId: string) => Promise<{
    newGraphId: string
    movedIds: string[]
  } | null>
  /** Merge every session from one graph into another. */
  mergeGraphs: (fromGraphId: string, toGraphId: string) => Promise<boolean>
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
  useChatSessionStore.setState({
    inheritedDigest: record.inheritedDigest ?? null,
  })
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
    activeCustomModeSkillId: hydrated.activeCustomModeSkillId,
    customModePreviousChatMode: hydrated.customModePreviousChatMode,
    conversationCheckpoints: hydrated.conversationCheckpoints,
    latestContextAssembly: hydrated.latestContextAssembly,
    flowSteps: [],
    flowActions: [],
    flowDelegationEvents: [],
    delegatedRunTraces: {},
    flowTransientTraces: [],
    flowCorrections: [],
    executionOverlay: null,
    liveGraphFocusTaskId: null,
    liveGraphPausedRunId: null,
    diffReady: false,
    generatedDiff: null,
    applyResult: null,
    verificationResult: null,
    refineLoading: false,
  })
  // Restore run evidence into the store, but do not open the Agent Flow overlay.
  // Project open / session hydrate must land on Function Map (C4); overlays open
  // only via explicit user action or a newly started in-session run.
  if (hydrated.activeRunId) {
    void restoreRunFlow(hydrated.activeRunId)
  }
}

function overlayState(overlay: CanvasOverlay) {
  return {
    canvasOverlay: overlay,
    sessionGraphOpen: overlay === 'session',
    loopGraphOpen: overlay === 'loop',
    spatialCaptureOpen: overlay === 'spatial',
    agentFlowOpen: overlay === 'agent-flow',
    githubGraphOpen: overlay === 'github',
    marketplaceOpen: overlay === 'marketplace',
  }
}

export const useChatSessionStore = create<ChatSessionStore>((set, get) => ({
  heads: [],
  pinnedIds: [],
  activeSessionId: null,
  historyOpen: false,
  ...overlayState('none'),
  agentFlowDismissedRunId: null,
  inheritedDigest: null,
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
    clearPersistedCanvasOverlay()
    set({
      heads: [],
      pinnedIds: [],
      activeSessionId: null,
      historyOpen: false,
      inheritedDigest: null,
      loading: false,
      ...overlayState('none'),
    })
  },

  setHistoryOpen: (open) => set({ historyOpen: open }),

  toggleHistory: () => set((state) => ({ historyOpen: !state.historyOpen })),

  setCanvasOverlay: (overlay) => {
    set(overlayState(overlay))
  },

  setSessionGraphOpen: (open) => {
    set(overlayState(open ? 'session' : 'none'))
  },

  toggleSessionGraph: () => {
    set(overlayState(get().canvasOverlay === 'session' ? 'none' : 'session'))
  },

  setLoopGraphOpen: (open) => {
    set(overlayState(open ? 'loop' : 'none'))
  },

  toggleLoopGraph: () => {
    set(overlayState(get().canvasOverlay === 'loop' ? 'none' : 'loop'))
  },

  setGithubGraphOpen: (open) => {
    set(overlayState(open ? 'github' : 'none'))
  },

  toggleGithubGraph: () => {
    set(overlayState(get().canvasOverlay === 'github' ? 'none' : 'github'))
  },

  setMarketplaceOpen: (open) => {
    set(overlayState(open ? 'marketplace' : 'none'))
  },

  toggleMarketplace: () => {
    set(overlayState(get().canvasOverlay === 'marketplace' ? 'none' : 'marketplace'))
  },

  setSpatialCaptureOpen: (open) => {
    set(overlayState(open ? 'spatial' : 'none'))
  },

  toggleSpatialCapture: () => {
    set(overlayState(get().canvasOverlay === 'spatial' ? 'none' : 'spatial'))
  },

  setAgentFlowOpen: (open) => {
    if (open) get().presentAgentFlow()
    else get().closeAgentFlow()
  },

  toggleAgentFlow: () => {
    if (get().canvasOverlay === 'agent-flow') get().closeAgentFlow()
    else get().presentAgentFlow()
  },

  presentAgentFlow: () => {
    set({ ...overlayState('agent-flow'), agentFlowDismissedRunId: null })
  },

  openAgentFlowForRun: (runId) => {
    const dismissed = get().agentFlowDismissedRunId
    if (runId && dismissed === runId) return
    if (!runId && dismissed === AGENT_FLOW_DISMISS_IDLE) return
    set(overlayState('agent-flow'))
  },

  closeAgentFlow: () => {
    if (get().canvasOverlay !== 'agent-flow') return
    const workbench = useWorkbenchStore.getState()
    const busy = workbench.flowStatus === 'running' || workbench.refineLoading
    const token = busy ? (workbench.activeRunId ?? AGENT_FLOW_DISMISS_IDLE) : null
    set({
      ...overlayState('none'),
      ...(token ? { agentFlowDismissedRunId: token } : {}),
    })
  },

  loadForWorkspace: async () => {
    const { client, project, locale } = useWorkbenchStore.getState()
    if (!client || !project) return

    // Project open always lands on C4; overlays only after explicit user/run open.
    clearPersistedCanvasOverlay()
    set({ loading: true, ...overlayState('none') })
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
            classification: 'misc',
            classificationSource: 'auto',
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

      // Hard guarantee: opening a project never leaves a center overlay up.
      clearPersistedCanvasOverlay()
      set({ ...overlayState('none') })
    } catch (error) {
      console.error('[chatSessionStore] failed to load sessions', error)
      clearPersistedCanvasOverlay()
      set({ loading: false, ...overlayState('none') })
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
    const {
      seedWelcome = true,
      chatMode = 'ask',
      draftInput = '',
      activate = true,
      title = '',
    } = options
    await get().persistActiveSession()

    const { client, project, locale } = useWorkbenchStore.getState()
    if (!client || !project) return ''

    const now = new Date().toISOString()
    const sessionId = `chat_${crypto.randomUUID()}`
    const record: ChatSessionRecord = {
      version: '0.2.0',
      head: {
        id: sessionId,
        title,
        createdAt: now,
        lastUpdatedAt: now,
        chatMode,
        isArchived: false,
        status: 'idle',
        classification: 'misc',
        classificationSource: 'auto',
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
    const { client, project, locale, pushToast } = useWorkbenchStore.getState()
    if (!client || !project) return false

    const deleted = await client.deleteChatSession(project.projectId, sessionId)
    if (!deleted) {
      pushToast({
        type: 'warning',
        message: getStoreMessage(locale, 'chat.sessionGraph.deleteBlocked'),
      })
      return false
    }

    const wasActive = get().activeSessionId === sessionId
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
    return true
  },

  forkSession: async (parentSessionId, forkMessageId) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return null
    await get().persistActiveSession()
    const child = await client.forkChatSession(
      project.projectId,
      parentSessionId,
      forkMessageId ?? '',
    )
    if (!child) return null
    // Refresh heads immediately so Session Graph can draw the parent→child edge
    // before switchSession finishes its persist/load round-trip.
    const index = await client.getChatSessionIndex(project.projectId)
    set({ heads: index.heads, pinnedIds: index.pinnedIds })
    await get().switchSession(child.head.id)
    return child.head.id
  },

  setSessionClassification: async (sessionId, classification) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return
    await client.setChatSessionClassification(project.projectId, sessionId, classification)
    const index = await client.getChatSessionIndex(project.projectId)
    set({ heads: index.heads, pinnedIds: index.pinnedIds })
  },

  placeSessionOnGraph: async (sessionId, placement) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return null
    const record = await client.getChatSession(project.projectId, sessionId)
    if (!record) return null
    const nextHead =
      placement.mode === 'misc'
        ? demoteChatSessionToMisc(record.head)
        : placeChatSessionOnGraph(record.head, placement)
    await client.upsertChatSession(project.projectId, { ...record, head: nextHead })
    const index = await client.getChatSessionIndex(project.projectId)
    set({ heads: index.heads, pinnedIds: index.pinnedIds })
    return nextHead
  },

  extractSubtreeToGraph: async (rootSessionId) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return null
    const { heads: nextHeads, newGraphId, movedIds } = extractSubtreeToNewGraph(
      get().heads,
      rootSessionId,
    )
    const byId = new Map(nextHeads.map((head) => [head.id, head]))
    for (const id of movedIds) {
      const nextHead = byId.get(id)
      if (!nextHead) continue
      const record = await client.getChatSession(project.projectId, id)
      if (!record) continue
      await client.upsertChatSession(project.projectId, { ...record, head: nextHead })
    }
    const index = await client.getChatSessionIndex(project.projectId)
    set({ heads: index.heads, pinnedIds: index.pinnedIds })
    return { newGraphId, movedIds }
  },

  mergeGraphs: async (fromGraphId, toGraphId) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project || fromGraphId === toGraphId) return false
    const prevHeads = get().heads
    const nextHeads = mergeSessionGraphs(prevHeads, fromGraphId, toGraphId)
    for (let i = 0; i < nextHeads.length; i += 1) {
      const nextHead = nextHeads[i]
      const prevHead = prevHeads[i]
      if (!nextHead || nextHead === prevHead) continue
      const record = await client.getChatSession(project.projectId, nextHead.id)
      if (!record) continue
      await client.upsertChatSession(project.projectId, { ...record, head: nextHead })
    }
    const index = await client.getChatSessionIndex(project.projectId)
    set({ heads: index.heads, pinnedIds: index.pinnedIds })
    return true
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
        classification: 'misc',
        classificationSource: 'auto',
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
