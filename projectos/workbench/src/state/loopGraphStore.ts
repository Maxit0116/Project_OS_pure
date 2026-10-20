import type {
  IntentEdgeKind,
  IntentEdgePort,
  IntentGraph,
  IntentGraphEdge,
  IntentGraphNode,
  LoopComposerMode,
  LoopCompileResult,
  LoopGoalClarificationAnswer,
  LoopGraphDocument,
  LoopGraphHead,
  LoopSpec,
} from '@contracts/index'
import {
  getIntentGraphCompileIssues,
  isIntentGraphReadyForCompile,
  suggestIntentEdgeKind,
} from '@contracts/index'
import { create } from 'zustand'
import { useChatSessionStore } from './chatSessionStore'
import {
  buildLoopAuthoringPromptFromMessages,
  findLoopAuthoringTarget,
  newLoopEntityId,
  type LoopAuthoringTarget,
} from './loopAuthoring'
import { useWorkbenchStore } from './workbenchStore'

const PERSIST_DEBOUNCE_MS = 400
const UNTITLED_NODE = 'Untitled'

export type LoopPhase = 'draw' | 'review' | 'run'

/** Mutual-exclusive bookmark sheet above the goal composer. */
export type LoopComposerSheet = 'none' | 'flow' | 'context'

export type LoopDeleteTarget =
  | { type: 'node'; id: string }
  | { type: 'edge'; id: string }

interface LoopGraphStore {
  heads: LoopGraphHead[]
  activeLoopId: string | null
  document: LoopGraphDocument | null
  phase: LoopPhase
  compileResult: LoopCompileResult | null
  loading: boolean
  saving: boolean
  error: string | null
  connectingFromId: string | null
  pendingDelete: LoopDeleteTarget | null
  applying: boolean
  composerDraft: string
  composerSheet: LoopComposerSheet
  authoringBusy: boolean

  loadForWorkspace: () => Promise<void>
  clear: () => void
  setPhase: (phase: LoopPhase) => void
  selectLoop: (loopId: string) => Promise<void>
  createLoop: (title?: string) => Promise<string | null>
  updateDraft: (draft: IntentGraph, title?: string) => void
  schedulePersist: () => void
  persistNow: () => Promise<void>
  setConnectingFrom: (nodeId: string | null) => void
  setPendingDelete: (target: LoopDeleteTarget | null) => void
  setComposerDraft: (value: string) => void
  /** Open a sheet, or collapse it if already open (bookmark toggle). */
  toggleComposerSheet: (sheet: 'flow' | 'context') => void
  setComposerSheet: (sheet: LoopComposerSheet) => void
  setComposerMode: (mode: LoopComposerMode) => Promise<void>
  sendAuthoringTurn: () => Promise<void>
  answerGoalClarification: (answers: LoopGoalClarificationAnswer[]) => Promise<void>
  confirmGoalContext: () => Promise<void>
  acceptGraphEditOffer: () => Promise<void>
  dismissGraphEditOffer: () => Promise<void>
  undoDraft: () => Promise<void>
  beginAuthorNode: (position: { x: number; y: number }) => Promise<string | null>
  beginAuthorEdge: (
    source: string,
    target: string,
    ports?: { sourcePort?: IntentEdgePort; targetPort?: IntentEdgePort },
  ) => Promise<string | null>
  applyAuthoringFromActiveSession: (options?: {
    edgeKind?: IntentEdgeKind
  }) => Promise<boolean>
  refineAuthoringTarget: (target: LoopDeleteTarget) => Promise<void>
  removeAuthoringTarget: (target: LoopDeleteTarget) => Promise<void>
  getAuthoringTargetForActiveSession: () => LoopAuthoringTarget | null
  suggestEdgeKindForActiveSession: () => IntentEdgeKind | null
  compile: () => Promise<void>
  approve: (spec?: LoopSpec) => Promise<void>
  startRun: () => Promise<void>
  pauseRun: () => Promise<void>
  resumeRun: () => Promise<void>
  advanceRun: () => Promise<void>
  resolveHitl: (answers: Array<{ questionId: string; answer: string }>) => Promise<void>
  linkActiveSession: () => Promise<void>
  unlinkSession: (sessionId: string) => Promise<void>
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

function patchDraftDocument(
  document: LoopGraphDocument,
  draft: IntentGraph,
): LoopGraphDocument {
  return {
    ...document,
    draft,
    updatedAt: new Date().toISOString(),
  }
}

async function ensureAuthoringSession(): Promise<string | null> {
  const sessionId = await useChatSessionStore
    .getState()
    .createSession({ seedWelcome: false, chatMode: 'ask' })
  useWorkbenchStore.getState().setRightPanelOpen(true)
  return sessionId || null
}

async function archiveAuthoringSession(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return
  await useChatSessionStore.getState().setArchived(sessionId, true)
}

export const useLoopGraphStore = create<LoopGraphStore>((set, get) => ({
  heads: [],
  activeLoopId: null,
  document: null,
  phase: 'draw',
  compileResult: null,
  loading: false,
  saving: false,
  error: null,
  connectingFromId: null,
  pendingDelete: null,
  applying: false,
  composerDraft: '',
  composerSheet: 'none',
  authoringBusy: false,

  clear: () => {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    set({
      heads: [],
      activeLoopId: null,
      document: null,
      phase: 'draw',
      compileResult: null,
      loading: false,
      saving: false,
      error: null,
      connectingFromId: null,
      pendingDelete: null,
      applying: false,
      composerDraft: '',
      composerSheet: 'none',
      authoringBusy: false,
    })
  },

  setPhase: (phase) => set({ phase }),

  setConnectingFrom: (nodeId) => set({ connectingFromId: nodeId }),

  setPendingDelete: (target) => set({ pendingDelete: target }),

  setComposerDraft: (value) => set({ composerDraft: value }),

  setComposerSheet: (sheet) => set({ composerSheet: sheet }),

  toggleComposerSheet: (sheet) =>
    set((state) => ({
      composerSheet: state.composerSheet === sheet ? 'none' : sheet,
    })),

  setComposerMode: async (mode) => {
    const { client, project } = useWorkbenchStore.getState()
    const loopId = get().activeLoopId
    const document = get().document
    if (!client || !project || !loopId || !document) {
      set({ document: document ? { ...document, composerMode: mode } : null })
      return
    }
    try {
      const next = await client.setLoopComposerMode(project.projectId, loopId, mode)
      set({ document: next, error: null })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to set composer mode',
      })
    }
  },

  sendAuthoringTurn: async () => {
    const { client, project } = useWorkbenchStore.getState()
    const loopId = get().activeLoopId
    const text = get().composerDraft.trim()
    const document = get().document
    if (!client || !project || !loopId || !document || !text) return

    const unanswered = document.draftGoalContext?.openQuestions.some((q) => !q.answer?.trim())
    if (document.composerMode === 'ask' && unanswered) {
      set({ error: 'Answer clarifying questions before sending another Ask turn' })
      return
    }

    set({ authoringBusy: true, composerSheet: 'flow', error: null })
    try {
      const next = await client.sendLoopAuthoringTurn(project.projectId, loopId, {
        mode: document.composerMode ?? 'ask',
        text,
      })
      const heads = await client.listLoopGraphs(project.projectId)
      set({
        document: next,
        heads,
        composerDraft: '',
        authoringBusy: false,
        composerSheet: next.composerMode === 'ask' ? 'context' : 'flow',
      })
    } catch (error) {
      set({
        authoringBusy: false,
        error: error instanceof Error ? error.message : 'Authoring turn failed',
      })
    }
  },

  answerGoalClarification: async (answers) => {
    const { client, project } = useWorkbenchStore.getState()
    const loopId = get().activeLoopId
    if (!client || !project || !loopId || answers.length === 0) return
    set({ authoringBusy: true, composerSheet: 'context', error: null })
    try {
      const next = await client.answerLoopGoalClarification(
        project.projectId,
        loopId,
        answers,
      )
      set({ document: next, authoringBusy: false })
    } catch (error) {
      set({
        authoringBusy: false,
        error: error instanceof Error ? error.message : 'Clarification failed',
      })
    }
  },

  confirmGoalContext: async () => {
    const { client, project } = useWorkbenchStore.getState()
    const loopId = get().activeLoopId
    if (!client || !project || !loopId) return
    set({ authoringBusy: true, composerSheet: 'context', error: null })
    try {
      const next = await client.confirmLoopGoalContext(project.projectId, loopId)
      const heads = await client.listLoopGraphs(project.projectId)
      set({ document: next, heads, authoringBusy: false, composerSheet: 'context' })
    } catch (error) {
      set({
        authoringBusy: false,
        error: error instanceof Error ? error.message : 'Confirm failed',
      })
    }
  },

  acceptGraphEditOffer: async () => {
    const { client, project } = useWorkbenchStore.getState()
    const loopId = get().activeLoopId
    if (!client || !project || !loopId) return
    set({ authoringBusy: true, composerSheet: 'flow', error: null })
    try {
      const next = await client.acceptLoopGraphEditOffer(project.projectId, loopId)
      const heads = await client.listLoopGraphs(project.projectId)
      set({ document: next, heads, authoringBusy: false, composerSheet: 'flow' })
    } catch (error) {
      set({
        authoringBusy: false,
        error: error instanceof Error ? error.message : 'Graph edit failed',
      })
    }
  },

  dismissGraphEditOffer: async () => {
    const { client, project } = useWorkbenchStore.getState()
    const loopId = get().activeLoopId
    if (!client || !project || !loopId) return
    try {
      const next = await client.dismissLoopGraphEditOffer(project.projectId, loopId)
      set({ document: next, error: null })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Dismiss failed',
      })
    }
  },

  undoDraft: async () => {
    const { client, project } = useWorkbenchStore.getState()
    const loopId = get().activeLoopId
    if (!client || !project || !loopId) return
    set({ authoringBusy: true, error: null })
    try {
      const next = await client.undoLoopDraft(project.projectId, loopId)
      const heads = await client.listLoopGraphs(project.projectId)
      set({ document: next, heads, authoringBusy: false })
    } catch (error) {
      set({
        authoringBusy: false,
        error: error instanceof Error ? error.message : 'Undo failed',
      })
    }
  },

  getAuthoringTargetForActiveSession: () => {
    const sessionId = useChatSessionStore.getState().activeSessionId
    return findLoopAuthoringTarget(get().document?.draft, sessionId)
  },

  suggestEdgeKindForActiveSession: () => {
    const target = get().getAuthoringTargetForActiveSession()
    const draft = get().document?.draft
    if (!target || target.type !== 'edge' || !draft) return null
    const edge = draft.edges.find((item) => item.id === target.id)
    if (!edge) return null
    return suggestIntentEdgeKind(edge, draft.nodes)
  },


  loadForWorkspace: async () => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return
    set({ loading: true, error: null })
    try {
      const index = await client.getLoopGraphIndex(project.projectId)
      const activeId = index.lastActiveId ?? index.heads[0]?.id ?? null
      const document = activeId
        ? await client.getLoopGraph(project.projectId, activeId)
        : null
      set({
        heads: index.heads,
        activeLoopId: activeId,
        document,
        compileResult: document?.pendingCompile
          ? {
              specDraft: document.pendingCompile.specDraft,
              assumptions: document.pendingCompile.assumptions,
              cycleGates: document.pendingCompile.cycleGates,
            }
          : null,
        phase: document?.pendingCompile
          ? 'review'
          : document?.approvedSpecs.length
            ? 'run'
            : 'draw',
        loading: false,
      })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load loop graphs',
      })
    }
  },

  selectLoop: async (loopId) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return
    set({ loading: true, error: null })
    try {
      await client.setLastActiveLoopGraph(project.projectId, loopId)
      const document = await client.getLoopGraph(project.projectId, loopId)
      const heads = await client.listLoopGraphs(project.projectId)
      set({
        activeLoopId: loopId,
        document,
        heads,
        compileResult: document?.pendingCompile
          ? {
              specDraft: document.pendingCompile.specDraft,
              assumptions: document.pendingCompile.assumptions,
              cycleGates: document.pendingCompile.cycleGates,
            }
          : null,
        loading: false,
        phase: 'draw',
        connectingFromId: null,
        pendingDelete: null,
        composerDraft: '',
        composerSheet: 'none',
        authoringBusy: false,
      })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to open loop',
      })
    }
  },

  createLoop: async (title) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return null
    try {
      const document = await client.createLoopGraph(project.projectId, title)
      await client.setLastActiveLoopGraph(project.projectId, document.id)
      const heads = await client.listLoopGraphs(project.projectId)
      set({
        document,
        activeLoopId: document.id,
        heads,
        compileResult: null,
        phase: 'draw',
        error: null,
        connectingFromId: null,
        pendingDelete: null,
        composerDraft: '',
        composerSheet: 'none',
        authoringBusy: false,
      })
      return document.id
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create loop',
      })
      return null
    }
  },

  updateDraft: (draft, title) => {
    const current = get().document
    if (!current) return
    set({
      document: {
        ...current,
        title: title?.trim() || current.title,
        draft,
        updatedAt: new Date().toISOString(),
      },
    })
    get().schedulePersist()
  },

  schedulePersist: () => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      void get().persistNow()
    }, PERSIST_DEBOUNCE_MS)
  },

  persistNow: async () => {
    const { client, project } = useWorkbenchStore.getState()
    const document = get().document
    if (!client || !project || !document) return
    set({ saving: true })
    try {
      const saved = await client.upsertLoopGraph(project.projectId, document)
      const heads = await client.listLoopGraphs(project.projectId)
      set({ document: saved, heads, saving: false, error: null })
    } catch (error) {
      set({
        saving: false,
        error: error instanceof Error ? error.message : 'Failed to save loop',
      })
    }
  },

  beginAuthorNode: async (position) => {
    const current = get().document
    if (!current) return null
    const sessionId = await ensureAuthoringSession()
    if (!sessionId) return null

    const node: IntentGraphNode = {
      id: newLoopEntityId('node'),
      title: UNTITLED_NODE,
      prompt: '',
      position,
      authoringSessionId: sessionId,
    }
    const draft: IntentGraph = {
      ...current.draft,
      revision: current.draft.revision + 1,
      nodes: [...current.draft.nodes, node],
    }
    const linkedSessionIds = current.linkedSessionIds.includes(sessionId)
      ? current.linkedSessionIds
      : [...current.linkedSessionIds, sessionId].slice(0, 20)

    set({
      document: {
        ...patchDraftDocument(current, draft),
        linkedSessionIds,
      },
      connectingFromId: null,
      error: null,
    })
    get().schedulePersist()
    return node.id
  },

  beginAuthorEdge: async (source, target, ports) => {
    const current = get().document
    if (!current || source === target) return null
    if (current.draft.edges.some((edge) => edge.source === source && edge.target === target)) {
      set({ connectingFromId: null })
      return null
    }

    const sessionId = await ensureAuthoringSession()
    if (!sessionId) return null

    const edge: IntentGraphEdge = {
      id: newLoopEntityId('edge'),
      source,
      target,
      ...(ports?.sourcePort ? { sourcePort: ports.sourcePort } : {}),
      ...(ports?.targetPort ? { targetPort: ports.targetPort } : {}),
      authoringSessionId: sessionId,
    }
    const draft: IntentGraph = {
      ...current.draft,
      revision: current.draft.revision + 1,
      edges: [...current.draft.edges, edge],
    }
    const linkedSessionIds = current.linkedSessionIds.includes(sessionId)
      ? current.linkedSessionIds
      : [...current.linkedSessionIds, sessionId].slice(0, 20)

    set({
      document: {
        ...patchDraftDocument(current, draft),
        linkedSessionIds,
      },
      connectingFromId: null,
      error: null,
    })
    get().schedulePersist()
    return edge.id
  },

  applyAuthoringFromActiveSession: async (options = {}) => {
    const { client, project } = useWorkbenchStore.getState()
    const current = get().document
    if (!client || !project || !current) return false

    const sessionId = useChatSessionStore.getState().activeSessionId
    const target = findLoopAuthoringTarget(current.draft, sessionId)
    if (!sessionId || !target) {
      set({ error: 'No loop authoring target for the active session' })
      return false
    }

    set({ applying: true, error: null })
    try {
      const record = await client.getChatSession(project.projectId, sessionId)
      if (!record) {
        set({ applying: false, error: 'Authoring session not found' })
        return false
      }

      await useChatSessionStore.getState().summarizeSessionTitle(sessionId)
      const heads = useChatSessionStore.getState().heads
      const head = heads.find((item) => item.id === sessionId)
      const title =
        head?.title?.trim() ||
        (target.type === 'node' ? UNTITLED_NODE : 'Connection')

      if (target.type === 'node') {
        const prompt = buildLoopAuthoringPromptFromMessages(
          record.messages,
          4000,
          head?.responsibility ?? record.contextDigest?.responsibility,
        )
        if (!prompt.trim()) {
          set({ applying: false, error: 'Chat the node responsibilities before applying' })
          return false
        }
        const draft: IntentGraph = {
          ...current.draft,
          revision: current.draft.revision + 1,
          nodes: current.draft.nodes.map((node) =>
            node.id === target.id
              ? {
                  ...node,
                  title: title.slice(0, 120) || UNTITLED_NODE,
                  prompt,
                }
              : node,
          ),
        }
        set({ document: patchDraftDocument(current, draft), applying: false })
        get().schedulePersist()
        return true
      }

      const prompt = buildLoopAuthoringPromptFromMessages(
        record.messages,
        2000,
        head?.responsibility ?? record.contextDigest?.responsibility,
      )
      if (!prompt.trim()) {
        set({ applying: false, error: 'Chat the connection purpose before applying' })
        return false
      }
      const edge = current.draft.edges.find((item) => item.id === target.id)
      if (!edge) {
        set({ applying: false, error: 'Edge not found' })
        return false
      }
      const kind =
        options.edgeKind ??
        suggestIntentEdgeKind(edge, current.draft.nodes)
      const draft: IntentGraph = {
        ...current.draft,
        revision: current.draft.revision + 1,
        edges: current.draft.edges.map((item) =>
          item.id === target.id ? { ...item, prompt, kind } : item,
        ),
      }
      set({ document: patchDraftDocument(current, draft), applying: false })
      get().schedulePersist()
      return true
    } catch (error) {
      set({
        applying: false,
        error: error instanceof Error ? error.message : 'Failed to apply authoring',
      })
      return false
    }
  },

  refineAuthoringTarget: async (target) => {
    const current = get().document
    if (!current) return
    const chat = useChatSessionStore.getState()

    if (target.type === 'node') {
      const node = current.draft.nodes.find((item) => item.id === target.id)
      if (!node) return
      let sessionId = node.authoringSessionId
      if (!sessionId) {
        sessionId = (await ensureAuthoringSession()) ?? undefined
        if (!sessionId) return
        const draft: IntentGraph = {
          ...current.draft,
          revision: current.draft.revision + 1,
          nodes: current.draft.nodes.map((item) =>
            item.id === node.id ? { ...item, authoringSessionId: sessionId } : item,
          ),
        }
        const linkedSessionIds = current.linkedSessionIds.includes(sessionId)
          ? current.linkedSessionIds
          : [...current.linkedSessionIds, sessionId].slice(0, 20)
        set({
          document: {
            ...patchDraftDocument(current, draft),
            linkedSessionIds,
          },
          pendingDelete: null,
        })
        get().schedulePersist()
      } else {
        await chat.switchSession(sessionId)
        useWorkbenchStore.getState().setRightPanelOpen(true)
        set({ pendingDelete: null })
      }
      return
    }

    const edge = current.draft.edges.find((item) => item.id === target.id)
    if (!edge) return
    let sessionId = edge.authoringSessionId
    if (!sessionId) {
      sessionId = (await ensureAuthoringSession()) ?? undefined
      if (!sessionId) return
      const draft: IntentGraph = {
        ...current.draft,
        revision: current.draft.revision + 1,
        edges: current.draft.edges.map((item) =>
          item.id === edge.id ? { ...item, authoringSessionId: sessionId } : item,
        ),
      }
      const linkedSessionIds = current.linkedSessionIds.includes(sessionId)
        ? current.linkedSessionIds
        : [...current.linkedSessionIds, sessionId].slice(0, 20)
      set({
        document: {
          ...patchDraftDocument(current, draft),
          linkedSessionIds,
        },
        pendingDelete: null,
      })
      get().schedulePersist()
    } else {
      await chat.switchSession(sessionId)
      useWorkbenchStore.getState().setRightPanelOpen(true)
      set({ pendingDelete: null })
    }
  },

  removeAuthoringTarget: async (target) => {
    const current = get().document
    if (!current) return

    if (target.type === 'node') {
      const node = current.draft.nodes.find((item) => item.id === target.id)
      const sessionId = node?.authoringSessionId
      const draft: IntentGraph = {
        ...current.draft,
        revision: current.draft.revision + 1,
        nodes: current.draft.nodes.filter((item) => item.id !== target.id),
        edges: current.draft.edges.filter(
          (edge) => edge.source !== target.id && edge.target !== target.id,
        ),
      }
      const linkedSessionIds = sessionId
        ? current.linkedSessionIds.filter((id) => id !== sessionId)
        : current.linkedSessionIds
      set({
        document: {
          ...patchDraftDocument(current, draft),
          linkedSessionIds,
        },
        pendingDelete: null,
        connectingFromId:
          get().connectingFromId === target.id ? null : get().connectingFromId,
      })
      get().schedulePersist()
      await archiveAuthoringSession(sessionId)
      return
    }

    const edge = current.draft.edges.find((item) => item.id === target.id)
    const sessionId = edge?.authoringSessionId
    const draft: IntentGraph = {
      ...current.draft,
      revision: current.draft.revision + 1,
      edges: current.draft.edges.filter((item) => item.id !== target.id),
    }
    const linkedSessionIds = sessionId
      ? current.linkedSessionIds.filter((id) => id !== sessionId)
      : current.linkedSessionIds
    set({
      document: {
        ...patchDraftDocument(current, draft),
        linkedSessionIds,
      },
      pendingDelete: null,
    })
    get().schedulePersist()
    await archiveAuthoringSession(sessionId)
  },

  compile: async () => {
    const { client, project } = useWorkbenchStore.getState()
    const loopId = get().activeLoopId
    const draft = get().document?.draft
    if (!client || !project || !loopId || !draft) return

    const issues = getIntentGraphCompileIssues(draft)
    if (!isIntentGraphReadyForCompile(draft)) {
      set({
        error: issues[0]?.message ?? 'Loop graph is not ready to interpret',
      })
      return
    }

    await get().persistNow()
    set({ loading: true, error: null })
    try {
      const result = await client.compileLoopGraph(project.projectId, loopId)
      const document = await client.getLoopGraph(project.projectId, loopId)
      set({
        compileResult: result,
        document,
        phase: 'review',
        loading: false,
      })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Compile failed',
      })
    }
  },

  approve: async (spec) => {
    const { client, project } = useWorkbenchStore.getState()
    const loopId = get().activeLoopId
    const compileResult = get().compileResult
    if (!client || !project || !loopId || !compileResult) return
    set({ loading: true, error: null })
    try {
      const document = await client.approveLoopSpec(
        project.projectId,
        loopId,
        spec ?? compileResult.specDraft,
      )
      const heads = await client.listLoopGraphs(project.projectId)
      set({
        document,
        heads,
        phase: 'run',
        loading: false,
      })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Approve failed',
      })
    }
  },

  startRun: async () => {
    const { client, project } = useWorkbenchStore.getState()
    const loopId = get().activeLoopId
    if (!client || !project || !loopId) return
    set({ loading: true, error: null })
    try {
      const featureNodeId = useWorkbenchStore.getState().selectedNodeId ?? undefined
      const document = await client.startLoopInstance(
        project.projectId,
        loopId,
        undefined,
        featureNodeId,
      )
      const heads = await client.listLoopGraphs(project.projectId)
      set({ document, heads, phase: 'run', loading: false })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Start failed',
      })
    }
  },

  pauseRun: async () => {
    const { client, project } = useWorkbenchStore.getState()
    const { activeLoopId, document } = get()
    const instance = [...(document?.instances ?? [])]
      .reverse()
      .find((item) =>
        item.status === 'running' ||
        item.status === 'queued' ||
        item.status === 'awaiting_review',
      )
    if (!client || !project || !activeLoopId || !instance) return
    const next = await client.pauseLoopInstance(
      project.projectId,
      activeLoopId,
      instance.id,
    )
    set({ document: next })
  },

  resumeRun: async () => {
    const { client, project } = useWorkbenchStore.getState()
    const { activeLoopId, document } = get()
    const instance = [...(document?.instances ?? [])]
      .reverse()
      .find((item) => item.status === 'paused')
    if (!client || !project || !activeLoopId || !instance) return
    const next = await client.resumeLoopInstance(
      project.projectId,
      activeLoopId,
      instance.id,
    )
    set({ document: next })
  },

  advanceRun: async () => {
    const { client, project } = useWorkbenchStore.getState()
    const { activeLoopId, document } = get()
    const instance = [...(document?.instances ?? [])]
      .reverse()
      .find(
        (item) =>
          item.status === 'running' ||
          item.status === 'queued' ||
          item.status === 'paused',
      )
    if (!client || !project || !activeLoopId || !instance) return
    if (instance.status === 'paused') return
    const next = await client.advanceLoopInstance(
      project.projectId,
      activeLoopId,
      instance.id,
    )
    set({ document: next })
  },

  resolveHitl: async (answers) => {
    const { client, project } = useWorkbenchStore.getState()
    const { activeLoopId, document } = get()
    const instance = [...(document?.instances ?? [])]
      .reverse()
      .find((item) => item.status === 'awaiting_hitl')
    if (!client || !project || !activeLoopId || !instance) return
    const next = await client.resolveLoopHitl(
      project.projectId,
      activeLoopId,
      instance.id,
      answers,
    )
    set({ document: next })
  },

  linkActiveSession: async () => {
    const { client, project } = useWorkbenchStore.getState()
    const loopId = get().activeLoopId
    const sessionId = useChatSessionStore.getState().activeSessionId
    if (!client || !project || !loopId || !sessionId) return
    const document = await client.linkLoopGraphToSession(
      project.projectId,
      loopId,
      sessionId,
    )
    if (document) {
      const heads = await client.listLoopGraphs(project.projectId)
      set({ document, heads })
    }
  },

  unlinkSession: async (sessionId) => {
    const { client, project } = useWorkbenchStore.getState()
    const loopId = get().activeLoopId
    if (!client || !project || !loopId) return
    const document = await client.unlinkLoopGraphFromSession(
      project.projectId,
      loopId,
      sessionId,
    )
    if (document) {
      const heads = await client.listLoopGraphs(project.projectId)
      set({ document, heads })
    }
  },
}))
