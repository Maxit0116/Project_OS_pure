import type { ScreenRect } from '@contracts/spatial-pin'

export type SatelliteSide = 'left' | 'right' | 'bottom'

export interface SatelliteLayoutSlot {
  id: string
  side: SatelliteSide
  /** 0-based index within the side stack. */
  index: number
  /** Total slots on this side (for vertical centering). */
  count: number
}

export interface SatelliteRect {
  id: string
  side: SatelliteSide
  x: number
  y: number
  width: number
  height: number
  /** Hub edge attach point (screen) — fans near card mid so curves stay organic. */
  hubPoint: { x: number; y: number }
  /** Satellite edge attach point (screen) — sits on the card border. */
  satPoint: { x: number; y: number }
}

export const SATELLITE_WIDTH = 200
export const SATELLITE_HEIGHT = 86
export const SUBAGENT_HEIGHT = 92
export const RESEARCH_HEIGHT = 110
export const RESEARCH_WIDTH = 240
/** Chrome: card padding + header + gaps (excl. list body). */
export const REFERENCES_CHROME_HEIGHT = 52
/** Padded list row (label + vertical padding). */
export const REFERENCES_ROW_HEIGHT = 30
export const REFERENCES_EMPTY_BODY = 20
/** Expand until this many rows are fully visible; beyond that, scroll. */
export const REFERENCES_VISIBLE_ROWS_CAP = 5
export const REFERENCES_MIN_HEIGHT =
  REFERENCES_CHROME_HEIGHT + REFERENCES_EMPTY_BODY
export const REFERENCES_MAX_HEIGHT =
  REFERENCES_CHROME_HEIGHT +
  REFERENCES_VISIBLE_ROWS_CAP * REFERENCES_ROW_HEIGHT
/**
 * Scope chrome = header + Folders|Map mode row + gap (excl. list body).
 * Row height matches References so both cards grow the same way.
 */
export const SCOPE_MODE_ROW_HEIGHT = 26
export const SCOPE_CHROME_HEIGHT =
  REFERENCES_CHROME_HEIGHT + SCOPE_MODE_ROW_HEIGHT
export const SCOPE_ROW_HEIGHT = REFERENCES_ROW_HEIGHT
export const SCOPE_EMPTY_BODY = REFERENCES_EMPTY_BODY
export const SCOPE_VISIBLE_ROWS_CAP = REFERENCES_VISIBLE_ROWS_CAP
export const SCOPE_MIN_HEIGHT = SCOPE_CHROME_HEIGHT + SCOPE_EMPTY_BODY
export const SCOPE_MAX_HEIGHT =
  SCOPE_CHROME_HEIGHT + SCOPE_VISIBLE_ROWS_CAP * SCOPE_ROW_HEIGHT
/** @deprecated Prefer computeScopeHeight; kept as empty-state default. */
export const SCOPE_SATELLITE_HEIGHT = SCOPE_MIN_HEIGHT
export const HUB_GAP = 44
export const SIDE_STACK_GAP = 12
/** How strongly hub ports stay near card mid vs satellite mid (0 = all mid, 1 = all sat). */
export const HUB_FAN_BLEND = 0.22

/** Grow with items until five rows fit; then hold max and scroll. */
export function computeReferencesHeight(referenceCount: number): number {
  const visibleRows =
    referenceCount <= 0
      ? 0
      : Math.min(referenceCount, REFERENCES_VISIBLE_ROWS_CAP)
  const body =
    visibleRows === 0
      ? REFERENCES_EMPTY_BODY
      : visibleRows * REFERENCES_ROW_HEIGHT
  return Math.min(
    REFERENCES_MAX_HEIGHT,
    Math.max(REFERENCES_MIN_HEIGHT, REFERENCES_CHROME_HEIGHT + body),
  )
}

/** Same grow-then-scroll behavior as References, plus Folders|Map chrome. */
export function computeScopeHeight(scopeCount: number): number {
  const visibleRows =
    scopeCount <= 0 ? 0 : Math.min(scopeCount, SCOPE_VISIBLE_ROWS_CAP)
  const body =
    visibleRows === 0 ? SCOPE_EMPTY_BODY : visibleRows * SCOPE_ROW_HEIGHT
  return Math.min(
    SCOPE_MAX_HEIGHT,
    Math.max(SCOPE_MIN_HEIGHT, SCOPE_CHROME_HEIGHT + body),
  )
}

/**
 * Place satellites around a compose card in a star topology.
 * Left/right stacks are vertically centered on the card; bottom sits under center.
 * Hub ports fan near the card midline so connectors form real S-curves (not flat lines).
 */
export function layoutSatellites(
  card: ScreenRect,
  slots: readonly SatelliteLayoutSlot[],
  options?: {
    satelliteWidth?: number
    satelliteHeight?: number
    referencesHeight?: number
    scopeHeight?: number
    subagentHeight?: number
    researchHeight?: number
    researchWidth?: number
    gap?: number
    stackGap?: number
    hubFanBlend?: number
  },
): SatelliteRect[] {
  const width = options?.satelliteWidth ?? SATELLITE_WIDTH
  const leftHeight = options?.satelliteHeight ?? SATELLITE_HEIGHT
  const referencesHeight =
    options?.referencesHeight ?? REFERENCES_MIN_HEIGHT
  const scopeHeight = options?.scopeHeight ?? SCOPE_MIN_HEIGHT
  const rightHeight = options?.subagentHeight ?? SUBAGENT_HEIGHT
  const researchHeight = options?.researchHeight ?? RESEARCH_HEIGHT
  const researchWidth = options?.researchWidth ?? RESEARCH_WIDTH
  const gap = options?.gap ?? HUB_GAP
  const stackGap = options?.stackGap ?? SIDE_STACK_GAP
  const fanBlend = options?.hubFanBlend ?? HUB_FAN_BLEND
  const cardMidY = card.y + card.height / 2

  const bySide = {
    left: slots.filter((s) => s.side === 'left'),
    right: slots.filter((s) => s.side === 'right'),
    bottom: slots.filter((s) => s.side === 'bottom'),
  }

  const results: SatelliteRect[] = []

  for (const side of ['left', 'right'] as const) {
    const group = bySide[side]
    const height = side === 'left' ? leftHeight : rightHeight
    const resolveSlotHeight = (slot: SatelliteLayoutSlot): number => {
      if (side === 'right' && slot.id === 'add-subagent') return 40
      if (side === 'left' && slot.id === 'scope') return scopeHeight
      return height
    }
    const totalH =
      group.reduce((sum, slot) => sum + resolveSlotHeight(slot), 0) +
      Math.max(0, group.length - 1) * stackGap
    let cursorY = card.y + card.height / 2 - totalH / 2
    group.forEach((slot) => {
      const slotHeight = resolveSlotHeight(slot)
      const y = cursorY
      cursorY += slotHeight + stackGap
      const x =
        side === 'left' ? card.x - gap - width : card.x + card.width + gap
      const satMidY = y + slotHeight / 2
      // Pull hub port toward card mid so stacked sats get visible vertical delta → curves.
      const hubY = cardMidY + (satMidY - cardMidY) * fanBlend
      const hubPoint = {
        x: side === 'left' ? card.x : card.x + card.width,
        y: hubY,
      }
      const satPoint = {
        x: side === 'left' ? x + width : x,
        y: satMidY,
      }
      results.push({
        id: slot.id,
        side,
        x,
        y,
        width,
        height: slotHeight,
        hubPoint,
        satPoint,
      })
    })
  }

  let bottomY = card.y + card.height + gap
  bySide.bottom.forEach((slot) => {
    const isReferences = slot.id === 'references'
    const h = isReferences ? referencesHeight : researchHeight
    const w = isReferences
      ? Math.max(card.width, researchWidth)
      : researchWidth
    const x = card.x + (card.width - w) / 2
    const y = bottomY
    bottomY += h + stackGap
    results.push({
      id: slot.id,
      side: 'bottom',
      x,
      y,
      width: w,
      height: h,
      hubPoint: { x: card.x + card.width / 2, y: card.y + card.height },
      satPoint: { x: x + w / 2, y },
    })
  })

  return results
}

/** Recompute attach points after a satellite is manually repositioned. */
export function attachPointsForSatellite(
  card: ScreenRect,
  sat: { x: number; y: number; width: number; height: number },
  side: SatelliteSide,
  hubFanBlend = HUB_FAN_BLEND,
): { hubPoint: { x: number; y: number }; satPoint: { x: number; y: number } } {
  const cardMidY = card.y + card.height / 2
  const satMidY = sat.y + sat.height / 2
  const hubY = cardMidY + (satMidY - cardMidY) * hubFanBlend
  if (side === 'bottom') {
    return {
      hubPoint: { x: card.x + card.width / 2, y: card.y + card.height },
      satPoint: { x: sat.x + sat.width / 2, y: sat.y },
    }
  }
  if (side === 'left') {
    return {
      hubPoint: { x: card.x, y: hubY },
      satPoint: { x: sat.x + sat.width, y: satMidY },
    }
  }
  return {
    hubPoint: { x: card.x + card.width, y: hubY },
    satPoint: { x: sat.x, y: satMidY },
  }
}

/** Infer side from where the satellite sits relative to the card. */
export function inferSatelliteSide(
  card: ScreenRect,
  sat: { x: number; y: number; width: number; height: number },
): SatelliteSide {
  const satCx = sat.x + sat.width / 2
  const satCy = sat.y + sat.height / 2
  const cardCx = card.x + card.width / 2
  const cardCy = card.y + card.height / 2
  const dx = satCx - cardCx
  const dy = satCy - cardCy
  if (Math.abs(dy) > Math.abs(dx) && dy > 0) return 'bottom'
  return dx < 0 ? 'left' : 'right'
}

/**
 * Organic cubic between hub and satellite.
 * Horizontal pull scales with gap so left/right always look curved even when
 * Y delta is small; bottom uses a soft U-curve.
 */
export function satelliteConnectorPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  side: SatelliteSide,
): string {
  if (side === 'bottom') {
    const dy = Math.abs(to.y - from.y)
    const pull = Math.max(28, dy * 0.55)
    return `M ${from.x} ${from.y} C ${from.x} ${from.y + pull}, ${to.x} ${to.y - pull}, ${to.x} ${to.y}`
  }

  const dx = to.x - from.x
  const pull = Math.max(36, Math.abs(dx) * 0.58)
  if (side === 'left') {
    // Hub on the right of the satellite: curve bows outward left then into sat.
    return `M ${from.x} ${from.y} C ${from.x - pull} ${from.y}, ${to.x + pull} ${to.y}, ${to.x} ${to.y}`
  }
  // Right: hub left of satellite
  return `M ${from.x} ${from.y} C ${from.x + pull} ${from.y}, ${to.x - pull} ${to.y}, ${to.x} ${to.y}`
}
