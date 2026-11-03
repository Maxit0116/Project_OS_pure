import { create } from 'zustand'
import type { AgentRunIndexEntry, ProjectOSApi } from '@contracts/index'
import { createWorkbenchClient } from '../../../data/workbenchClient'
import type {
  AgentPoolHistoryEntry,
  ComposeSubagentLike,
} from './projectAgentPool'
import {
  buildHistoryEntryFromTask,
  createPoolRunId,
  historyEntryFromIndexEntry,
  mergeHistoryWithIndexEntries,
  type AgentPoolTask,
} from './projectAgentPool'

function poolApi(): ProjectOSApi | null {
  try {
    return createWorkbenchClient()
  } catch {
    return null
  }
}

function persistAcceptanceToDisk(
  runId: string | null | undefined,
  acceptance: AgentPoolTask['acceptance'],
): void {
  if (!runId || acceptance === 'none' || acceptance === 'pending') return
  const client = poolApi()
  if (!client?.setAgentRunAcceptance) return
  void client.setAgentRunAcceptance({ runId, acceptance }).catch(() => {
    // Best-effort: local overlay already updated; disk may be unavailable in tests.
  })
}

const STORAGE_KEY = 'projectos.agentPool.v1'

interface PersistedPoolState {
  poolRunIdByRootRunId: Record<string, string>
  historyByTaskId: Record<string, AgentPoolHistoryEntry[]>
  acceptanceByTaskId: Record<string, AgentPoolTask['acceptance']>
  removedTaskIds: string[]
}

function loadPersisted(): PersistedPoolState {
  if (typeof localStorage === 'undefined') {
    return {
      poolRunIdByRootRunId: {},
      historyByTaskId: {},
      acceptanceByTaskId: {},
      removedTaskIds: [],
    }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {
        poolRunIdByRootRunId: {},
        historyByTaskId: {},
        acceptanceByTaskId: {},
        removedTaskIds: [],
      }
    }
    const parsed = JSON.parse(raw) as Partial<PersistedPoolState>
    return {
      poolRunIdByRootRunId: parsed.poolRunIdByRootRunId ?? {},
      historyByTaskId: parsed.historyByTaskId ?? {},
      acceptanceByTaskId: parsed.acceptanceByTaskId ?? {},
      removedTaskIds: parsed.removedTaskIds ?? [],
    }
  } catch {
    return {
      poolRunIdByRootRunId: {},
      historyByTaskId: {},
      acceptanceByTaskId: {},
      removedTaskIds: [],
    }
  }
}

function persistSlice(state: {
  poolRunIdByRootRunId: Record<string, string>
  historyByTaskId: Record<string, AgentPoolHistoryEntry[]>
  acceptanceByTaskId: Record<string, AgentPoolTask['acceptance']>
  removedTaskIds: string[]
}): void {
  if (typeof localStorage === 'undefined') return
  try {
    const payload: PersistedPoolState = {
      poolRunIdByRootRunId: state.poolRunIdByRootRunId,
      historyByTaskId: state.historyByTaskId,
      acceptanceByTaskId: state.acceptanceByTaskId,
      removedTaskIds: state.removedTaskIds,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore quota / private-mode failures — Pool still works in-memory.
  }
}

const initialPersisted = loadPersisted()

interface AgentPoolStore {
  removedTaskIds: string[]
  reviewingTaskId: string | null
  continuingTaskIds: string[]
  historyByTaskId: Record<string, AgentPoolHistoryEntry[]>
  acceptanceByTaskId: Record<string, AgentPoolTask['acceptance']>
  /** Independent multi-lane expand (DevPlan: expanding one must not collapse others). */
  expandedTaskIds: string[]
  historyExpandedTaskIds: string[]
  composeSubagents: ComposeSubagentLike[]
  reviewingTaskSnapshot: AgentPoolTask | null
  continueFeedbackByTaskId: Record<string, string>
  /** rootRunId → independent poolRunId */
  poolRunIdByRootRunId: Record<string, string>
  activePoolRunId: string | null

  ensurePoolRunId: (rootRunId: string | null, sessionId: string | null) => string | null
  /** Ensure disk PoolRun + bind definition (async; updates activePoolRunId). */
  ensureDiskPoolRun: (input: {
    rootRunId: string | null
    sessionId: string | null
    definitionId?: string
    title?: string
  }) => Promise<string | null>
  loadDefinitionHistory: (definitionId: string) => Promise<AgentRunIndexEntry[]>
  /** Merge durable index history into local overlay for a task lane. */
  hydrateTaskHistoryFromDisk: (input: {
    taskId: string
    definitionId: string
    activeRunId: string | null
  }) => Promise<void>
  startReview: (task: AgentPoolTask) => void
  acceptTask: (taskId: string) => void
  continueTask: (taskId: string, feedback?: string) => void
  cancelReview: () => void
  toggleExpandedTaskId: (taskId: string) => void
  setExpandedTaskId: (taskId: string | null) => void
  toggleHistoryExpandedTaskId: (taskId: string) => void
  setHistoryExpandedTaskId: (taskId: string | null) => void
  setComposeSubagents: (slots: ComposeSubagentLike[]) => void
  clearContinuing: (taskId: string) => void
}

export const useAgentPoolStore = create<AgentPoolStore>((set, get) => ({
  removedTaskIds: initialPersisted.removedTaskIds,
  reviewingTaskId: null,
  continuingTaskIds: [],
  historyByTaskId: initialPersisted.historyByTaskId,
  acceptanceByTaskId: initialPersisted.acceptanceByTaskId,
  expandedTaskIds: [],
  historyExpandedTaskIds: [],
  composeSubagents: [],
  reviewingTaskSnapshot: null,
  continueFeedbackByTaskId: {},
  poolRunIdByRootRunId: initialPersisted.poolRunIdByRootRunId,
  activePoolRunId: null,

  ensurePoolRunId: (rootRunId, _sessionId) => {
    if (!rootRunId) {
      set({ activePoolRunId: null })
      return null
    }
    const existing = get().poolRunIdByRootRunId[rootRunId]
    if (existing) {
      set({ activePoolRunId: existing })
      return existing
    }
    const poolRunId = createPoolRunId()
    const poolRunIdByRootRunId = {
      ...get().poolRunIdByRootRunId,
      [rootRunId]: poolRunId,
    }
    set({ poolRunIdByRootRunId, activePoolRunId: poolRunId })
    persistSlice({
      poolRunIdByRootRunId,
      historyByTaskId: get().historyByTaskId,
      acceptanceByTaskId: get().acceptanceByTaskId,
      removedTaskIds: get().removedTaskIds,
    })
    return poolRunId
  },

  ensureDiskPoolRun: async ({ rootRunId, sessionId, definitionId, title }) => {
    const localId = get().ensurePoolRunId(rootRunId, sessionId)
    if (!rootRunId) return localId
    const client = poolApi()
    if (!client?.ensureAgentPoolRun) return localId
    try {
      const pool = await client.ensureAgentPoolRun({
        rootRunId,
        sessionId,
        existingPoolRunId: localId,
        triggerSource: 'chat',
        definitionId,
        title,
      })
      const poolRunIdByRootRunId = {
        ...get().poolRunIdByRootRunId,
        [rootRunId]: pool.poolRunId,
      }
      set({ poolRunIdByRootRunId, activePoolRunId: pool.poolRunId })
      persistSlice({
        poolRunIdByRootRunId,
        historyByTaskId: get().historyByTaskId,
        acceptanceByTaskId: get().acceptanceByTaskId,
        removedTaskIds: get().removedTaskIds,
      })
      return pool.poolRunId
    } catch {
      return localId
    }
  },

  loadDefinitionHistory: async (definitionId) => {
    const client = poolApi()
    if (!client?.listAgentRunsByDefinition) return []
    try {
      return await client.listAgentRunsByDefinition({
        definitionId,
        limit: 40,
      })
    } catch {
      return []
    }
  },

  hydrateTaskHistoryFromDisk: async ({ taskId, definitionId, activeRunId }) => {
    const entries = await get().loadDefinitionHistory(definitionId)
    if (entries.length === 0) return
    const diskCards = entries.map((entry) => historyEntryFromIndexEntry(entry))
    const local = get().historyByTaskId[taskId] ?? []
    const merged = mergeHistoryWithIndexEntries(local, diskCards, activeRunId)
    const sameLength = merged.length === local.length
    const sameIds =
      sameLength && merged.every((entry, index) => entry.id === local[index]?.id)
    if (sameIds) return
    const historyByTaskId = {
      ...get().historyByTaskId,
      [taskId]: merged,
    }
    set({ historyByTaskId })
    persistSlice({
      poolRunIdByRootRunId: get().poolRunIdByRootRunId,
      historyByTaskId,
      acceptanceByTaskId: get().acceptanceByTaskId,
      removedTaskIds: get().removedTaskIds,
    })
  },

  startReview: (task) => {
    set({
      reviewingTaskId: task.taskId,
      reviewingTaskSnapshot: task,
    })
  },

  acceptTask: (taskId) => {
    const { removedTaskIds, reviewingTaskId, acceptanceByTaskId, reviewingTaskSnapshot } =
      get()
    const nextAcceptance = {
      ...acceptanceByTaskId,
      [taskId]: 'accepted' as const,
    }
    const nextRemoved = removedTaskIds.includes(taskId)
      ? removedTaskIds
      : [...removedTaskIds, taskId]
    set({
      removedTaskIds: nextRemoved,
      acceptanceByTaskId: nextAcceptance,
      reviewingTaskId: reviewingTaskId === taskId ? null : reviewingTaskId,
      reviewingTaskSnapshot:
        reviewingTaskId === taskId ? null : get().reviewingTaskSnapshot,
      continuingTaskIds: get().continuingTaskIds.filter((id) => id !== taskId),
    })
    persistSlice({
      poolRunIdByRootRunId: get().poolRunIdByRootRunId,
      historyByTaskId: get().historyByTaskId,
      acceptanceByTaskId: nextAcceptance,
      removedTaskIds: nextRemoved,
    })
    persistAcceptanceToDisk(reviewingTaskSnapshot?.runId, 'accepted')
  },

  continueTask: (taskId, feedback) => {
    const snapshot = get().reviewingTaskSnapshot
    if (!snapshot || snapshot.taskId !== taskId) {
      set({
        reviewingTaskId: null,
        reviewingTaskSnapshot: null,
      })
      return
    }
    const entry = buildHistoryEntryFromTask({
      ...snapshot,
      acceptance: 'rejected',
    })
    const prev = get().historyByTaskId[taskId] ?? []
    const historyByTaskId = {
      ...get().historyByTaskId,
      [taskId]: [...prev, entry],
    }
    const acceptanceByTaskId = {
      ...get().acceptanceByTaskId,
      [taskId]: 'rejected' as const,
    }
    const historyExpandedTaskIds = get().historyExpandedTaskIds.includes(taskId)
      ? get().historyExpandedTaskIds
      : [...get().historyExpandedTaskIds, taskId]
    set({
      historyByTaskId,
      acceptanceByTaskId,
      reviewingTaskId: null,
      reviewingTaskSnapshot: null,
      continuingTaskIds: get().continuingTaskIds.includes(taskId)
        ? get().continuingTaskIds
        : [...get().continuingTaskIds, taskId],
      continueFeedbackByTaskId: feedback?.trim()
        ? { ...get().continueFeedbackByTaskId, [taskId]: feedback.trim() }
        : get().continueFeedbackByTaskId,
      historyExpandedTaskIds,
    })
    persistSlice({
      poolRunIdByRootRunId: get().poolRunIdByRootRunId,
      historyByTaskId,
      acceptanceByTaskId,
      removedTaskIds: get().removedTaskIds,
    })
    persistAcceptanceToDisk(snapshot.runId, 'rejected')
  },

  cancelReview: () => {
    set({ reviewingTaskId: null, reviewingTaskSnapshot: null })
  },

  toggleExpandedTaskId: (taskId) => {
    const current = get().expandedTaskIds
    set({
      expandedTaskIds: current.includes(taskId)
        ? current.filter((id) => id !== taskId)
        : [...current, taskId],
    })
  },

  setExpandedTaskId: (taskId) => {
    if (taskId == null) {
      set({ expandedTaskIds: [] })
      return
    }
    const current = get().expandedTaskIds
    if (!current.includes(taskId)) {
      set({ expandedTaskIds: [...current, taskId] })
    }
  },

  toggleHistoryExpandedTaskId: (taskId) => {
    const current = get().historyExpandedTaskIds
    set({
      historyExpandedTaskIds: current.includes(taskId)
        ? current.filter((id) => id !== taskId)
        : [...current, taskId],
    })
  },

  setHistoryExpandedTaskId: (taskId) => {
    if (taskId == null) {
      set({ historyExpandedTaskIds: [] })
      return
    }
    const current = get().historyExpandedTaskIds
    if (!current.includes(taskId)) {
      set({ historyExpandedTaskIds: [...current, taskId] })
    }
  },

  setComposeSubagents: (slots) => set({ composeSubagents: slots }),

  clearContinuing: (taskId) => {
    set({
      continuingTaskIds: get().continuingTaskIds.filter((id) => id !== taskId),
    })
  },
}))

export function agentPoolOverlayFromStore(state: {
  removedTaskIds: string[]
  reviewingTaskId: string | null
  continuingTaskIds: string[]
  historyByTaskId: Record<string, AgentPoolHistoryEntry[]>
  acceptanceByTaskId?: Record<string, AgentPoolTask['acceptance']>
}) {
  return {
    removedTaskIds: new Set(state.removedTaskIds),
    reviewingTaskIds: new Set(
      state.reviewingTaskId ? [state.reviewingTaskId] : [],
    ),
    continuingTaskIds: new Set(state.continuingTaskIds),
    historyByTaskId: state.historyByTaskId,
    acceptanceByTaskId: state.acceptanceByTaskId ?? {},
  }
}
