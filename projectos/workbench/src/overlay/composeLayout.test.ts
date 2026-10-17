import { describe, expect, it } from 'vitest'

import {
  arrowShaftHitsCard,
  cardPinnedToTip,
  composeAttachScreenPoint,
  layoutComposeForArrow,
  overlapArea,
  rectsOverlap,
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

  it('docks corner tips onto the rounded outline, not the box corner', () => {
    const tip = { x: 400, y: 300 }
    const card = cardPinnedToTip(tip, 'bottomRight', 360, 180)
    const dock = composeAttachScreenPoint(card, 'bottomRight')
    expect(dock.x).toBeCloseTo(tip.x, 5)
    expect(dock.y).toBeCloseTo(tip.y, 5)
    // Geometric box corner sits outside the rounded chrome.
    expect(card.x + card.width).toBeGreaterThan(tip.x)
    expect(card.y + card.height).toBeGreaterThan(tip.y)
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
    // Card should sit further left of tip (attach on right side of card).
    expect(['right', 'topRight', 'bottomRight']).toContain(result.attach)
  })
})
