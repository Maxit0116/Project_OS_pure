import { describe, expect, it } from 'vitest'

import {
  arrowShaftHitsCard,
  cardPinnedToTip,
  composeAttachScreenPoint,
  DEFAULT_COMPOSE_HUB_INSETS,
  layoutComposeForArrow,
  layoutComposeNearTarget,
  overlapArea,
  rectsOverlap,
  shiftCardToFitHub,
} from './composeLayout'

describe('composeLayout', () => {
  const viewport = { width: 1400, height: 900 }

  it('detects overlap area', () => {
    expect(
      overlapArea(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 50, y: 50, width: 100, height: 100 },
      ),
    ).toBe(2500)
    expect(
      rectsOverlap(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: 20, width: 10, height: 10 },
      ),
    ).toBe(false)
  })

  it('keeps the user tip fixed and only picks a card attach anchor', () => {
    const region = { x: 200, y: 200, width: 240, height: 160 }
    const head = { x: 440, y: 280 } // right edge midpoint of region
    const tip = { x: 620, y: 280 } // user pulled right
    const result = layoutComposeForArrow({
      region,
      headScreen: head,
      preferredTailScreen: tip,
      panelWidth: 360,
      panelHeight: 200,
      viewport,
    })
    expect(result.attachScreen).toEqual(tip)
    expect(overlapArea(result.card, region)).toBe(0)
    expect(arrowShaftHitsCard(head, tip, result.card)).toBe(false)
    // Tip must sit on the chosen card anchor.
    const pinned = cardPinnedToTip(tip, result.attach, 360, 200)
    expect(pinned.x).toBeCloseTo(result.card.x, 5)
    expect(pinned.y).toBeCloseTo(result.card.y, 5)
    const dock = composeAttachScreenPoint(result.card, result.attach)
    expect(dock.x).toBeCloseTo(tip.x, 5)
    expect(dock.y).toBeCloseTo(tip.y, 5)
  })

  it('docks tip onto an edge midpoint of the card', () => {
    const tip = { x: 400, y: 300 }
    const card = cardPinnedToTip(tip, 'right', 360, 180)
    const dock = composeAttachScreenPoint(card, 'right')
    expect(dock.x).toBeCloseTo(tip.x, 5)
    expect(dock.y).toBeCloseTo(tip.y, 5)
    expect(card.x + card.width).toBeCloseTo(tip.x, 5)
    expect(card.y + card.height / 2).toBeCloseTo(tip.y, 5)
  })

  it('avoids covering the arrow shaft when tip is left of the region', () => {
    const region = { x: 500, y: 200, width: 240, height: 160 }
    const head = { x: 500, y: 280 }
    const tip = { x: 320, y: 280 }
    const result = layoutComposeForArrow({
      region,
      headScreen: head,
      preferredTailScreen: tip,
      panelWidth: 360,
      panelHeight: 200,
      viewport,
    })
    expect(result.attachScreen).toEqual(tip)
    expect(overlapArea(result.card, region)).toBe(0)
    expect(arrowShaftHitsCard(head, tip, result.card)).toBe(false)
    // Card should sit further left of tip (attach on right edge of card).
    expect(result.attach).toBe('right')
  })

  it('only considers edge midpoints for compose attach', () => {
    const region = { x: 200, y: 200, width: 240, height: 160 }
    const result = layoutComposeForArrow({
      region,
      headScreen: { x: 440, y: 280 },
      preferredTailScreen: { x: 620, y: 280 },
      panelWidth: 360,
      panelHeight: 200,
      viewport,
    })
    expect(['top', 'right', 'bottom', 'left']).toContain(result.attach)
  })

  it('places compose near a mid-screen stencil, not far across the viewport', () => {
    const stencil = { x: 420, y: 360, width: 160, height: 48 }
    const result = layoutComposeNearTarget({
      target: stencil,
      panelWidth: 360,
      panelHeight: 180,
      viewport,
    })
    const cardCx = result.card.x + result.card.width / 2
    const stencilCx = stencil.x + stencil.width / 2
    // Old bug used +35% of full-frame width (~490px); stay well under that.
    expect(Math.abs(cardCx - stencilCx)).toBeLessThan(420)
    expect(overlapArea(result.card, stencil)).toBe(0)
  })

  it('keeps card and default hub insets inside the viewport', () => {
    const stencil = { x: 80, y: 80, width: 160, height: 48 }
    const result = layoutComposeNearTarget({
      target: stencil,
      panelWidth: 360,
      panelHeight: 180,
      viewport,
    })
    const inset = DEFAULT_COMPOSE_HUB_INSETS
    expect(result.card.x - inset.left).toBeGreaterThanOrEqual(0)
    expect(
      result.card.x + result.card.width + inset.right,
    ).toBeLessThanOrEqual(viewport.width)
    expect(result.card.y - inset.top).toBeGreaterThanOrEqual(0)
    expect(
      result.card.y + result.card.height + inset.bottom,
    ).toBeLessThanOrEqual(viewport.height)
  })

  it('shifts a far-right card back so satellites stay on-screen', () => {
    const shifted = shiftCardToFitHub(
      { x: 1100, y: 100, width: 360, height: 180 },
      viewport,
    )
    expect(
      shifted.x + shifted.width + DEFAULT_COMPOSE_HUB_INSETS.right,
    ).toBeLessThanOrEqual(viewport.width)
  })
})
