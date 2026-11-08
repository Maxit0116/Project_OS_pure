import type { Locale } from '../i18n/types'
import { getStoreMessage } from '../i18n/storeMessages'
import type { CenterTab, CodeSubTab, RightPanelTab } from '../state/workbenchStore'
import {
  NOTIFICATION_MIN_LINGER_MS,
  NOTIFICATION_SWIPE_DISMISS_THRESHOLD_PX,
} from './notificationCenterTypes'

export type AgentCompletionKind = 'ask' | 'diff'

export type DiffReadyNotificationContext = {
  centerTab: CenterTab
  codeSubTab: CodeSubTab
  windowFocused: boolean
  rightPanelTab: RightPanelTab
  agentFlowOpen: boolean
}

export type DiffReadyCompletion = {
  kind: AgentCompletionKind
  runId?: string
  fileCount?: number
  summary: string
  completedAt: number
  context: DiffReadyNotificationContext
}

export type DiffReadyNotificationChannel = 'system' | 'map_banner' | 'center_banner'

/** Short window to merge back-to-back completions without delaying the first alert. */
export const DIFF_READY_BATCH_WINDOW_MS = 400

export function captureDiffReadyNotificationContext(state: {
  centerTab: CenterTab
  codeSubTab: CodeSubTab
  windowFocused: boolean
  rightPanelTab: RightPanelTab
  agentFlowOpen: boolean
}): DiffReadyNotificationContext {
  return {
    centerTab: state.centerTab,
    codeSubTab: state.codeSubTab,
    windowFocused: state.windowFocused,
    rightPanelTab: state.rightPanelTab,
    agentFlowOpen: state.agentFlowOpen,
  }
}

/** @deprecated Auto-dismiss removed; linger gate is NOTIFICATION_MIN_LINGER_MS */
export const DIFF_READY_BANNER_AUTO_DISMISS_MS = NOTIFICATION_MIN_LINGER_MS
/** @deprecated Prefer NOTIFICATION_SWIPE_DISMISS_THRESHOLD_PX */
export const DIFF_READY_SWIPE_DISMISS_THRESHOLD_PX = NOTIFICATION_SWIPE_DISMISS_THRESHOLD_PX

export function shouldSuppressDiffReadyNotification(state: {
  enabled: boolean
  kind: AgentCompletionKind
  context: DiffReadyNotificationContext
}): boolean {
  if (!state.enabled) return true
  const { centerTab, codeSubTab, windowFocused, rightPanelTab, agentFlowOpen } = state.context
  // Only suppress when the user is already looking at the result *and* the
  // window is focused. Being on the diff tab while away (other Space / app)
  // must still deliver a system notification.
  if (
    state.kind === 'diff' &&
    windowFocused &&
    centerTab === 'code' &&
    codeSubTab === 'diff'
  ) {
    return true
  }
  if (
    state.kind === 'ask' &&
    windowFocused &&
    (agentFlowOpen || rightPanelTab === 'chat')
  ) {
    return true
  }
  return false
}

export function filterDiffReadyCompletionsForNotification(
  items: DiffReadyCompletion[],
  enabled: boolean,
): DiffReadyCompletion[] {
  return items.filter(
    (item) =>
      !shouldSuppressDiffReadyNotification({
        enabled,
        kind: item.kind,
        context: item.context,
      }),
  )
}

export function resolveNotificationChannel(state: {
  windowFocused: boolean
  centerTab: CenterTab
}): DiffReadyNotificationChannel {
  if (!state.windowFocused) return 'system'
  if (state.centerTab === 'function-map') return 'map_banner'
  return 'center_banner'
}

/** Prefer completion-time focus so a later focus regain cannot downgrade a system alert. */
export function resolveNotificationChannelForCompletions(
  items: DiffReadyCompletion[],
  live: { windowFocused: boolean; centerTab: CenterTab },
): DiffReadyNotificationChannel {
  const windowFocused =
    live.windowFocused && items.every((item) => item.context.windowFocused)
  return resolveNotificationChannel({
    windowFocused,
    centerTab: live.centerTab,
  })
}

/**
 * Build runIds that always satisfy desktop `parseDiffReadyNotificationPayload`
 * (non-empty, unique, bounded). Missing `runId` historically produced `[]` and
 * made `notify:showDiffReady` throw "Notification payload is invalid".
 */
export function runIdsForDiffReadyCompletions(
  items: DiffReadyCompletion[],
): string[] {
  const seen = new Set<string>()
  return items.map((item, index) => {
    const base =
      item.runId && item.runId.trim() && !item.runId.includes('\0')
        ? item.runId.trim().slice(0, 256)
        : `${item.kind}:${item.completedAt}:${index}`
    let candidate = base
    let suffix = 0
    while (seen.has(candidate)) {
      suffix += 1
      candidate = `${base}#${suffix}`.slice(0, 256)
    }
    seen.add(candidate)
    return candidate
  })
}

export function mergeDiffReadyCompletions(
  items: DiffReadyCompletion[],
  locale: Locale,
): { title: string; body: string; destination: AgentCompletionKind; runIds: string[] } {
  const runIds = runIdsForDiffReadyCompletions(items)
  const title = getStoreMessage(locale, 'diffReadyNotify.title')

  if (items.length === 1) {
    const item = items[0]!
    if (item.kind === 'ask') {
      return {
        title,
        body: getStoreMessage(locale, 'diffReadyNotify.askSingle', {
          summary: item.summary,
        }),
        destination: 'ask',
        runIds,
      }
    }
    if ((item.fileCount ?? 0) === 0) {
      return {
        title,
        body: getStoreMessage(locale, 'diffReadyNotify.changeComplete', {
          summary: item.summary,
        }),
        destination: 'diff',
        runIds,
      }
    }
    return {
      title,
      body: getStoreMessage(locale, 'diffReadyNotify.single', {
        summary: item.summary,
        count: item.fileCount ?? 0,
      }),
      destination: 'diff',
      runIds,
    }
  }

  const fileCount = items.reduce((sum, item) => sum + (item.fileCount ?? 0), 0)
  const askCount = items.filter((item) => item.kind === 'ask').length
  const diffCount = items.length - askCount
  if (diffCount === 0) {
    return {
      title,
      body: getStoreMessage(locale, 'diffReadyNotify.askBatch', {
        taskCount: askCount,
      }),
      destination: 'ask',
      runIds,
    }
  }
  return {
    title,
    body: getStoreMessage(locale, 'diffReadyNotify.batch', {
      taskCount: items.length,
      fileCount,
    }),
    destination: 'diff',
    runIds,
  }
}

export function truncateDiffReadySummary(text: string, maxLength = 72): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength - 1)}…`
}
