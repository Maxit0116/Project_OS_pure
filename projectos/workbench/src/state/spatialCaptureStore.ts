import { create } from 'zustand'
import type {
  SpatialCaptureFolder,
  SpatialCapturePlacement,
  SpatialCaptureSession,
  SpatialCaptureSessionHead,
} from '@contracts/spatial-capture-session'
import { partitionSpatialCaptures } from '@contracts/spatial-capture-session'
import { useChatSessionStore } from './chatSessionStore'
import { useWorkbenchStore } from './workbenchStore'

interface SpatialCaptureStore {
  heads: SpatialCaptureSessionHead[]
  folders: SpatialCaptureFolder[]
  activeSessionId: string | null
  activeSession: SpatialCaptureSession | null
  /** Drill-in folder in Spatial Captures main area (null = gallery). */
  drillFolderId: string | null
  loading: boolean
  error: string | null

  loadHeads: () => Promise<void>
  openSession: (sessionId: string) => Promise<void>
  closeSession: () => void
  refreshActiveSession: () => Promise<void>
  deleteSession: (sessionId: string) => Promise<{ ok: boolean; error?: string }>
  upsertActiveSession: (session: SpatialCaptureSession) => Promise<void>
  placeSession: (
    sessionId: string,
    placement: SpatialCapturePlacement,
  ) => Promise<{ ok: boolean; error?: string }>
  deleteFolder: (
    folderId: string,
    options?: { cascade?: boolean },
  ) => Promise<{ ok: boolean; error?: string }>
  renameFolder: (
    folderId: string,
    name: string,
  ) => Promise<{ ok: boolean; error?: string }>
  mergeFolders: (
    sourceFolderId: string,
    targetFolderId: string,
    options?: { name?: string },
  ) => Promise<{ ok: boolean; error?: string }>
  setDrillFolderId: (folderId: string | null) => void
}

export const useSpatialCaptureStore = create<SpatialCaptureStore>((set, get) => ({
  heads: [],
  folders: [],
  activeSessionId: null,
  activeSession: null,
  drillFolderId: null,
  loading: false,
  error: null,

  loadHeads: async () => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) {
      set({ heads: [], folders: [], loading: false })
      return
    }
    set({ loading: true, error: null })
    try {
      const [heads, folders] = await Promise.all([
        client.listSpatialCaptureSessions(project.projectId),
        client.listSpatialCaptureFolders(project.projectId),
      ])
      const drillFolderId = get().drillFolderId
      const stillExists = drillFolderId
        ? folders.some((folder) => folder.id === drillFolderId)
        : true
      set({
        heads,
        folders,
        loading: false,
        drillFolderId: stillExists ? drillFolderId : null,
      })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load captures',
      })
    }
  },

  openSession: async (sessionId) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return
    set({ loading: true, error: null })
    try {
      const session = await client.getSpatialCaptureSession(
        project.projectId,
        sessionId,
      )
      if (!session) {
        set({ loading: false, error: 'Capture session not found' })
        return
      }
      set({
        activeSessionId: sessionId,
        activeSession: session,
        loading: false,
      })
      useChatSessionStore.getState().setCanvasOverlay('spatial')
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to open capture',
      })
    }
  },

  closeSession: () => {
    set({ activeSessionId: null, activeSession: null })
    const overlay = useChatSessionStore.getState().canvasOverlay
    if (overlay === 'spatial') {
      useChatSessionStore.getState().setCanvasOverlay('none')
    }
  },

  refreshActiveSession: async () => {
    const { activeSessionId } = get()
    const { client, project } = useWorkbenchStore.getState()
    if (!activeSessionId || !client || !project) return
    const session = await client.getSpatialCaptureSession(
      project.projectId,
      activeSessionId,
    )
    if (session) set({ activeSession: session })
  },

  deleteSession: async (sessionId) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return { ok: false, error: 'No workspace' }
    try {
      await client.deleteSpatialCaptureSession(project.projectId, sessionId)
      if (get().activeSessionId === sessionId) {
        get().closeSession()
      }
      await get().loadHeads()
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Delete failed',
      }
    }
  },

  upsertActiveSession: async (session) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return
    const saved = await client.upsertSpatialCaptureSession(
      project.projectId,
      session,
    )
    set({ activeSession: saved, activeSessionId: saved.id })
    await get().loadHeads()
  },

  placeSession: async (sessionId, placement) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return { ok: false, error: 'No workspace' }
    try {
      await client.placeSpatialCaptureSession(
        project.projectId,
        sessionId,
        placement,
      )
      await get().loadHeads()
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Place failed',
      }
    }
  },

  deleteFolder: async (folderId, options) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return { ok: false, error: 'No workspace' }
    try {
      await client.deleteSpatialCaptureFolder(project.projectId, folderId, {
        cascade: options?.cascade ?? false,
      })
      if (get().drillFolderId === folderId) {
        set({ drillFolderId: null })
      }
      await get().loadHeads()
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Delete folder failed',
      }
    }
  },

  renameFolder: async (folderId, name) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return { ok: false, error: 'No workspace' }
    try {
      await client.renameSpatialCaptureFolder(project.projectId, folderId, name)
      await get().loadHeads()
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Rename failed',
      }
    }
  },

  mergeFolders: async (sourceFolderId, targetFolderId, options) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) return { ok: false, error: 'No workspace' }
    try {
      await client.mergeSpatialCaptureFolders(
        project.projectId,
        sourceFolderId,
        targetFolderId,
        options ?? {},
      )
      if (get().drillFolderId === sourceFolderId) {
        set({ drillFolderId: targetFolderId })
      }
      await get().loadHeads()
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Merge folders failed',
      }
    }
  },

  setDrillFolderId: (folderId) => set({ drillFolderId: folderId }),
}))

export function selectPartitionedCaptures(state: SpatialCaptureStore) {
  return partitionSpatialCaptures(state.heads, state.folders)
}
