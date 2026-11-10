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

/** Minimum gap between card bounds after fork placement. */
export const SESSION_NODE_CLEARANCE = 24

export interface SessionNodeBounds {
  id?: string
  x: number
  y: number
  width: number
  height: number
}

export function sessionNodeBoundsOverlap(
  a: SessionNodeBounds,
  b: SessionNodeBounds,
  gap = SESSION_NODE_CLEARANCE,
): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  )
}

function findOverlappingObstacle(
  candidate: SessionNodeBounds,
  obstacles: readonly SessionNodeBounds[],
  gap = SESSION_NODE_CLEARANCE,
): SessionNodeBounds | null {
  for (const obstacle of obstacles) {
    if (candidate.id && obstacle.id && candidate.id === obstacle.id) continue
    if (sessionNodeBoundsOverlap(candidate, obstacle, gap)) return obstacle
  }
  return null
}

function buildClearanceCandidates(
  proposed: { x: number; y: number },
  childSize: { width: number; height: number },
  preferRight: boolean,
  gap: number,
  axisLimit = 6,
): Array<{ x: number; y: number }> {
  const originX = Math.max(0, proposed.x)
  const originY = Math.max(0, proposed.y)
  const stepX = childSize.width + gap
  const stepY = childSize.height + gap
  const candidates: Array<{ x: number; y: number }> = [{ x: originX, y: originY }]

  const pushUnique = (x: number, y: number) => {
    const nextX = Math.max(0, x)
    const nextY = Math.max(0, y)
    if (candidates.some((item) => item.x === nextX && item.y === nextY)) return
    candidates.push({ x: nextX, y: nextY })
  }

  // Aside: stay in the fork column and slide vertically first, then walk right.
  // Below: stay under the parent and slide down first, then walk sideways.
  if (preferRight) {
    for (let row = 1; row <= axisLimit; row++) {
      pushUnique(originX, originY + row * stepY)
      pushUnique(originX, originY - row * stepY)
    }
    for (let col = 1; col <= axisLimit; col++) {
      for (let row = 0; row <= axisLimit; row++) {
        pushUnique(originX + col * stepX, originY + row * stepY)
        if (row > 0) pushUnique(originX + col * stepX, originY - row * stepY)
      }
    }
  } else {
    for (let row = 1; row <= axisLimit; row++) {
      pushUnique(originX, originY + row * stepY)
    }
    for (let row = 0; row <= axisLimit; row++) {
      for (let col = 1; col <= axisLimit; col++) {
        pushUnique(originX + col * stepX, originY + row * stepY)
        pushUnique(originX - col * stepX, originY + row * stepY)
      }
    }
  }

  return candidates
}

/**
 * Nudge a proposed fork-child position until it clears existing cards.
 * Prefers the placement axis (aside → right/vertical, below → down/horizontal)
 * so fork geometry stays readable; only the new child moves.
 */
export function resolveForkChildClearPosition(
  proposed: { x: number; y: number },
  childSize: { width: number; height: number },
  obstacles: readonly SessionNodeBounds[],
  placement: SessionForkPlacement,
  gap = SESSION_NODE_CLEARANCE,
): { x: number; y: number } {
  const preferRight = placement.forkLayout === 'aside'
  const candidates = buildClearanceCandidates(
    proposed,
    childSize,
    preferRight,
    gap,
  )

  for (const candidate of candidates) {
    const hit = findOverlappingObstacle(
      {
        x: candidate.x,
        y: candidate.y,
        width: childSize.width,
        height: childSize.height,
      },
      obstacles,
      gap,
    )
    if (!hit) return candidate
  }

  // Exhausted the local search grid — park past the farthest obstacle on the
  // preferred axis so the new card is still reachable.
  let fallbackX = Math.max(0, proposed.x)
  let fallbackY = Math.max(0, proposed.y)
  for (const obstacle of obstacles) {
    if (preferRight) {
      fallbackX = Math.max(fallbackX, obstacle.x + obstacle.width + gap)
    } else {
      fallbackY = Math.max(fallbackY, obstacle.y + obstacle.height + gap)
    }
  }
  return { x: fallbackX, y: fallbackY }
}

/**
 * Ideal fork slot, then collision-resolve against live card bounds.
 */
export function placeForkChildPositionClearOfObstacles(
  parent: { x: number; y: number; height: number },
  placement: SessionForkPlacement,
  obstacles: readonly SessionNodeBounds[],
  childStripCount = 1,
): { x: number; y: number } {
  const childHeight = estimateSessionNodeHeight(childStripCount)
  const proposed = placeForkChildPosition(parent, placement, childStripCount)
  return resolveForkChildClearPosition(
    proposed,
    { width: SESSION_NODE_WIDTH, height: childHeight },
    obstacles,
    placement,
  )
}

export interface SessionForkEdgePath {
  path: string
  labelX: number
  labelY: number
  /** True when the stroke uses the horizontal aside routing. */
  aside: boolean
}

/**
 * Build the fork edge against the cards' *rendered* bounds.
 *
 * Declared `forkLayout` is a hint only: after clearance / manual drag a child
 * may sit below while still tagged `aside` (or the reverse). Routing follows
 * where the cards actually are so the stroke stays glued to card edges.
 */
export function buildSessionForkEdgePath(
  source: { x: number; y: number },
  target: { x: number; y: number },
  sourceHeight: number,
  targetHeight: number,
  placement?: Pick<SessionForkPlacement, 'forkLayout' | 'forkAnchorOffsetY'> | null,
): SessionForkEdgePath {
  const srcH = Math.max(SESSION_NODE_HEIGHT, sourceHeight)
  const tgtH = Math.max(SESSION_NODE_HEIGHT, targetHeight)
  const parentRight = source.x + SESSION_NODE_WIDTH
  const parentBottom = source.y + srcH
  const parentCx = source.x + SESSION_NODE_WIDTH / 2
  const childCx = target.x + SESSION_NODE_WIDTH / 2
  const dx = childCx - parentCx
  // Route from where the cards actually sit. A child tagged `aside` that was
  // later slid under the parent must use vertical ports — otherwise the bezier
  // bows into empty space and the endpoint looks detached from the card.
  const useAside =
    target.x >= source.x + SESSION_NODE_WIDTH * 0.55 && dx > SESSION_NODE_WIDTH * 0.25

  if (useAside) {
    const rawAnchor =
      typeof placement?.forkAnchorOffsetY === 'number'
        ? placement.forkAnchorOffsetY
        : srcH / 2
    const anchorY = Math.min(Math.max(8, rawAnchor), Math.max(8, srcH - 8))
    const x1 = parentRight
    const y1 = source.y + anchorY
    const x2 = target.x
    const y2 = target.y + tgtH / 2
    const bend = Math.max(28, SESSION_FORK_ASIDE_GAP * 0.55)
    return {
      path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
      labelX: (x1 + x2) / 2,
      labelY: (y1 + y2) / 2,
      aside: true,
    }
  }

  const x1 = parentCx
  const y1 = parentBottom
  const x2 = childCx
  const y2 = target.y
  const mid = (y1 + y2) / 2
  return {
    path: `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`,
    labelX: (x1 + x2) / 2,
    labelY: mid,
    aside: false,
  }
}

export interface ResolveSessionGraphOverlapsResult {
  /** All node positions after separation (includes unchanged). */
  positions: Record<string, { x: number; y: number }>
  changed: boolean
}

/**
 * Push overlapping cards apart after a card grows (new strip rows).
 * Upper/left cards stay put; lower/right cards move down (then right if needed)
 * so growth never covers neighbors.
 */
export function resolveSessionGraphOverlaps(
  nodes: readonly SessionNodeBounds[],
  gap = SESSION_NODE_CLEARANCE,
  maxPasses = 24,
): ResolveSessionGraphOverlapsResult {
  const items = nodes
    .filter((node) => Boolean(node.id))
    .map((node) => ({
      id: node.id as string,
      x: Math.max(0, node.x),
      y: Math.max(0, node.y),
      width: node.width,
      height: node.height,
    }))

  if (items.length < 2) {
    const positions: Record<string, { x: number; y: number }> = {}
    for (const item of items) positions[item.id] = { x: item.x, y: item.y }
    return { positions, changed: false }
  }

  let changed = false

  for (let pass = 0; pass < maxPasses; pass++) {
    let passChanged = false
    items.sort(
      (a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id),
    )
    for (let i = 0; i < items.length; i++) {
      const upper = items[i]!
      for (let j = i + 1; j < items.length; j++) {
        const lower = items[j]!
        if (!sessionNodeBoundsOverlap(upper, lower, gap)) continue
        const pushDown = upper.y + upper.height + gap
        if (lower.y < pushDown) {
          lower.y = pushDown
          passChanged = true
        }
      }
    }
    if (passChanged) {
      changed = true
      continue
    }
    break
  }

  // Side-by-side leftovers (same band): nudge the right-hand card outward.
  for (let pass = 0; pass < maxPasses; pass++) {
    let passChanged = false
    items.sort(
      (a, b) => a.x - b.x || a.y - b.y || a.id.localeCompare(b.id),
    )
    for (let i = 0; i < items.length; i++) {
      const left = items[i]!
      for (let j = i + 1; j < items.length; j++) {
        const right = items[j]!
        if (!sessionNodeBoundsOverlap(left, right, gap)) continue
        const pushRight = left.x + left.width + gap
        if (right.x < pushRight) {
          right.x = pushRight
          passChanged = true
        }
      }
    }
    if (passChanged) {
      changed = true
      continue
    }
    break
  }

  const positions: Record<string, { x: number; y: number }> = {}
  for (const item of items) {
    positions[item.id] = { x: item.x, y: item.y }
  }
  return { positions, changed }
}

/** Keep unused layout constants discoverable for card geometry math. */
export const SESSION_FORK_CARD_FOOTPRINT = {
  width: SESSION_NODE_WIDTH,
  minHeight: SESSION_NODE_HEIGHT,
  head: SESSION_NODE_HEAD_HEIGHT,
  foot: SESSION_NODE_FOOT_HEIGHT,
} as const
