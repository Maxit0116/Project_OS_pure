import type { ChatSessionRecord, SessionRouteAction, SessionRouteSuggestion } from '@contracts/index'
import { buildSessionRouteSuggestion } from '@contracts/index'
import { create } from 'zustand'
import { getStoreMessage } from '../i18n/storeMessages'
import {
  loadSessionRoutePreferences,
  normalizeSessionRoutePreferences,
  saveSessionRoutePreferences,
  type SessionRoutePreferences,
} from '../preferences/sessionRoute'
import { useChatSessionStore } from './chatSessionStore'
import { useWorkbenchStore } from './workbenchStore'

interface SessionRouteStore {
  preferences: SessionRoutePreferences
  matching: boolean
  preview: SessionRouteSuggestion | null
  lastApplied: SessionRouteSuggestion | null
  setPreferences: (patch: Partial<SessionRoutePreferences>) => void
  clearPreview: () => void
  /** Score prompt against sessions; auto-apply when high confidence. */
  routeFromPrompt: (prompt: string) => Promise<SessionRouteSuggestion | null>
  applySuggestion: (suggestion: SessionRouteSuggestion) => Promise<boolean>
  applyActionOverride: (
    suggestion: SessionRouteSuggestion,
    action: SessionRouteAction,
    targetSessionId?: string,
  ) => Promise<boolean>
}

async function loadRecords(): Promise<ChatSessionRecord[]> {
  const { client, project } = useWorkbenchStore.getState()
  if (!client || !project) return []
  const index = await client.getChatSessionIndex(project.projectId)
  const records: ChatSessionRecord[] = []
  for (const head of index.heads) {
    if (head.isArchived) continue
    const record = await client.getChatSession(project.projectId, head.id)
    if (record) records.push(record)
  }
  return records
}

function toastForApplied(suggestion: SessionRouteSuggestion) {
  const { locale, pushToast } = useWorkbenchStore.getState()
  const key =
    suggestion.action === 'branch'
      ? 'chat.sessionRoute.appliedBranch'
      : suggestion.action === 'switch'
        ? 'chat.sessionRoute.appliedSwitch'
        : 'chat.sessionRoute.appliedStay'
  pushToast({
    type: 'success',
    message: getStoreMessage(locale, key, { title: suggestion.title }),
  })
}

export const useSessionRouteStore = create<SessionRouteStore>((set, get) => ({
  preferences: loadSessionRoutePreferences(),
  matching: false,
  preview: null,
  lastApplied: null,

  setPreferences: (patch) => {
    const preferences = normalizeSessionRoutePreferences({
      ...get().preferences,
      ...patch,
    })
    saveSessionRoutePreferences(preferences)
    set({ preferences })
  },

  clearPreview: () => set({ preview: null }),

  routeFromPrompt: async (prompt) => {
    const { preferences } = get()
    if (!preferences.enabled) return null
    const trimmed = prompt.trim()
    if (!trimmed) return null

    set({ matching: true })
    try {
      const chat = useChatSessionStore.getState()
      const records = await loadRecords()
      const suggestion = buildSessionRouteSuggestion(trimmed, records, {
        activeSessionId: chat.activeSessionId,
        autoApplyHighConfidence: preferences.autoApplyHighConfidence,
      })

      if (suggestion.autoApply) {
        const ok = await get().applySuggestion(suggestion)
        if (ok) {
          set({ preview: null, lastApplied: suggestion })
          return suggestion
        }
      }

      set({ preview: suggestion })
      return suggestion
    } finally {
      set({ matching: false })
    }
  },

  applySuggestion: async (suggestion) => {
    const chat = useChatSessionStore.getState()
    const { locale, pushToast } = useWorkbenchStore.getState()

    try {
      if (suggestion.action === 'stay') {
        set({ preview: null, lastApplied: suggestion })
        toastForApplied(suggestion)
        return true
      }

      if (suggestion.action === 'switch') {
        await chat.switchSession(suggestion.targetSessionId)
        set({ preview: null, lastApplied: suggestion })
        toastForApplied(suggestion)
        return true
      }

      if (suggestion.action === 'branch') {
        const childId = await chat.forkSession(
          suggestion.targetSessionId,
          suggestion.forkMessageId,
        )
        if (!childId) {
          pushToast({
            type: 'warning',
            message: getStoreMessage(locale, 'chat.sessionRoute.branchFailed'),
          })
          return false
        }
        set({ preview: null, lastApplied: suggestion })
        toastForApplied(suggestion)
        return true
      }

      return false
    } catch (error) {
      console.error('[sessionRoute] apply failed', error)
      pushToast({
        type: 'error',
        message: getStoreMessage(locale, 'chat.sessionRoute.applyFailed'),
      })
      return false
    }
  },

  applyActionOverride: async (suggestion, action, targetSessionId) => {
    const target =
      targetSessionId ??
      (action === 'stay'
        ? useChatSessionStore.getState().activeSessionId ?? suggestion.targetSessionId
        : suggestion.targetSessionId)
    const alt = suggestion.alternatives.find((item) => item.sessionId === target)
    const next: SessionRouteSuggestion = {
      ...suggestion,
      action,
      targetSessionId: target,
      title: alt?.title ?? suggestion.title,
      forkMessageId: alt?.forkMessageId ?? suggestion.forkMessageId,
      autoApply: false,
    }
    return get().applySuggestion(next)
  },
}))
