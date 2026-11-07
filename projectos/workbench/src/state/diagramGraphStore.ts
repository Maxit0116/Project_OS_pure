import { create } from 'zustand'
import type {
  DiagramArtifact,
  DiagramArtifactMeta,
  DiagramNoteBlock,
  DiagramNotesDocument,
  DiagramSkillPackStatus,
  DiagramStyleProfileKind,
  DiagramVisualTypeHint,
} from '@contracts/index'
import {
  emptyDiagramNotes,
  looksLikeWireframePackRequest,
  notesDocumentHasContent,
} from '@contracts/index'
import { useChatSessionStore } from './chatSessionStore'
import { useWorkbenchStore } from './workbenchStore'

export type DiagramSurfaceMode = 'diagram' | 'wireframe'

export type DiagramPendingSummary = {
  artifactId: string
  title: string
  visualType: string
  prompt: string
  source: 'overlay' | 'chat'
  /** Present when visualType is ui-wireframe. */
  packId?: string
}

/** Mutual-exclusive bookmark sheet above the prompt dock (Loop GoalComposer pattern). */
export type DiagramComposerSheet = 'none' | 'activity' | 'details'

export type DiagramRegenerateConfirm = {
  previousId: string
  prompt: string
  source: 'overlay' | 'chat'
}

function metaFromArtifact(artifact: DiagramArtifact): DiagramArtifactMeta {
  return {
    id: artifact.id,
    title: artifact.title,
    visualType: artifact.visualType,
    prompt: artifact.prompt,
    createdAt: artifact.createdAt,
    sourceSessionId: artifact.sourceSessionId ?? null,
    htmlRelPath: artifact.htmlRelPath,
    styleProfile: artifact.styleProfile,
    hasNotes: artifact.hasNotes,
    notesUpdatedAt: artifact.notesUpdatedAt,
  }
}

export type DiagramPreviewEntry = {
  html: string
  notes: DiagramNotesDocument
}

interface DiagramGraphStore {
  artifacts: DiagramArtifactMeta[]
  currentArtifactId: string | null
  currentHtml: string | null
  currentNotes: DiagramNotesDocument | null
  /** Recently loaded HTML+notes for instant left/right stage paging. */
  previewCache: Record<string, DiagramPreviewEntry>
  composerDraft: string
  typeHint: DiagramVisualTypeHint
  /** diagram = architecture HTML; wireframe = Screen Pack hosted in this overlay */
  surfaceMode: DiagramSurfaceMode
  composerSheet: DiagramComposerSheet
  busy: boolean
  ensuring: boolean
  notesSaving: boolean
  error: string | null
  skillStatus: DiagramSkillPackStatus | null
  styleChosen: boolean
  onboardingOpen: boolean
  pendingSummary: DiagramPendingSummary | null
  regenerateConfirm: DiagramRegenerateConfirm | null

  setComposerDraft: (value: string) => void
  setTypeHint: (hint: DiagramVisualTypeHint) => void
  setSurfaceMode: (mode: DiagramSurfaceMode) => void
  enterWireframeMode: () => void
  toggleComposerSheet: (sheet: Exclude<DiagramComposerSheet, 'none'>) => void
  clearError: () => void
  clearPendingSummary: () => void
  beginNewDiagram: () => void
  presentArtifact: (artifact: DiagramArtifact, source?: 'overlay' | 'chat') => void
  selectArtifact: (id: string) => Promise<void>
  /** Prefetch HTML+notes into previewCache without changing the current selection. */
  warmupArtifact: (id: string) => Promise<void>
  deleteArtifact: (id: string) => Promise<boolean>
  loadForWorkspace: () => Promise<void>
  ensureSkill: () => Promise<void>
  chooseStyle: (kind: DiagramStyleProfileKind, value?: string) => Promise<void>
  generate: (source?: 'overlay' | 'chat') => Promise<DiagramArtifact | null>
  /** Opens keep/clear dialog when notes exist; otherwise regenerates immediately. */
  requestRegenerate: () => void
  cancelRegenerateConfirm: () => void
  confirmRegenerate: (keepNotes: boolean) => Promise<void>
  regenerate: (opts?: { keepNotes?: boolean }) => Promise<void>
  saveNotes: (blocks: DiagramNoteBlock[], forDiagramId?: string) => Promise<void>
  clear: () => void
}

function rememberPreview(
  cache: Record<string, DiagramPreviewEntry>,
  id: string,
  html: string,
  notes: DiagramNotesDocument,
): Record<string, DiagramPreviewEntry> {
  return { ...cache, [id]: { html, notes } }
}

function shouldGenerateWireframe(typeHint: DiagramVisualTypeHint, draft: string): boolean {
  if (typeHint === 'ui-wireframe') return true
  if (typeHint !== 'auto') return false
  return looksLikeWireframePackRequest(draft)
}

export const useDiagramGraphStore = create<DiagramGraphStore>((set, get) => ({
  artifacts: [],
  currentArtifactId: null,
  currentHtml: null,
  currentNotes: null,
  previewCache: {},
  composerDraft: '',
  typeHint: 'auto',
  surfaceMode: 'diagram',
  composerSheet: 'none',
  busy: false,
  ensuring: false,
  notesSaving: false,
  error: null,
  skillStatus: null,
  styleChosen: false,
  onboardingOpen: false,
  pendingSummary: null,
  regenerateConfirm: null,

  setComposerDraft: (value) => set({ composerDraft: value }),
  setTypeHint: (hint) =>
    set({
      typeHint: hint,
      surfaceMode: hint === 'ui-wireframe' ? 'wireframe' : 'diagram',
    }),
  setSurfaceMode: (mode) =>
    set({
      surfaceMode: mode,
      ...(mode === 'wireframe' ? { typeHint: 'ui-wireframe' as const } : {}),
    }),
  enterWireframeMode: () => {
    set({ surfaceMode: 'wireframe', typeHint: 'ui-wireframe' })
    useChatSessionStore.getState().setDiagramGraphOpen(true)
  },
  toggleComposerSheet: (sheet) =>
    set((state) => ({
      composerSheet: state.composerSheet === sheet ? 'none' : sheet,
    })),
  clearError: () => set({ error: null }),
  clearPendingSummary: () => set({ pendingSummary: null }),

  beginNewDiagram: () => {
    set({
      currentArtifactId: null,
      currentHtml: null,
      currentNotes: null,
      composerDraft: '',
      error: null,
      composerSheet: 'none',
      regenerateConfirm: null,
      surfaceMode: get().typeHint === 'ui-wireframe' ? 'wireframe' : 'diagram',
    })
  },

  presentArtifact: (artifact, source = 'overlay') => {
    const notes = artifact.notes ?? emptyDiagramNotes(artifact.id)
    set({
      currentArtifactId: artifact.id,
      currentHtml: artifact.html,
      currentNotes: notes,
      previewCache: rememberPreview(get().previewCache, artifact.id, artifact.html, notes),
      artifacts: [
        metaFromArtifact({ ...artifact, notes }),
        ...get().artifacts.filter((item) => item.id !== artifact.id),
      ],
      pendingSummary: {
        artifactId: artifact.id,
        title: artifact.title,
        visualType: artifact.visualType,
        prompt: artifact.prompt,
        source,
      },
      error: null,
      regenerateConfirm: null,
    })
    useChatSessionStore.getState().setDiagramGraphOpen(true)
  },

  selectArtifact: async (id) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return
    const cached = get().previewCache[id]
    if (cached) {
      set({
        currentArtifactId: id,
        currentHtml: cached.html,
        currentNotes: cached.notes,
        error: null,
        composerSheet: 'details',
      })
    }
    try {
      const artifact = await client.getDiagram(project.projectId, id)
      if (!artifact) {
        set({ error: 'Diagram not found' })
        return
      }
      const notes = artifact.notes ?? emptyDiagramNotes(artifact.id)
      set({
        currentArtifactId: artifact.id,
        currentHtml: artifact.html,
        currentNotes: notes,
        previewCache: rememberPreview(get().previewCache, artifact.id, artifact.html, notes),
        artifacts: get().artifacts.map((item) =>
          item.id === artifact.id ? metaFromArtifact({ ...artifact, notes }) : item,
        ),
        error: null,
        composerSheet: 'details',
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  warmupArtifact: async (id) => {
    if (!id || get().previewCache[id]) return
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return
    try {
      const artifact = await client.getDiagram(project.projectId, id)
      if (!artifact) return
      const notes = artifact.notes ?? emptyDiagramNotes(artifact.id)
      set({
        previewCache: rememberPreview(get().previewCache, artifact.id, artifact.html, notes),
        artifacts: get().artifacts.map((item) =>
          item.id === artifact.id ? metaFromArtifact({ ...artifact, notes }) : item,
        ),
      })
    } catch {
      // Prefetch is best-effort; swipe can still commit and load on demand.
    }
  },

  deleteArtifact: async (id) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return false
    try {
      const ok = await client.deleteDiagram(project.projectId, id)
      if (!ok) return false
      const nextArtifacts = get().artifacts.filter((item) => item.id !== id)
      const wasCurrent = get().currentArtifactId === id
      const { [id]: _removed, ...restCache } = get().previewCache
      set({
        artifacts: nextArtifacts,
        previewCache: restCache,
        ...(wasCurrent
          ? {
              currentArtifactId: nextArtifacts[0]?.id ?? null,
              currentHtml: null,
              currentNotes: null,
            }
          : {}),
      })
      if (wasCurrent && nextArtifacts[0]) {
        await get().selectArtifact(nextArtifacts[0].id)
      }
      return true
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      return false
    }
  },

  loadForWorkspace: async () => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) {
      get().clear()
      return
    }
    try {
      const [index, status] = await Promise.all([
        client.getDiagramIndex(project.projectId),
        client.getDiagramSkillPackStatus(project.projectId),
      ])
      const currentId = get().currentArtifactId
      const stillThere = index.artifacts.some((item) => item.id === currentId)
      set({
        artifacts: index.artifacts,
        styleChosen: index.styleProfileChosen,
        onboardingOpen: !index.styleProfileChosen,
        skillStatus: status,
        currentArtifactId: stillThere ? currentId : index.artifacts[0]?.id ?? null,
      })
      const focusId = stillThere ? currentId : index.artifacts[0]?.id
      if (focusId) await get().selectArtifact(focusId)
      else set({ currentHtml: null, currentNotes: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  ensureSkill: async () => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return
    set({ ensuring: true, error: null })
    try {
      const result = await client.ensureDiagramDesignSkill(project.projectId)
      set({ skillStatus: result.status, ensuring: false })
    } catch (error) {
      set({
        ensuring: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  chooseStyle: async (kind, value) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return
    set({ busy: true, error: null })
    try {
      const index = await client.chooseDiagramStyle(project.projectId, {
        kind,
        ...(value ? { value } : {}),
      })
      set({
        styleChosen: index.styleProfileChosen,
        onboardingOpen: false,
        artifacts: index.artifacts,
        busy: false,
      })
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  generate: async (source = 'overlay') => {
    const { client, project } = useWorkbenchStore.getState()
    const draft = get().composerDraft.trim()
    if (!client || !project || !draft) return null

    if (shouldGenerateWireframe(get().typeHint, draft)) {
      set({
        busy: true,
        error: null,
        composerSheet: 'activity',
        surfaceMode: 'wireframe',
        typeHint: 'ui-wireframe',
      })
      try {
        const { useWireframePackStore } = await import('./wireframePackStore')
        const wireframeStore = useWireframePackStore.getState()
        wireframeStore.setComposerDraft(draft)
        const pack = await wireframeStore.generate(source)
        if (!pack) {
          set({
            busy: false,
            error: wireframeStore.error ?? 'Wireframe pack generation failed',
            composerSheet: 'activity',
          })
          return null
        }
        set({
          composerDraft: '',
          busy: false,
          composerSheet: 'details',
          surfaceMode: 'wireframe',
          pendingSummary: {
            artifactId: pack.id,
            packId: pack.id,
            title: pack.title,
            visualType: 'ui-wireframe',
            prompt: pack.prompt,
            source,
          },
        })
        useChatSessionStore.getState().setDiagramGraphOpen(true)
        return null
      } catch (error) {
        set({
          busy: false,
          error: error instanceof Error ? error.message : String(error),
          composerSheet: 'activity',
        })
        return null
      }
    }

    if (!get().styleChosen) {
      set({ onboardingOpen: true, error: null })
      return null
    }
    set({ busy: true, error: null, composerSheet: 'activity', surfaceMode: 'diagram' })
    try {
      await get().ensureSkill()
      const sessionId = useChatSessionStore.getState().activeSessionId
      const artifact = await client.generateDiagram(project.projectId, {
        prompt: draft,
        diagramTypeHint: get().typeHint === 'ui-wireframe' ? 'auto' : get().typeHint,
        sourceSessionId: sessionId,
        contextNotes: [
          `Project: ${project.displayName || project.projectId}`,
          `Root: ${project.workspaceRoot}`,
        ].join('\n'),
      })
      set({ composerDraft: '', busy: false, composerSheet: 'details' })
      get().presentArtifact(artifact, source)
      return artifact
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : String(error),
        composerSheet: 'activity',
      })
      return null
    }
  },

  requestRegenerate: () => {
    const current = get().artifacts.find((item) => item.id === get().currentArtifactId)
    if (!current) return
    const source = get().pendingSummary?.source ?? 'overlay'
    if (notesDocumentHasContent(get().currentNotes)) {
      set({
        regenerateConfirm: {
          previousId: current.id,
          prompt: current.prompt,
          source,
        },
      })
      return
    }
    void get().regenerate({ keepNotes: false })
  },

  cancelRegenerateConfirm: () => set({ regenerateConfirm: null }),

  confirmRegenerate: async (keepNotes) => {
    const confirm = get().regenerateConfirm
    if (!confirm) return
    set({ regenerateConfirm: null })
    await get().regenerate({ keepNotes })
  },

  regenerate: async (opts) => {
    const keepNotes = opts?.keepNotes ?? false
    const previousId = get().currentArtifactId
    const previousNotes = get().currentNotes
    const current = get().artifacts.find((item) => item.id === previousId)
    if (!current) return
    const source = get().pendingSummary?.source ?? 'overlay'
    set({ composerDraft: current.prompt })
    const artifact = await get().generate(source)
    if (!artifact || !keepNotes || !previousId || previousId === artifact.id) return
    if (!notesDocumentHasContent(previousNotes)) return
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return
    try {
      const notes = await client.updateDiagramNotes(project.projectId, artifact.id, {
        blocks: previousNotes!.blocks.map((block) => ({
          ...block,
          updatedAt: new Date().toISOString(),
        })),
      })
      set({
        currentNotes: notes,
        artifacts: get().artifacts.map((item) =>
          item.id === artifact.id
            ? {
                ...item,
                hasNotes: notesDocumentHasContent(notes),
                notesUpdatedAt: notes.updatedAt,
              }
            : item,
        ),
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  saveNotes: async (blocks, forDiagramId) => {
    const { client, project } = useWorkbenchStore.getState()
    const diagramId = forDiagramId ?? get().currentArtifactId
    if (!client || !project || !diagramId) return
    set({ notesSaving: true })
    try {
      const notes = await client.updateDiagramNotes(project.projectId, diagramId, { blocks })
      const stillCurrent = get().currentArtifactId === diagramId
      const cachedHtml =
        get().previewCache[diagramId]?.html ?? (stillCurrent ? get().currentHtml : null)
      set({
        ...(stillCurrent ? { currentNotes: notes } : {}),
        notesSaving: false,
        ...(cachedHtml
          ? {
              previewCache: rememberPreview(get().previewCache, diagramId, cachedHtml, notes),
            }
          : {}),
        artifacts: get().artifacts.map((item) =>
          item.id === diagramId
            ? {
                ...item,
                hasNotes: notesDocumentHasContent(notes),
                notesUpdatedAt: notes.updatedAt,
              }
            : item,
        ),
      })
    } catch (error) {
      set({
        notesSaving: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  clear: () => {
    set({
      artifacts: [],
      currentArtifactId: null,
      currentHtml: null,
      currentNotes: null,
      previewCache: {},
      composerDraft: '',
      typeHint: 'auto',
      surfaceMode: 'diagram',
      composerSheet: 'none',
      busy: false,
      ensuring: false,
      notesSaving: false,
      error: null,
      skillStatus: null,
      styleChosen: false,
      onboardingOpen: false,
      pendingSummary: null,
      regenerateConfirm: null,
    })
  },
}))
