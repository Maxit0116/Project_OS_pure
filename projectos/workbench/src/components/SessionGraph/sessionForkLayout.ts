import {
  SESSION_GRAPH_STRIP_MAX_ITEMS,
  type SessionGraphStripItem,
} from '@contracts/index'
import {
  SESSION_NODE_FOOT_HEIGHT,
  SESSION_NODE_HEAD_HEIGHT,
  SESSION_NODE_HEIGHT,
  SESSION_NODE_STRIP_PAD,
  SESSION_NODE_STRIP_ROW,
  SESSION_NODE_WIDTH,
  estimateSessionNodeHeight,
} from './layoutSessionGraph'

/** Gap under the parent card for full-context / latest-turn forks. */
export const SESSION_FORK_BELOW_GAP = 64
/** Horizontal gap for mid-turn forks to the parent's right. */
export const SESSION_FORK_ASIDE_GAP = 72

export type SessionForkLayoutKind = 'below' | 'aside'

export interface SessionForkPlacement {
  forkLayout: SessionForkLayoutKind
  /** Present when `forkLayout === 'aside'`. */
  forkAnchorOffsetY?: number
}

/**
 * Title button / missing id / last strip row → below.
 * Any earlier strip row → aside, anchored to that row's vertical center.
 *
 * Note: do not treat "last.messageId === forkId" as latest — curated digest
 * rows often share one throughMessageId. Only the last *row index* is below.
 */
export function resolveSessionForkPlacement(
  displayStrip: readonly SessionGraphStripItem[],
  forkMessageId: string | null | undefined,
): SessionForkPlacement {
  const trimmed = forkMessageId?.trim() || null
  if (!trimmed || displayStrip.length === 0) {
    return { forkLayout: 'below' }
  }
  const index = displayStrip.findIndex((item) => item.messageId === trimmed)
  if (index < 0) return { forkLayout: 'below' }
  if (index >= displayStrip.length - 1) {
    return { forkLayout: 'below' }
  }
  return {
    forkLayout: 'aside',
    forkAnchorOffsetY: sessionStripRowCenterY(index),
  }
}

/**
 * Preview "Branch from here" placement.
 * Geometry follows the hovered strip *row* (aside unless it's the last row).
 * Falls back to transcript order when the row can't be found.
 */
export function resolveSessionForkPlacementForPreview(
  displayStrip: readonly SessionGraphStripItem[],
  messages: readonly { id: string; role: string }[],
  forkMessageId: string | null | undefined,
  stripItemId?: string | null,
): SessionForkPlacement {
  const trimmedItemId = stripItemId?.trim() || null
  if (trimmedItemId && displayStrip.length > 0) {
    const rowIndex = displayStrip.findIndex((item) => item.id === trimmedItemId)
    if (rowIndex >= 0) {
      if (rowIndex >= displayStrip.length - 1) {
        return { forkLayout: 'below' }
      }
      return {
        forkLayout: 'aside',
        forkAnchorOffsetY: sessionStripRowCenterY(rowIndex),
      }
    }
  }
  const fromStrip = resolveSessionForkPlacement(displayStrip, forkMessageId)
  if (fromStrip.forkLayout === 'aside') return fromStrip
  return resolveSessionForkPlacementFromMessages(messages, forkMessageId)
}

/**
 * Chat-panel / history forks: last user turn → below; earlier user turns → aside.
 * Anchor Y maps into the visible strip window (newest N turns).
 */
export function resolveSessionForkPlacementFromMessages(
  messages: readonly { id: string; role: string }[],
  forkMessageId: string | null | undefined,
): SessionForkPlacement {
  const trimmed = forkMessageId?.trim() || null
  if (!trimmed) return { forkLayout: 'below' }
  const userTurns = messages.filter((message) => message.role === 'user')
  const index = userTurns.findIndex((message) => message.id === trimmed)
  if (index < 0) return { forkLayout: 'below' }
  if (index >= userTurns.length - 1) return { forkLayout: 'below' }
  const visibleStart = Math.max(0, userTurns.length - SESSION_GRAPH_STRIP_MAX_ITEMS)
  const stripIndex = Math.max(0, index - visibleStart)
  return {
    forkLayout: 'aside',
    forkAnchorOffsetY: sessionStripRowCenterY(stripIndex),
  }
}

/** Vertical center of strip row `index` relative to the card top. */
export function sessionStripRowCenterY(index: number): number {
  return (
    SESSION_NODE_HEAD_HEIGHT +
    SESSION_NODE_STRIP_PAD / 2 +
    index * SESSION_NODE_STRIP_ROW +
    SESSION_NODE_STRIP_ROW / 2
  )
}

export function placeForkChildPosition(
  parent: { x: number; y: number; height: number },
  placement: SessionForkPlacement,
  childStripCount = 1,
): { x: number; y: number } {
  const childHeight = estimateSessionNodeHeight(childStripCount)
  if (placement.forkLayout === 'aside') {
    const anchorY =
      placement.forkAnchorOffsetY ??
      SESSION_NODE_HEAD_HEIGHT + SESSION_NODE_STRIP_PAD + SESSION_NODE_STRIP_ROW / 2
    return {
      x: parent.x + SESSION_NODE_WIDTH + SESSION_FORK_ASIDE_GAP,
      y: Math.max(0, parent.y + anchorY - childHeight / 2),
    }
  }
  return {
    x: parent.x,
    y: parent.y + parent.height + SESSION_FORK_BELOW_GAP,
  }
}

/** Keep unused layout constants discoverable for card geometry math. */
export const SESSION_FORK_CARD_FOOTPRINT = {
  width: SESSION_NODE_WIDTH,
  minHeight: SESSION_NODE_HEIGHT,
  head: SESSION_NODE_HEAD_HEIGHT,
  foot: SESSION_NODE_FOOT_HEIGHT,
} as const
