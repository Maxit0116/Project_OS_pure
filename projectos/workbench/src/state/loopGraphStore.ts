import type {
  AgentWiringOverride,
  IntentEdgeKind,
  IntentEdgePort,
  IntentGraph,
  IntentGraphEdge,
  IntentGraphNode,
  LoopAgentConfigPort,
  LoopComposerMode,
  LoopCompileResult,
  LoopConfigRef,
  LoopGoalClarificationAnswer,
  LoopGraphDocument,
  LoopGraphHead,
  LoopGraphPreset,
  LoopHitlAnswer,
  LoopPaletteItem,
  LoopSatelliteKind,
  LoopSpec,
} from '@contracts/index'
import {
  configPortForSatelliteKind,
  createNodeFromPaletteItem,
  getIntentGraphCompileIssues,
  getLoopGraphPreset,
  getLoopPaletteItem,
  isConfigNode,
  isIntentGraphReadyForCompile,
  suggestIntentEdgeKind,
  withArchitectureDefaults,
} from '@contracts/index'
import {
  collectOrphanConfigNodeIds,
  collectOrphansAfterEdgeRemoval,
  expandWiringFromDefinition,
  resolveAgentWiring,
  type AgentWiringBase,
} from '../../../services/loop-agent-wiring'
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
export type LoopComposerSheet = 'none' | 'flow' | 'context' | 'clarify'

function sheetAfterAskTurn(document: LoopGraphDocument): LoopComposerSheet {
  const needsClarify = document.draftGoalContext?.openQuestions.some(
    (question) => !question.answer?.trim(),
  )
  return needsClarify ? 'clarify' : 'context'
}

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
  deleteLoop: (loopId: string) => Promise<boolean>
  updateDraft: (draft: IntentGraph, title?: string) => void
  schedulePersist: () => void
  persistNow: () => Promise<void>
  setConnectingFrom: (nodeId: string | null) => void
  setPendingDelete: (target: LoopDeleteTarget | null) => void
  setComposerDraft: (value: string) => void
  /** Open a sheet, or collapse it if already open (bookmark toggle). */
  toggleComposerSheet: (sheet: Exclude<LoopComposerSheet, 'none'>) => void
  setComposerSheet: (sheet: LoopComposerSheet) => void
  setComposerMode: (mode: LoopComposerMode) => Promise<void>
  sendAuthoringTurn: () => Promise<void>
  answerGoalClarification: (answers: LoopGoalClarificationAnswer[]) => Promise<void>
  cancelGoalClarification: () => Promise<void>
  confirmGoalContext: () => Promise<void>
  acceptGraphEditOffer: () => Promise<void>
  dismissGraphEditOffer: () => Promise<void>
  undoDraft: () => Promise<void>
  beginAuthorNode: (position: { x: number; y: number }) => Promise<string | null>
  beginAuthorNodeFromPalette: (
    paletteItemId: string,
    position: { x: number; y: number },
    options?: {
      agentDefinitionId?: string | null
      title?: string
      configRef?: LoopConfigRef
    },
  ) => Promise<string | null>
  setNodeAgentDefinition: (
    nodeId: string,
    agentDefinitionId: string | null,
    options?: { title?: string; wiringBase?: AgentWiringBase | null },
  ) => void
  /** Expand Model/Skill/MCP/Memory satellites from a Definition (or clear prior orphans). */
  expandAgentWiring: (
    agentNodeId: string,
    base: AgentWiringBase,
    options?: { replaceExistingProvides?: boolean },
  ) => void
  setAgentWiringOverride: (
    nodeId: string,
    override: AgentWiringOverride | null,
  ) => void
  beginAuthorConfigSatellite: (input: {
    satelliteKind: LoopSatelliteKind
    configRef?: LoopConfigRef
    title?: string
    position: { x: number; y: number }
    wireToAgentId?: string
  }) => Promise<string | null>
  updateConfigSatellite: (
    nodeId: string,
    patch: { title?: string; configRef?: LoopConfigRef },
  ) => void
  /** Write current canvas wiring into the bound Workforce Agent definition (confirm first in UI). */
  applyWiringToAgentDefinition: (agentNodeId: string) => Promise<boolean>
  /** Create a new Workforce Agent from current canvas wiring and bind this node. */
  saveWiringAsNewAgent: (
    agentNodeId: string,
    options?: { displayName?: string },
  ) => Promise<string | null>
  applyLoopPreset: (presetId: string) => Promise<boolean>
  beginAuthorEdge: (
    source: string,
    target: string,
    ports?: {
      sourcePort?: IntentEdgePort
      targetPort?: IntentEdgePort
      configPort?: LoopAgentConfigPort
      kind?: IntentEdgeKind
    },
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
  resolveHitl: (answers: LoopHitlAnswer[]) => Promise<void>
  restoreFromCheckpoint: (instanceId: string) => Promise<void>
  deriveDraftFromRun: (instanceId: string) => Promise<void>
  refreshRunHistory: () => Promise<void>
  runHistory: Array<{
    id: string
    status: string
    specVersion: string
    startedAt: string
    completedAt?: string
    round: number
    errorMessage?: string
  }>
  linkActiveSession: () => Promise<void>
  unlinkSession: (sessionId: string) => Promise<void>
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

function patchDraftDocument(
  document: LoopGraphDocument,
  draft: IntentGraph,
): LoopGraphDocument {
  const revisionChanged = draft.revision !== document.draft.revision
  return {
    ...document,
    draft,
    updatedAt: new Date().toISOString(),
    // Manual canvas/save bumps revision — drop AI offer so Accept cannot overwrite.
    ...(revisionChanged ? { pendingGraphEditOffer: undefined } : {}),
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
  runHistory: [],

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
      runHistory: [],
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
        composerSheet: next.composerMode === 'ask' ? sheetAfterAskTurn(next) : 'flow',
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
    set({ authoringBusy: true, error: null })
    try {
      const next = await client.answerLoopGoalClarification(
        project.projectId,
        loopId,
        answers,
      )
      set({ document: next, authoringBusy: false, composerSheet: 'context' })
    } catch (error) {
      set({
        authoringBusy: false,
        error: error instanceof Error ? error.message : 'Clarification failed',
      })
    }
  },

  cancelGoalClarification: async () => {
    const { client, project } = useWorkbenchStore.getState()
    const loopId = get().activeLoopId
    const document = get().document
    if (!client || !project || !loopId || !document) return

    const lastUser = [...document.authoringThread]
      .reverse()
      .find((message) => message.role === 'user')
    const restoredPrompt = lastUser?.content ?? ''

    set({ authoringBusy: true, error: null })
    try {
      const next = await client.cancelLoopGoalClarification(project.projectId, loopId)
      set({
        document: next,
        authoringBusy: false,
        composerDraft: restoredPrompt,
        composerSheet: 'none',
      })
    } catch (error) {
      set({
        authoringBusy: false,
        error: error instanceof Error ? error.message : 'Cancel clarification failed',
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
        // Always land on the draw canvas when opening Loops Graph.
        // pendingCompile / approvedSpecs stay hydrated so Review / Run tabs remain available.
        phase: 'draw',
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

  deleteLoop: async (loopId) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return false
    try {
      const ok = await client.deleteLoopGraph(project.projectId, loopId)
      if (!ok) return false
      const nextHeads = get().heads.filter((head) => head.id !== loopId)
      const wasActive = get().activeLoopId === loopId
      const nextActiveId = wasActive ? (nextHeads[0]?.id ?? null) : get().activeLoopId
      set({
        heads: nextHeads,
        ...(wasActive
          ? {
              activeLoopId: nextActiveId,
              document: null,
              compileResult: null,
              connectingFromId: null,
              pendingDelete: null,
              composerDraft: '',
              composerSheet: 'none' as const,
              authoringBusy: false,
            }
          : {}),
        error: null,
      })
      if (wasActive && nextActiveId) {
        await get().selectLoop(nextActiveId)
      }
      return true
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete loop',
      })
      return false
    }
  },

  updateDraft: (draft, title) => {
    const current = get().document
    if (!current) return
    set({
      document: {
        ...patchDraftDocument(current, draft),
        title: title?.trim() || current.title,
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

  beginAuthorNodeFromPalette: async (paletteItemId, position, options) => {
    const current = get().document
    if (!current) return null
    const item: LoopPaletteItem | undefined = getLoopPaletteItem(paletteItemId)
    if (!item) {
      set({ error: `Unknown palette item: ${paletteItemId}` })
      return null
    }
    const sessionId = await ensureAuthoringSession()
    if (!sessionId) return null

    const seeded = createNodeFromPaletteItem(item, {
      id: newLoopEntityId('node'),
      position,
    })
    const node = withArchitectureDefaults({
      ...seeded,
      ...(options?.title ? { title: options.title.slice(0, 120) } : {}),
      ...(options?.agentDefinitionId !== undefined
        ? { agentDefinitionId: options.agentDefinitionId }
        : {}),
      ...(options?.configRef
        ? { configRef: { ...(seeded.configRef ?? {}), ...options.configRef } }
        : {}),
      authoringSessionId: sessionId,
    })
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

  setNodeAgentDefinition: (nodeId, agentDefinitionId, options) => {
    const current = get().document
    if (!current) return
    if (get().phase !== 'draw') {
      set({ error: 'Switch Agent is only available while the loop is in draft' })
      return
    }
    const draft: IntentGraph = {
      ...current.draft,
      revision: current.draft.revision + 1,
      nodes: current.draft.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              agentDefinitionId,
              ...(options?.title ? { title: options.title.slice(0, 120) } : {}),
            }
          : node,
      ),
    }
    set({
      document: patchDraftDocument(current, draft),
      error: null,
    })
    get().schedulePersist()
    if (options?.wiringBase) {
      get().expandAgentWiring(nodeId, options.wiringBase, {
        replaceExistingProvides: true,
      })
    }
  },

  expandAgentWiring: (agentNodeId, base, options) => {
    const current = get().document
    if (!current) return
    const agent = current.draft.nodes.find((node) => node.id === agentNodeId)
    if (!agent || isConfigNode(agent) || (agent.type ?? 'agent') !== 'agent') {
      set({ error: 'Wiring expand requires an agent node' })
      return
    }

    let working: IntentGraph = current.draft
    if (options?.replaceExistingProvides) {
      const provides = working.edges.filter(
        (edge) => edge.kind === 'provides' && edge.target === agentNodeId,
      )
      const provideIds = new Set(provides.map((edge) => edge.id))
      const withoutProvides: IntentGraph = {
        ...working,
        edges: working.edges.filter((edge) => !provideIds.has(edge.id)),
      }
      const stillUsed = new Set(
        withoutProvides.edges
          .filter((edge) => edge.kind === 'provides')
          .map((edge) => edge.source),
      )
      const orphanIds = new Set(
        provides
          .map((edge) => edge.source)
          .filter((sourceId) => !stillUsed.has(sourceId)),
      )
      working = {
        ...withoutProvides,
        nodes: withoutProvides.nodes.filter((node) => !orphanIds.has(node.id)),
      }
    }

    const idPool: string[] = []
    const nextId = () => {
      const id = newLoopEntityId('node')
      idPool.push(id)
      return id
    }
    const remapped = expandWiringFromDefinition({
      agentNodeId,
      agentPosition: agent.position,
      base,
      existing: working,
      newId: nextId,
    })
    // Edge ids from expand also use newId(); retag edges to edge_ prefix.
    const draft: IntentGraph = {
      ...working,
      revision: current.draft.revision + 1,
      nodes: [...working.nodes, ...remapped.nodes],
      edges: [
        ...working.edges,
        ...remapped.edges.map((edge) => ({
          ...edge,
          id: newLoopEntityId('edge'),
        })),
      ],
    }
    set({
      document: patchDraftDocument(current, draft),
      error: null,
    })
    get().schedulePersist()
  },

  setAgentWiringOverride: (nodeId, override) => {
    const current = get().document
    if (!current) return
    const draft: IntentGraph = {
      ...current.draft,
      revision: current.draft.revision + 1,
      nodes: current.draft.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              ...(override
                ? { agentWiringOverride: override }
                : { agentWiringOverride: undefined }),
            }
          : node,
      ),
    }
    // Strip undefined agentWiringOverride cleanly
    draft.nodes = draft.nodes.map((node) => {
      if (node.id !== nodeId) return node
      if (override) return { ...node, agentWiringOverride: override }
      const { agentWiringOverride: _removed, ...rest } = node
      return rest
    })
    set({
      document: patchDraftDocument(current, draft),
      error: null,
    })
    get().schedulePersist()
  },

  updateConfigSatellite: (nodeId, patch) => {
    const current = get().document
    if (!current) return
    const draft: IntentGraph = {
      ...current.draft,
      revision: current.draft.revision + 1,
      nodes: current.draft.nodes.map((node) => {
        if (node.id !== nodeId || !isConfigNode(node)) return node
        return {
          ...node,
          ...(patch.title ? { title: patch.title.slice(0, 120) } : {}),
          ...(patch.configRef
            ? { configRef: { ...(node.configRef ?? {}), ...patch.configRef } }
            : {}),
        }
      }),
    }
    set({
      document: patchDraftDocument(current, draft),
      error: null,
    })
    get().schedulePersist()
  },

  applyWiringToAgentDefinition: async (agentNodeId) => {
    const current = get().document
    const { client, project, pushToast } = useWorkbenchStore.getState()
    if (!current || !client?.updateWorkforceAgent || !client.listWorkforceAgents || !project) {
      set({ error: 'Cannot apply wiring — client unavailable' })
      return false
    }
    const agent = current.draft.nodes.find((node) => node.id === agentNodeId)
    if (!agent || isConfigNode(agent) || (agent.type ?? 'agent') !== 'agent') {
      set({ error: 'Apply wiring requires an agent node' })
      return false
    }
    if (!agent.agentDefinitionId) {
      set({
        error: 'Bind or Save as Agent first — General Agent has no shared definition to update',
      })
      return false
    }
    try {
      const listed = await client.listWorkforceAgents({ projectId: project.projectId })
      const existing = listed.agents.find(
        (item) => item.definitionId === agent.agentDefinitionId,
      )
      if (!existing) {
        set({ error: 'Workforce agent definition not found' })
        return false
      }
      const resolved = resolveAgentWiring(agent, current.draft, {
        modelProfileId: existing.config.modelProfileId,
        skillIds: existing.config.skillIds ?? [],
        mcpServerIds: existing.config.mcpServerIds ?? [],
      })
      await client.updateWorkforceAgent({
        projectId: project.projectId,
        definitionId: existing.definitionId,
        draft: {
          displayName: existing.config.displayName,
          roleLabel: existing.config.roleLabel,
          instructions: existing.config.instructions ?? '',
          modelProfileId: resolved.modelProfileId ?? null,
          skillIds: resolved.skillIds,
          mcpServerIds: resolved.mcpServerIds,
          permissionNotes: existing.config.permissionNotes,
        },
      })
      get().setAgentWiringOverride(agentNodeId, null)
      pushToast({
        type: 'success',
        message: `Applied wiring to ${existing.config.displayName}`,
        autoDismiss: 3200,
      })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to apply wiring'
      set({ error: message })
      pushToast({ type: 'error', message, autoDismiss: 4200 })
      return false
    }
  },

  saveWiringAsNewAgent: async (agentNodeId, options) => {
    const current = get().document
    const { client, project, pushToast } = useWorkbenchStore.getState()
    if (!current || !client?.createWorkforceAgent || !project) {
      set({ error: 'Cannot save agent — client unavailable' })
      return null
    }
    const agent = current.draft.nodes.find((node) => node.id === agentNodeId)
    if (!agent || isConfigNode(agent) || (agent.type ?? 'agent') !== 'agent') {
      set({ error: 'Save as Agent requires an agent node' })
      return null
    }
    try {
      const resolved = resolveAgentWiring(agent, current.draft)
      const displayName = (options?.displayName ?? agent.title ?? 'Specialized Agent').slice(
        0,
        120,
      )
      const created = await client.createWorkforceAgent({
        projectId: project.projectId,
        draft: {
          displayName,
          roleLabel: agent.agentRole,
          instructions: agent.prompt ?? '',
          modelProfileId: resolved.modelProfileId ?? null,
          skillIds: resolved.skillIds,
          mcpServerIds: resolved.mcpServerIds,
        },
      })
      get().setNodeAgentDefinition(agentNodeId, created.definitionId, {
        title: created.config.displayName,
      })
      get().setAgentWiringOverride(agentNodeId, null)
      pushToast({
        type: 'success',
        message: `Saved as agent ${created.config.displayName}`,
        autoDismiss: 3200,
      })
      return created.definitionId
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save agent'
      set({ error: message })
      pushToast({ type: 'error', message, autoDismiss: 4200 })
      return null
    }
  },

  beginAuthorConfigSatellite: async (input) => {
    const current = get().document
    if (!current) return null
    const sessionId = await ensureAuthoringSession()
    if (!sessionId) return null
    const node: IntentGraphNode = {
      id: newLoopEntityId('node'),
      title: (input.title ?? input.satelliteKind).slice(0, 120),
      prompt: '',
      type: 'config',
      satelliteKind: input.satelliteKind,
      ...(input.configRef ? { configRef: input.configRef } : {}),
      position: input.position,
      authoringSessionId: sessionId,
    }
    let edges = current.draft.edges
    if (input.wireToAgentId) {
      const port = configPortForSatelliteKind(input.satelliteKind)
      edges = [
        ...edges,
        {
          id: newLoopEntityId('edge'),
          source: node.id,
          target: input.wireToAgentId,
          kind: 'provides',
          configPort: port,
          sourcePort: 'n',
          targetPort: 's',
          prompt: '',
          authoringSessionId: sessionId,
        },
      ]
    }
    const draft: IntentGraph = {
      ...current.draft,
      revision: current.draft.revision + 1,
      nodes: [...current.draft.nodes, node],
      edges,
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

  applyLoopPreset: async (presetId) => {
    const current = get().document
    if (!current) return false
    const resolved = await useWorkbenchStore.getState().resolveLoopGraphPreset(presetId)
    const preset: LoopGraphPreset | undefined =
      resolved ?? getLoopGraphPreset(presetId)
    if (!preset) {
      set({ error: `Unknown preset: ${presetId}` })
      return false
    }
    const sessionId = await ensureAuthoringSession()
    if (!sessionId) return false

    const nodes = preset.draft.nodes.map((node) =>
      withArchitectureDefaults({
        ...node,
        authoringSessionId: sessionId,
      }),
    )
    const draft: IntentGraph = {
      ...preset.draft,
      revision: current.draft.revision + 1,
      nodes,
      edges: preset.draft.edges.map((edge) => ({
        ...edge,
        authoringSessionId: sessionId,
      })),
    }
    const linkedSessionIds = current.linkedSessionIds.includes(sessionId)
      ? current.linkedSessionIds
      : [...current.linkedSessionIds, sessionId].slice(0, 20)

    set({
      document: {
        ...patchDraftDocument(current, draft),
        linkedSessionIds,
        title:
          current.title === 'Untitled loop' || !current.title.trim()
            ? preset.title
            : current.title,
      },
      connectingFromId: null,
      error: null,
      phase: 'draw',
    })
    get().schedulePersist()
    return true
  },

  beginAuthorEdge: async (source, target, ports) => {
    const current = get().document
    if (!current || source === target) return null
    if (current.draft.edges.some((edge) => edge.source === source && edge.target === target)) {
      set({ connectingFromId: null })
      return null
    }

    const sourceNode = current.draft.nodes.find((node) => node.id === source)
    const targetNode = current.draft.nodes.find((node) => node.id === target)
    if (!sourceNode || !targetNode) return null

    const sourceIsConfig = isConfigNode(sourceNode)
    const targetIsConfig = isConfigNode(targetNode)
    const targetIsAgent =
      !isConfigNode(targetNode) && (targetNode.type ?? 'agent') === 'agent'
    const sourceIsAgent =
      !isConfigNode(sourceNode) && (sourceNode.type ?? 'agent') === 'agent'

    let kind = ports?.kind
    let configPort = ports?.configPort

    if (sourceIsConfig && targetIsAgent) {
      kind = 'provides'
      configPort =
        configPort ??
        (sourceNode.satelliteKind
          ? configPortForSatelliteKind(sourceNode.satelliteKind)
          : undefined)
    } else if (sourceIsAgent && targetIsConfig) {
      // Normalize direction: config → agent
      return get().beginAuthorEdge(target, source, {
        sourcePort: ports?.targetPort ?? 'n',
        targetPort: ports?.sourcePort ?? 's',
        configPort:
          ports?.configPort ??
          (targetNode.satelliteKind
            ? configPortForSatelliteKind(targetNode.satelliteKind)
            : undefined),
        kind: 'provides',
      })
    } else if (sourceIsConfig || targetIsConfig) {
      set({
        connectingFromId: null,
        error: 'Config satellites only connect to Agent nodes via provides',
      })
      return null
    }

    if (kind === 'provides') {
      if (!configPort) {
        set({
          connectingFromId: null,
          error: 'provides edge needs a config port (Model / Memory / Capability)',
        })
        return null
      }
      const dupPort = current.draft.edges.some(
        (edge) =>
          edge.kind === 'provides' &&
          edge.target === target &&
          edge.configPort === configPort &&
          (configPort === 'model' || configPort === 'memory'),
      )
      if (dupPort) {
        set({
          connectingFromId: null,
          error: `Agent already has a ${configPort} wiring`,
        })
        return null
      }
    }

    const sessionId = await ensureAuthoringSession()
    if (!sessionId) return null

    const edge: IntentGraphEdge = {
      id: newLoopEntityId('edge'),
      source,
      target,
      ...(kind ? { kind } : {}),
      ...(configPort ? { configPort } : {}),
      ...(ports?.sourcePort ? { sourcePort: ports.sourcePort } : {}),
      ...(ports?.targetPort ? { targetPort: ports.targetPort } : {}),
      ...(kind === 'provides' ? { prompt: '' } : {}),
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
      const orphanIds =
        node && !isConfigNode(node) && (node.type ?? 'agent') === 'agent'
          ? collectOrphanConfigNodeIds(current.draft, node.id)
          : []
      const removeIds = new Set([target.id, ...orphanIds])
      const draft: IntentGraph = {
        ...current.draft,
        revision: current.draft.revision + 1,
        nodes: current.draft.nodes.filter((item) => !removeIds.has(item.id)),
        edges: current.draft.edges.filter(
          (edge) => !removeIds.has(edge.source) && !removeIds.has(edge.target),
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
    const orphanIds = edge
      ? collectOrphansAfterEdgeRemoval(current.draft, edge.id)
      : []
    const orphanSet = new Set(orphanIds)
    const draft: IntentGraph = {
      ...current.draft,
      revision: current.draft.revision + 1,
      nodes: current.draft.nodes.filter((item) => !orphanSet.has(item.id)),
      edges: current.draft.edges.filter(
        (item) => item.id !== target.id && !orphanSet.has(item.source),
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
      const runHistory = await client.listLoopRunHistory(project.projectId, loopId)
      set({ document, heads, phase: 'run', loading: false, runHistory })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Start failed',
      })
    }
  },

  refreshRunHistory: async () => {
    const { client, project } = useWorkbenchStore.getState()
    const loopId = get().activeLoopId
    if (!client || !project || !loopId) return
    try {
      const runHistory = await client.listLoopRunHistory(project.projectId, loopId)
      set({ runHistory })
    } catch {
      // History is best-effort for the Run panel.
    }
  },

  restoreFromCheckpoint: async (instanceId) => {
    const { client, project } = useWorkbenchStore.getState()
    const loopId = get().activeLoopId
    if (!client || !project || !loopId) return
    set({ loading: true, error: null })
    try {
      const document = await client.restoreLoopInstanceFromCheckpoint(
        project.projectId,
        loopId,
        instanceId,
      )
      const runHistory = await client.listLoopRunHistory(project.projectId, loopId)
      set({ document, phase: 'run', loading: false, runHistory })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Restore failed',
      })
    }
  },

  deriveDraftFromRun: async (instanceId) => {
    const { client, project } = useWorkbenchStore.getState()
    const loopId = get().activeLoopId
    if (!client || !project || !loopId) return
    set({ loading: true, error: null })
    try {
      const document = await client.deriveDraftFromLoopInstance(
        project.projectId,
        loopId,
        instanceId,
      )
      set({ document, phase: 'draw', loading: false })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Derive draft failed',
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
