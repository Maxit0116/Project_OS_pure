import { create } from 'zustand'
import type {
  SpatialCaptureSession,
  SpatialCaptureSessionHead,
} from '@contracts/spatial-capture-session'
import { useChatSessionStore } from './chatSessionStore'
import { useWorkbenchStore } from './workbenchStore'

interface SpatialCaptureStore {
  heads: SpatialCaptureSessionHead[]
  activeSessionId: string | null
  activeSession: SpatialCaptureSession | null
  loading: boolean
  error: string | null

  loadHeads: () => Promise<void>
  openSession: (sessionId: string) => Promise<void>
  closeSession: () => void
  refreshActiveSession: () => Promise<void>
  deleteSession: (sessionId: string) => Promise<{ ok: boolean; error?: string }>
  upsertActiveSession: (session: SpatialCaptureSession) => Promise<void>
}

export const useSpatialCaptureStore = create<SpatialCaptureStore>((set, get) => ({
  heads: [],
  activeSessionId: null,
  activeSession: null,
  loading: false,
  error: null,

  loadHeads: async () => {
    const { client, project } = useWorkbenchStore.getState()
    if (!client || !project) {
      set({ heads: [], loading: false })
      return
    }
    set({ loading: true, error: null })
    try {
      const heads = await client.listSpatialCaptureSessions(project.projectId)
      set({ heads, loading: false })
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
}))
