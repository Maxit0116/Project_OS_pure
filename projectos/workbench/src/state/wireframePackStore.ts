import { create } from 'zustand'
import type {
  FreezeWireframePackInput,
  GenerateWireframePackInput,
  ImplementAgainstPackBrief,
  UpsertWireframeGapInput,
  WireframeFreezeMode,
  WireframeGap,
  WireframePack,
  WireframePackMeta,
} from '@contracts/index'
import { emptyComposerDraft } from '@contracts/index'
import { useChatSessionStore } from './chatSessionStore'
import { useWorkbenchStore } from './workbenchStore'

export type WireframePendingSummary = {
  packId: string
  title: string
  status: string
  version: number
  screenCount: number
  prompt: string
  source: 'overlay' | 'chat'
}

export type WireframeStageMode = 'wireframe' | 'split'

interface WireframePackStore {
  packs: WireframePackMeta[]
  currentPack: WireframePack | null
  currentScreenId: string | null
  gaps: WireframeGap[]
  composerDraft: string
  stageMode: WireframeStageMode
  previewHtml: string
  implementBrief: ImplementAgainstPackBrief | null
  pendingSummary: WireframePendingSummary | null
  busy: boolean
  error: string | null

  setComposerDraft: (value: string) => void
  setStageMode: (mode: WireframeStageMode) => void
  setPreviewHtml: (html: string) => void
  clearError: () => void
  clearPendingSummary: () => void
  clear: () => void
  presentPack: (pack: WireframePack, source?: 'overlay' | 'chat') => void
  selectPack: (packId: string) => Promise<void>
  selectScreen: (screenId: string) => void
  loadForWorkspace: () => Promise<void>
  generate: (source?: 'overlay' | 'chat') => Promise<WireframePack | null>
  deleteScreen: (screenId: string) => Promise<void>
  freeze: (mode?: WireframeFreezeMode) => Promise<WireframePack | null>
  buildImplementBrief: () => Promise<ImplementAgainstPackBrief | null>
  /** Copy brief into Agent composer and switch to change mode (Loop-ready handoff). */
  handOffImplementToAgent: () => Promise<ImplementAgainstPackBrief | null>
  scanStructGaps: () => Promise<void>
  bindSelectedFeature: () => Promise<void>
  refreshGaps: () => Promise<void>
  upsertGap: (input: UpsertWireframeGapInput) => Promise<void>
  acceptIntentional: (gapId: string, note: string) => Promise<void>
  closeGap: (gapId: string) => Promise<void>
  markRealized: () => Promise<WireframePack | null>
}

function clientAndProject() {
  const { client, project } = useWorkbenchStore.getState()
  if (!client || !project) throw new Error('No project loaded')
  return { client, projectId: project.projectId }
}

export const useWireframePackStore = create<WireframePackStore>((set, get) => ({
  packs: [],
  currentPack: null,
  currentScreenId: null,
  gaps: [],
  composerDraft: '',
  stageMode: 'wireframe',
  previewHtml: '',
  implementBrief: null,
  pendingSummary: null,
  busy: false,
  error: null,

  setComposerDraft: (value) => set({ composerDraft: value }),
  setStageMode: (mode) => set({ stageMode: mode }),
  setPreviewHtml: (html) => set({ previewHtml: html }),
  clearError: () => set({ error: null }),
  clearPendingSummary: () => set({ pendingSummary: null }),

  clear: () =>
    set({
      packs: [],
      currentPack: null,
      currentScreenId: null,
      gaps: [],
      composerDraft: '',
      stageMode: 'wireframe',
      previewHtml: '',
      implementBrief: null,
      pendingSummary: null,
      busy: false,
      error: null,
    }),

  presentPack: (pack, source = 'overlay') => {
    set({
      currentPack: pack,
      currentScreenId: pack.screens[0]?.id ?? null,
      pendingSummary: {
        packId: pack.id,
        title: pack.title,
        status: pack.status,
        version: pack.version,
        screenCount: pack.screens.length,
        prompt: pack.prompt,
        source,
      },
      error: null,
    })
    // Host surface is Diagram Graph — never open a parallel wireframe overlay.
    void import('./diagramGraphStore').then(({ useDiagramGraphStore }) => {
      useDiagramGraphStore.getState().enterWireframeMode()
      useDiagramGraphStore.setState({
        pendingSummary: {
          artifactId: pack.id,
          packId: pack.id,
          title: pack.title,
          visualType: 'ui-wireframe',
          prompt: pack.prompt,
          source,
        },
      })
    })
    useChatSessionStore.getState().setDiagramGraphOpen(true)
    void get().refreshGaps()
  },

  selectPack: async (packId) => {
    try {
      const { client, projectId } = clientAndProject()
      set({ busy: true, error: null })
      const pack = await client.getWireframePack(projectId, packId)
      if (!pack) {
        set({ busy: false, error: 'Pack not found' })
        return
      }
      set({
        currentPack: pack,
        currentScreenId: pack.screens[0]?.id ?? null,
        busy: false,
      })
      await get().refreshGaps()
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : 'Failed to load pack',
      })
    }
  },

  selectScreen: (screenId) => set({ currentScreenId: screenId }),

  loadForWorkspace: async () => {
    try {
      const { client, projectId } = clientAndProject()
      const packs = await client.listWireframePacks(projectId)
      set({ packs, error: null })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to list packs',
      })
    }
  },

  generate: async (source = 'overlay') => {
    const draft = get().composerDraft.trim()
    if (!draft) {
      set({ error: 'Describe the UI feature first' })
      return null
    }
    try {
      const { client, projectId } = clientAndProject()
      const selectedNodeId = useWorkbenchStore.getState().selectedNodeId
      set({ busy: true, error: null })
      const input: GenerateWireframePackInput = {
        prompt: draft,
        featureId: selectedNodeId,
      }
      const pack = await client.generateWireframePack(projectId, input)
      const packs = await client.listWireframePacks(projectId)
      set({
        packs,
        busy: false,
        currentPack: pack,
        currentScreenId: pack.screens[0]?.id ?? null,
        stageMode: 'wireframe',
        pendingSummary: {
          packId: pack.id,
          title: pack.title,
          status: pack.status,
          version: pack.version,
          screenCount: pack.screens.length,
          prompt: pack.prompt,
          source,
        },
      })
      void import('./diagramGraphStore').then(({ useDiagramGraphStore }) => {
        useDiagramGraphStore.getState().enterWireframeMode()
        useDiagramGraphStore.setState({
          pendingSummary: {
            artifactId: pack.id,
            packId: pack.id,
            title: pack.title,
            visualType: 'ui-wireframe',
            prompt: pack.prompt,
            source,
          },
        })
      })
      useChatSessionStore.getState().setDiagramGraphOpen(true)
      await get().refreshGaps()
      return pack
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : 'Generate failed',
      })
      return null
    }
  },

  deleteScreen: async (screenId) => {
    const pack = get().currentPack
    if (!pack) return
    try {
      const { client, projectId } = clientAndProject()
      set({ busy: true, error: null })
      const next = await client.deleteWireframeScreen(projectId, pack.id, screenId)
      set({
        busy: false,
        currentPack: next,
        currentScreenId:
          next.screens.find((s) => s.id === get().currentScreenId)?.id ??
          next.screens[0]?.id ??
          null,
      })
      await get().loadForWorkspace()
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : 'Delete screen failed',
      })
    }
  },

  freeze: async (mode = 'full') => {
    const pack = get().currentPack
    if (!pack) return null
    try {
      const { client, projectId } = clientAndProject()
      set({ busy: true, error: null })
      const input: FreezeWireframePackInput = { mode }
      const frozen = await client.freezeWireframePack(projectId, pack.id, input)
      const gaps = await client.listWireframeGaps(projectId, pack.id)
      set({
        busy: false,
        currentPack: frozen,
        gaps,
        pendingSummary: {
          packId: frozen.id,
          title: frozen.title,
          status: frozen.status,
          version: frozen.version,
          screenCount: frozen.screens.length,
          prompt: frozen.prompt,
          source: 'overlay',
        },
      })
      await get().loadForWorkspace()
      return frozen
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : 'Freeze failed',
      })
      return null
    }
  },

  buildImplementBrief: async () => {
    const pack = get().currentPack
    if (!pack) return null
    if (pack.status !== 'frozen' && pack.status !== 'realized') {
      set({ error: 'Freeze the pack before Implement against Pack' })
      return null
    }
    try {
      const { client, projectId } = clientAndProject()
      set({ busy: true, error: null })
      const brief = await client.buildImplementAgainstPackBrief(projectId, pack.id)
      set({ busy: false, implementBrief: brief, stageMode: 'split' })
      return brief
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : 'Brief failed',
      })
      return null
    }
  },

  handOffImplementToAgent: async () => {
    const brief = get().implementBrief ?? (await get().buildImplementBrief())
    if (!brief) return null
    const wb = useWorkbenchStore.getState()
    await wb.setChatMode('change', { isolate: false })
    wb.setComposerDraft(emptyComposerDraft(brief.promptForAgent))
    useWorkbenchStore.setState({ rightPanelTab: 'chat', rightPanelOpen: true })
    // Keep Diagram Graph open so the pack stays visible while Agent takes the brief.
    useChatSessionStore.getState().setDiagramGraphOpen(true)
    void import('./diagramGraphStore').then(({ useDiagramGraphStore }) => {
      useDiagramGraphStore.getState().enterWireframeMode()
    })
    return brief
  },

  scanStructGaps: async () => {
    const pack = get().currentPack
    if (!pack) return
    try {
      const { client, projectId } = clientAndProject()
      const previewHtml = get().previewHtml.trim()
      const previewHtmlByScreen =
        previewHtml && get().currentScreenId
          ? { [get().currentScreenId!]: previewHtml }
          : undefined
      const gaps = await client.scanWireframeStructGaps(projectId, pack.id, {
        previewHtmlByScreen,
      })
      set({ gaps, error: null })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Struct scan failed',
      })
    }
  },

  bindSelectedFeature: async () => {
    const pack = get().currentPack
    const selectedNodeId = useWorkbenchStore.getState().selectedNodeId
    if (!pack || !selectedNodeId) {
      set({ error: 'Select a Function Map / Story node first' })
      return
    }
    try {
      const { client, projectId } = clientAndProject()
      const next = await client.bindWireframePackFeature(
        projectId,
        pack.id,
        selectedNodeId,
      )
      set({ currentPack: next, error: null })
      await get().loadForWorkspace()
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Bind feature failed',
      })
    }
  },

  refreshGaps: async () => {
    const pack = get().currentPack
    if (!pack) {
      set({ gaps: [] })
      return
    }
    try {
      const { client, projectId } = clientAndProject()
      const gaps = await client.listWireframeGaps(projectId, pack.id)
      set({ gaps })
    } catch {
      set({ gaps: [] })
    }
  },

  upsertGap: async (input) => {
    const pack = get().currentPack
    if (!pack) return
    try {
      const { client, projectId } = clientAndProject()
      await client.upsertWireframeGap(projectId, pack.id, input)
      await get().refreshGaps()
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Gap update failed',
      })
    }
  },

  acceptIntentional: async (gapId, note) => {
    const gap = get().gaps.find((item) => item.id === gapId)
    if (!gap) return
    await get().upsertGap({
      id: gap.id,
      screenId: gap.screenId,
      regionId: gap.regionId,
      layer: gap.layer,
      severity: gap.severity,
      summary: gap.summary,
      status: 'accepted_intentional',
      resolutionNote: note,
    })
  },

  closeGap: async (gapId) => {
    const gap = get().gaps.find((item) => item.id === gapId)
    if (!gap) return
    await get().upsertGap({
      id: gap.id,
      screenId: gap.screenId,
      regionId: gap.regionId,
      layer: gap.layer,
      severity: gap.severity,
      summary: gap.summary,
      status: 'closed',
      resolutionNote: 'Fixed',
    })
  },

  markRealized: async () => {
    const pack = get().currentPack
    if (!pack) return null
    try {
      const { client, projectId } = clientAndProject()
      set({ busy: true, error: null })
      const realized = await client.markWireframePackRealized(projectId, pack.id)
      set({ busy: false, currentPack: realized })
      await get().loadForWorkspace()
      return realized
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : 'Accept failed',
      })
      return null
    }
  },
}))
