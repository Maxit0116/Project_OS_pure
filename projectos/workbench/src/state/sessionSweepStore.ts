import type {
  ChatSessionRecord,
  SessionContextDigest,
  SessionTidyActionKind,
} from '@contracts/index'
import {
  absorbSessionIntoAnchor,
  applyAttachToAnchor,
  applyRehomeToAnchorGraph,
  applyReparentToHead,
  buildSessionSweepPlan,
  buildSessionTidyPlan,
  chatSessionHasChildren,
  orderSessionIdsForDeletion,
  refineSweepPlanWithJudgments,
  refineTidyPlanWithJudgments,
  resolveSessionSweepExecution,
  sessionIdsInTidyPlan,
  stripLowValueTurns,
  withSessionGraphHeadProjection,
  type AffinityJudgeResult,
  type SessionSweepPlanWithLlm,
  type SessionTidyPlanWithLlm,
} from '@contracts/index'
import { create } from 'zustand'
import { getStoreMessage } from '../i18n/storeMessages'
import {
  bumpAffinityLlmCalls,
  loadSessionSweepPreferences,
  loadSessionSweepRuntime,
  localDateKey,
  normalizeSessionSweepPreferences,
  pruneExpiredSnoozes,
  saveSessionSweepPreferences,
  saveSessionSweepRuntime,
  shouldRunSessionSweepNow,
  snoozeExpiryIso,
  syncAffinityLlmBudgetDay,
  type SessionSweepPreferences,
  type SessionSweepRuntimeState,
} from '../preferences/sessionSweep'
import { useChatSessionStore } from './chatSessionStore'
import { useWorkbenchStore } from './workbenchStore'

export type SessionGraphCenterSheet =
  | { type: 'sweep' }
  | { type: 'tidy' }
  | { type: 'history'; sessionId: string }
  | null

export interface SessionTidyConfirmCluster {
  clusterId: string
  accepted: boolean
  /** Overrides per satellite sessionId. */
  actions: Record<string, SessionTidyActionKind>
}

interface SessionSweepStore {
  preferences: SessionSweepPreferences
  runtime: SessionSweepRuntimeState
  pendingPlan: SessionSweepPlanWithLlm | null
  pendingTidyPlan: SessionTidyPlanWithLlm | null
  centerSheet: SessionGraphCenterSheet
  sweepRunning: boolean
  setPreferences: (patch: Partial<SessionSweepPreferences>) => void
  openSweepReview: () => void
  openTidyReview: () => void
  openPromptHistory: (sessionId: string) => void
  closeCenterSheet: () => void
  /**
   * Daily hygiene: tidy first, then sweep. Separate notifications.
   * `force` ignores the daily gate.
   */
  runHygieneCheck: (options?: { force?: boolean; notify?: boolean }) => Promise<{
    tidy: SessionTidyPlanWithLlm | null
    sweep: SessionSweepPlanWithLlm | null
  }>
  /** @deprecated Prefer runHygieneCheck — kept for settings "scan cleanup only". */
  runSweepCheck: (options?: {
    force?: boolean
    notify?: boolean
  }) => Promise<SessionSweepPlanWithLlm | null>
  confirmSweep: (checkedSessionIds: string[]) => Promise<{ deleted: number; reorganized: number }>
  dismissSweepKeepingAll: () => void
  confirmTidy: (
    clusters: SessionTidyConfirmCluster[],
  ) => Promise<{ attached: number; rehomed: number; absorbed: number }>
  dismissTidyKeepingAll: () => void
}

function persistRuntime(runtime: SessionSweepRuntimeState) {
  saveSessionSweepRuntime(runtime)
}

async function loadAllSessionRecords(): Promise<ChatSessionRecord[]> {
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

function inheritDigestFromParent(
  parent: ChatSessionRecord | null,
): SessionContextDigest | undefined {
  return parent?.contextDigest ?? parent?.inheritedDigest
}

function parsePendingSweep(json: string | null): SessionSweepPlanWithLlm | null {
  if (!json) return null
  try {
    return JSON.parse(json) as SessionSweepPlanWithLlm
  } catch {
    return null
  }
}

function parsePendingTidy(json: string | null): SessionTidyPlanWithLlm | null {
  if (!json) return null
  try {
    return JSON.parse(json) as SessionTidyPlanWithLlm
  } catch {
    return null
  }
}

function filterAbsorbIfDisabled(
  plan: SessionTidyPlanWithLlm,
  allowAbsorb: boolean,
): SessionTidyPlanWithLlm {
  if (allowAbsorb) return plan
  return {
    ...plan,
    clusters: plan.clusters.map((cluster) => ({
      ...cluster,
      defaultAction: cluster.defaultAction === 'absorb' ? 'attach' : cluster.defaultAction,
      members: cluster.members.map((member) => ({
        ...member,
        suggestedAction:
          member.suggestedAction === 'absorb' ? 'attach' : member.suggestedAction,
      })),
    })),
  }
}

function toJudgmentMap(
  record: Record<string, AffinityJudgeResult> | undefined,
): Map<string, AffinityJudgeResult> {
  return new Map(Object.entries(record ?? {}))
}

function notifySeparate(
  kind: 'tidy' | 'sweep',
  title: string,
  body: string,
) {
  const { pushToast, windowFocused } = useWorkbenchStore.getState()
  pushToast({
    type: 'info',
    message: `${title} — ${body}`,
    autoDismiss: 10_000,
  })
  useChatSessionStore.getState().setSessionGraphOpen(true)
  if (!windowFocused) {
    const notify = typeof window !== 'undefined' ? window.projectOS?.notify : undefined
    if (notify?.showDiffReady) {
      void notify
        .showDiffReady({
          title,
          body,
          destination: 'ask',
          runIds: [],
        })
        .catch(() => {
          /* toast already shown */
        })
    }
  }
  void kind
}

const initialRuntime = loadSessionSweepRuntime()

export const useSessionSweepStore = create<SessionSweepStore>((set, get) => ({
  preferences: loadSessionSweepPreferences(),
  runtime: initialRuntime,
  pendingPlan: parsePendingSweep(initialRuntime.pendingReviewJson),
  pendingTidyPlan: parsePendingTidy(initialRuntime.pendingTidyJson),
  centerSheet: null,
  sweepRunning: false,

  setPreferences: (patch) => {
    const preferences = normalizeSessionSweepPreferences({
      ...get().preferences,
      ...patch,
    })
    saveSessionSweepPreferences(preferences)
    set({ preferences })
  },

  openSweepReview: () => {
    useChatSessionStore.getState().setSessionGraphOpen(true)
    set({ centerSheet: { type: 'sweep' } })
  },

  openTidyReview: () => {
    useChatSessionStore.getState().setSessionGraphOpen(true)
    set({ centerSheet: { type: 'tidy' } })
  },

  openPromptHistory: (sessionId) => {
    useChatSessionStore.getState().setSessionGraphOpen(true)
    set({ centerSheet: { type: 'history', sessionId } })
  },

  closeCenterSheet: () => set({ centerSheet: null }),

  runHygieneCheck: async (options = {}) => {
    const { preferences, runtime, sweepRunning } = get()
    if (sweepRunning) {
      return { tidy: get().pendingTidyPlan, sweep: get().pendingPlan }
    }
    if (!options.force && !shouldRunSessionSweepNow(preferences, runtime)) {
      return { tidy: get().pendingTidyPlan, sweep: get().pendingPlan }
    }

    set({ sweepRunning: true })
    try {
      const chat = useChatSessionStore.getState()
      const records = await loadAllSessionRecords()
      const snoozedUntil = pruneExpiredSnoozes(runtime.snoozedUntil)
      const tidySnoozedUntil = pruneExpiredSnoozes(runtime.tidySnoozedUntil)
      const shouldNotify = options.notify !== false
      const { locale, client, project } = useWorkbenchStore.getState()
      const affinityMode = preferences.affinityMode
      let budgetRuntime = syncAffinityLlmBudgetDay(runtime)

      // 1) Continuity tidy (L0 → optional L1)
      let tidyPlan: SessionTidyPlanWithLlm | null = null
      if (preferences.tidyEnabled) {
        const l0Tidy = buildSessionTidyPlan(records, chat.pinnedIds, {
          activeSessionId: chat.activeSessionId,
          snoozedUntil: tidySnoozedUntil,
        })
        if (l0Tidy.clusters.length > 0) {
          let tidyJudgments = new Map<string, AffinityJudgeResult>()
          if (affinityMode !== 'off' && client && project) {
            try {
              const judged = await client.judgeSessionAffinityHygiene(project.projectId, {
                mode: affinityMode,
                callsUsedToday: budgetRuntime.affinityLlmCallsToday,
                tidyPlan: l0Tidy,
                sweepPlan: null,
              })
              tidyJudgments = toJudgmentMap(judged.tidyJudgments)
              budgetRuntime = bumpAffinityLlmCalls(budgetRuntime, judged.calls)
            } catch (error) {
              console.error('[sessionSweepStore] affinity tidy judge failed', error)
            }
          }
          tidyPlan = filterAbsorbIfDisabled(
            refineTidyPlanWithJudgments(l0Tidy, tidyJudgments, affinityMode),
            preferences.allowAbsorb,
          )
          if (tidyPlan.clusters.length === 0) tidyPlan = null
        }
      }

      // 2) Sweep after tidy (L0 → optional L1); tidy members stay excluded
      let sweepPlan: SessionSweepPlanWithLlm | null = null
      if (preferences.enabled) {
        const l0Sweep = buildSessionSweepPlan(records, chat.pinnedIds, {
          activeSessionId: chat.activeSessionId,
          snoozedUntil,
          excludeSessionIds: sessionIdsInTidyPlan(tidyPlan),
        })
        if (l0Sweep.candidates.length > 0) {
          let sweepJudgments = new Map<string, AffinityJudgeResult>()
          if (affinityMode !== 'off' && client && project) {
            try {
              const judged = await client.judgeSessionAffinityHygiene(project.projectId, {
                mode: affinityMode,
                callsUsedToday: budgetRuntime.affinityLlmCallsToday,
                tidyPlan: null,
                sweepPlan: l0Sweep,
              })
              sweepJudgments = toJudgmentMap(judged.sweepJudgments)
              budgetRuntime = bumpAffinityLlmCalls(budgetRuntime, judged.calls)
            } catch (error) {
              console.error('[sessionSweepStore] affinity sweep judge failed', error)
            }
          }
          sweepPlan = refineSweepPlanWithJudgments(l0Sweep, sweepJudgments, affinityMode)
          if (sweepPlan.candidates.length === 0) sweepPlan = null
        }
      }

      const today = localDateKey()
      const nextRuntime: SessionSweepRuntimeState = {
        ...budgetRuntime,
        lastRunDate: today,
        snoozedUntil,
        tidySnoozedUntil,
        pendingTidyJson: tidyPlan ? JSON.stringify(tidyPlan) : null,
        pendingReviewJson: sweepPlan ? JSON.stringify(sweepPlan) : null,
      }
      persistRuntime(nextRuntime)
      set({
        runtime: nextRuntime,
        pendingTidyPlan: tidyPlan,
        pendingPlan: sweepPlan,
      })

      // Separate notifications; tidy toast first.
      if (shouldNotify && preferences.tidyNotifyEnabled && tidyPlan) {
        notifySeparate(
          'tidy',
          getStoreMessage(locale, 'chat.sessionGraph.tidy.notificationTitle', {
            count: tidyPlan.clusters.length,
          }),
          getStoreMessage(locale, 'chat.sessionGraph.tidy.notificationBody'),
        )
      }
      if (shouldNotify && preferences.notifyEnabled && sweepPlan) {
        notifySeparate(
          'sweep',
          getStoreMessage(locale, 'chat.sessionGraph.sweep.notificationTitle', {
            count: sweepPlan.candidates.length,
          }),
          getStoreMessage(locale, 'chat.sessionGraph.sweep.notificationBody'),
        )
      }

      return { tidy: tidyPlan, sweep: sweepPlan }
    } finally {
      set({ sweepRunning: false })
    }
  },

  runSweepCheck: async (options = {}) => {
    const result = await get().runHygieneCheck(options)
    return result.sweep
  },

  dismissSweepKeepingAll: () => {
    const { pendingPlan, preferences, runtime } = get()
    if (!pendingPlan) {
      set({ centerSheet: null })
      return
    }
    const expiry = snoozeExpiryIso(preferences.snoozeDays)
    const snoozedUntil = { ...pruneExpiredSnoozes(runtime.snoozedUntil) }
    for (const candidate of pendingPlan.candidates) {
      snoozedUntil[candidate.sessionId] = expiry
    }
    const nextRuntime: SessionSweepRuntimeState = {
      ...runtime,
      snoozedUntil,
      pendingReviewJson: null,
    }
    persistRuntime(nextRuntime)
    set({ runtime: nextRuntime, pendingPlan: null, centerSheet: null })
  },

  dismissTidyKeepingAll: () => {
    const { pendingTidyPlan, preferences, runtime } = get()
    if (!pendingTidyPlan) {
      set({ centerSheet: null })
      return
    }
    const expiry = snoozeExpiryIso(preferences.snoozeDays)
    const tidySnoozedUntil = { ...pruneExpiredSnoozes(runtime.tidySnoozedUntil) }
    for (const cluster of pendingTidyPlan.clusters) {
      tidySnoozedUntil[cluster.id] = expiry
      for (const member of cluster.members) {
        tidySnoozedUntil[member.sessionId] = expiry
      }
    }
    const nextRuntime: SessionSweepRuntimeState = {
      ...runtime,
      tidySnoozedUntil,
      pendingTidyJson: null,
    }
    persistRuntime(nextRuntime)
    set({ runtime: nextRuntime, pendingTidyPlan: null, centerSheet: null })
  },

  confirmSweep: async (checkedSessionIds) => {
    const { pendingPlan, preferences, runtime } = get()
    const { client, project, locale, pushToast } = useWorkbenchStore.getState()
    if (!pendingPlan || !client || !project) {
      return { deleted: 0, reorganized: 0 }
    }

    const chat = useChatSessionStore.getState()
    const checked = new Set(checkedSessionIds)
    const keptIds = pendingPlan.candidates
      .map((candidate) => candidate.sessionId)
      .filter((id) => !checked.has(id))

    const { deleteIds, reparent } = resolveSessionSweepExecution(
      pendingPlan,
      checkedSessionIds,
      chat.heads,
    )

    let reorganized = 0
    const now = new Date().toISOString()

    for (const edge of reparent) {
      const child = await client.getChatSession(project.projectId, edge.childId)
      if (!child) continue
      const newParent = edge.newParentId
        ? await client.getChatSession(project.projectId, edge.newParentId)
        : null
      const nextHead = applyReparentToHead(child.head, edge.newParentId, now)
      let nextRecord: ChatSessionRecord = {
        ...child,
        head: nextHead,
        inheritedDigest: inheritDigestFromParent(newParent),
      }
      nextRecord = withSessionGraphHeadProjection(stripLowValueTurns(nextRecord))
      await client.upsertChatSession(project.projectId, nextRecord)
      try {
        await client.summarizeChatSessionTitle(project.projectId, edge.childId)
      } catch {
        /* projection already persisted */
      }
      reorganized += 1
    }

    for (const candidate of pendingPlan.candidates) {
      if (!checked.has(candidate.sessionId)) continue
      if (candidate.action !== 'reorganize') continue
      if (deleteIds.includes(candidate.sessionId)) continue
      const record = await client.getChatSession(project.projectId, candidate.sessionId)
      if (!record) continue
      const cleaned = withSessionGraphHeadProjection(stripLowValueTurns(record))
      await client.upsertChatSession(project.projectId, cleaned)
      try {
        await client.summarizeChatSessionTitle(project.projectId, candidate.sessionId)
      } catch {
        /* projection already persisted */
      }
      reorganized += 1
    }

    let deleted = 0
    for (const id of deleteIds) {
      const ok = await client.deleteChatSession(project.projectId, id)
      if (ok) deleted += 1
    }

    const index = await client.getChatSessionIndex(project.projectId)
    useChatSessionStore.setState({ heads: index.heads, pinnedIds: index.pinnedIds })

    const expiry = snoozeExpiryIso(preferences.snoozeDays)
    const snoozedUntil = { ...pruneExpiredSnoozes(runtime.snoozedUntil) }
    for (const id of keptIds) {
      snoozedUntil[id] = expiry
    }
    for (const id of deleteIds) {
      delete snoozedUntil[id]
    }

    const nextRuntime: SessionSweepRuntimeState = {
      ...runtime,
      snoozedUntil,
      pendingReviewJson: null,
    }
    persistRuntime(nextRuntime)
    set({ runtime: nextRuntime, pendingPlan: null, centerSheet: null })

    pushToast({
      type: 'success',
      message: getStoreMessage(locale, 'chat.sessionGraph.sweep.confirmDone', {
        deleted,
        reorganized,
      }),
    })

    return { deleted, reorganized }
  },

  confirmTidy: async (clusterDecisions) => {
    const { pendingTidyPlan, preferences, runtime } = get()
    const { client, project, locale, pushToast } = useWorkbenchStore.getState()
    if (!pendingTidyPlan || !client || !project) {
      return { attached: 0, rehomed: 0, absorbed: 0 }
    }

    let attached = 0
    let rehomed = 0
    let absorbed = 0
    const expiry = snoozeExpiryIso(preferences.snoozeDays)
    const tidySnoozedUntil = { ...pruneExpiredSnoozes(runtime.tidySnoozedUntil) }
    const decisionById = new Map(clusterDecisions.map((item) => [item.clusterId, item]))

    for (const cluster of pendingTidyPlan.clusters) {
      const decision = decisionById.get(cluster.id)
      if (!decision || !decision.accepted) {
        tidySnoozedUntil[cluster.id] = expiry
        for (const member of cluster.members) {
          tidySnoozedUntil[member.sessionId] = expiry
        }
        continue
      }

      const anchor = await client.getChatSession(project.projectId, cluster.anchorSessionId)
      if (!anchor) continue

      let anchorRecord = anchor
      const satellites = cluster.members.filter((member) => member.role === 'satellite')
      const toDelete: string[] = []
      let clusterAbsorbed = 0

      for (const satelliteMeta of satellites) {
        const action =
          decision.actions[satelliteMeta.sessionId] ??
          satelliteMeta.suggestedAction ??
          cluster.defaultAction
        const effective: SessionTidyActionKind =
          action === 'absorb' && !preferences.allowAbsorb ? 'attach' : action

        const satellite = await client.getChatSession(project.projectId, satelliteMeta.sessionId)
        if (!satellite) continue

        if (effective === 'absorb') {
          // Reparent any children of the satellite onto the anchor before absorb+delete.
          const index = await client.getChatSessionIndex(project.projectId)
          const childIds = index.heads
            .filter((head) => head.parentSessionId === satellite.head.id)
            .map((head) => head.id)
          for (const childId of childIds) {
            const child = await client.getChatSession(project.projectId, childId)
            if (!child) continue
            const moved = applyAttachToAnchor(child, anchorRecord)
            await client.upsertChatSession(project.projectId, moved)
          }
          anchorRecord = absorbSessionIntoAnchor(anchorRecord, satellite)
          await client.upsertChatSession(project.projectId, anchorRecord)
          toDelete.push(satellite.head.id)
          clusterAbsorbed += 1
          absorbed += 1
          continue
        }

        if (effective === 'attach') {
          const next = applyAttachToAnchor(satellite, anchorRecord)
          await client.upsertChatSession(project.projectId, next)
          try {
            await client.summarizeChatSessionTitle(project.projectId, satellite.head.id)
          } catch {
            /* ok */
          }
          attached += 1
          continue
        }

        const rehomedRecord = applyRehomeToAnchorGraph(satellite, anchorRecord)
        await client.upsertChatSession(project.projectId, rehomedRecord)
        rehomed += 1
      }

      if (clusterAbsorbed > 0) {
        try {
          await client.summarizeChatSessionTitle(project.projectId, anchorRecord.head.id)
        } catch {
          /* ok */
        }
      }

      // Delete absorbed satellites (children first if any remain).
      if (toDelete.length > 0) {
        const index = await client.getChatSessionIndex(project.projectId)
        for (const id of orderSessionIdsForDeletion(toDelete, index.heads)) {
          // Only delete when no remaining children (should be reparented already).
          if (chatSessionHasChildren(index.heads, id)) {
            const stillChildren = index.heads.filter((head) => head.parentSessionId === id)
            for (const child of stillChildren) {
              const childRecord = await client.getChatSession(project.projectId, child.id)
              if (!childRecord) continue
              await client.upsertChatSession(
                project.projectId,
                applyAttachToAnchor(childRecord, anchorRecord),
              )
            }
          }
          await client.deleteChatSession(project.projectId, id)
        }
      }
    }

    const index = await client.getChatSessionIndex(project.projectId)
    useChatSessionStore.setState({ heads: index.heads, pinnedIds: index.pinnedIds })

    const nextRuntime: SessionSweepRuntimeState = {
      ...runtime,
      tidySnoozedUntil,
      pendingTidyJson: null,
    }
    persistRuntime(nextRuntime)
    set({ runtime: nextRuntime, pendingTidyPlan: null, centerSheet: null })

    pushToast({
      type: 'success',
      message: getStoreMessage(locale, 'chat.sessionGraph.tidy.confirmDone', {
        attached,
        rehomed,
        absorbed,
      }),
    })

    return { attached, rehomed, absorbed }
  },
}))
