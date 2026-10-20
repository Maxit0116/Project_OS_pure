import { parseSpatialPinChatContent } from './spatialPinChatDisplay'

export const MIN_USER_TURNS_FOR_NAV = 3
export const NAV_PREVIEW_MAX_CHARS = 100
/** Above this count, markers use compact proportional layout (M1 density). */
export const NAV_DENSE_TURN_THRESHOLD = 40
export const NAV_FLASH_MS = 1200

export interface NavTurnMessage {
  id: string
  role: string
  content: string
  timestamp: string
  checkpointId?: string
}

export interface NavTurnActivityHint {
  anchorMessageId?: string
  status: 'running' | 'complete' | 'error' | string
  id: string
}

/** Visual status on a marker — priority: error > running > checkpoint. */
export type NavTurnStatus = 'running' | 'checkpoint' | 'error'

export interface NavTurn {
  id: string
  preview: string
  timestamp: string
  status?: NavTurnStatus
  /** First anchored activity for optional Agent Flow jump (M2). */
  activityId?: string
}

/** Collapse whitespace and truncate for rail hover / aria labels. */
export function truncateNavPreview(text: string, maxChars = NAV_PREVIEW_MAX_CHARS): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= maxChars) return collapsed
  return `${collapsed.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`
}

/** Prefer human prompt text when the message embeds a spatial-pin block. */
export function previewSourceForUserContent(content: string): string {
  const spatial = parseSpatialPinChatContent(content)
  return spatial?.prompt?.trim() || content
}

export function resolveTurnStatus(
  message: Pick<NavTurnMessage, 'id' | 'checkpointId'>,
  activities: readonly NavTurnActivityHint[],
): NavTurnStatus | undefined {
  const anchored = activities.filter((activity) => activity.anchorMessageId === message.id)
  if (anchored.some((activity) => activity.status === 'error')) return 'error'
  if (anchored.some((activity) => activity.status === 'running')) return 'running'
  if (message.checkpointId) return 'checkpoint'
  return undefined
}

function pickActivityId(
  messageId: string,
  activities: readonly NavTurnActivityHint[],
): string | undefined {
  const anchored = activities.filter((activity) => activity.anchorMessageId === messageId)
  const error = anchored.find((activity) => activity.status === 'error')
  if (error) return error.id
  const running = anchored.find((activity) => activity.status === 'running')
  if (running) return running.id
  return anchored[0]?.id
}

export function collectUserTurns(
  messages: readonly NavTurnMessage[],
  activities: readonly NavTurnActivityHint[] = [],
): NavTurn[] {
  const turns: NavTurn[] = []
  for (const message of messages) {
    if (message.role !== 'user') continue
    const source = previewSourceForUserContent(message.content)
    if (!source.trim()) continue
    const status = resolveTurnStatus(message, activities)
    const activityId = pickActivityId(message.id, activities)
    turns.push({
      id: message.id,
      preview: truncateNavPreview(source),
      timestamp: message.timestamp,
      ...(status ? { status } : {}),
      ...(activityId ? { activityId } : {}),
    })
  }
  return turns
}

export function filterTurnsByQuery(turns: readonly NavTurn[], query: string): NavTurn[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...turns]
  return turns.filter((turn) => turn.preview.toLowerCase().includes(needle))
}

export function markerTopPercent(index: number, total: number): number {
  if (total <= 1) return 0
  return (index / (total - 1)) * 100
}

export function isMessagesOverflowing(el: HTMLElement): boolean {
  return el.scrollHeight > el.clientHeight + 1
}

export function shouldShowConversationNav(
  turnCount: number,
  scrollParent: HTMLElement | null,
): boolean {
  if (turnCount < MIN_USER_TURNS_FOR_NAV) return false
  if (!scrollParent) return false
  return isMessagesOverflowing(scrollParent)
}

export type TurnNavDirection = 'prev' | 'next'

export function adjacentTurnId(
  turnIds: readonly string[],
  activeId: string | null,
  direction: TurnNavDirection,
): string | null {
  if (turnIds.length === 0) return null
  const index = activeId ? turnIds.indexOf(activeId) : -1
  if (direction === 'prev') {
    if (index <= 0) return turnIds[0] ?? null
    return turnIds[index - 1] ?? null
  }
  if (index < 0) return turnIds[0] ?? null
  if (index >= turnIds.length - 1) return turnIds[turnIds.length - 1] ?? null
  return turnIds[index + 1] ?? null
}

export function latestTurnId(turnIds: readonly string[]): string | null {
  if (turnIds.length === 0) return null
  return turnIds[turnIds.length - 1] ?? null
}

/**
 * Pick the last user turn whose top edge has scrolled to or above the
 * viewport anchor line (near the top of the scroll container).
 */
export function computeActiveTurnId(
  scrollParent: HTMLElement,
  turnIds: readonly string[],
  anchorOffsetPx = 12,
): string | null {
  if (turnIds.length === 0) return null
  const anchorY = scrollParent.getBoundingClientRect().top + anchorOffsetPx
  let current = turnIds[0] ?? null
  for (const id of turnIds) {
    const el = findTurnElement(scrollParent, id)
    if (!el) continue
    if (el.getBoundingClientRect().top <= anchorY + 1) {
      current = id
    } else {
      break
    }
  }
  return current
}

export function findTurnElement(scrollParent: HTMLElement, messageId: string): HTMLElement | null {
  const el = scrollParent.querySelector(`[data-message-id="${cssEscape(messageId)}"]`)
  if (!el || typeof (el as HTMLElement).getBoundingClientRect !== 'function') return null
  return el as HTMLElement
}

export function scrollTurnIntoView(scrollParent: HTMLElement, messageId: string): boolean {
  const el = findTurnElement(scrollParent, messageId)
  if (!el) return false
  const offsetPx = 8
  const parentTop = scrollParent.getBoundingClientRect().top
  const elTop = el.getBoundingClientRect().top
  const nextTop = scrollParent.scrollTop + (elTop - parentTop) - offsetPx
  const behavior = prefersReducedMotion() ? 'auto' : 'smooth'
  scrollParent.scrollTo({ top: Math.max(0, nextTop), behavior })
  return true
}

/** Briefly highlight the target message bubble after a jump (M1). */
export function flashTurnHighlight(
  scrollParent: HTMLElement,
  messageId: string,
  className: string,
  durationMs = NAV_FLASH_MS,
): void {
  const el = findTurnElement(scrollParent, messageId)
  if (!el || !className) return
  el.classList.add(className)
  window.setTimeout(() => {
    el.classList.remove(className)
  }, prefersReducedMotion() ? Math.min(durationMs, 200) : durationMs)
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
