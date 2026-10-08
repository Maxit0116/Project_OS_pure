import { describe, expect, it } from 'vitest'
import {
  availableLabelWidth,
  estimateTextWidth,
  fitEdgeLabel,
  wrapEdgeLabel,
} from './edgeLabelFit'

describe('wrapEdgeLabel', () => {
  it('keeps short labels on one line', () => {
    expect(wrapEdgeLabel('Uses [HTTPS]', 180)).toEqual(['Uses [HTTPS]'])
  })

  it('wraps long labels into multiple lines within max width', () => {
    const text =
      'Gets account information from authentication service [JSON/HTTPS]'
    const lines = wrapEdgeLabel(text, 90, 3)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.length).toBeLessThanOrEqual(3)
    for (const line of lines) {
      expect(estimateTextWidth(line)).toBeLessThanOrEqual(95)
    }
  })
})

describe('fitEdgeLabel', () => {
  it('wraps when the horizontal gap is narrower than the single-line label', () => {
    const source = { id: 'a', x: 0, y: 0, width: 180, height: 96 }
    const target = { id: 'b', x: 240, y: 0, width: 180, height: 96 } // 60px gap
    const fit = fitEdgeLabel(
      'Reads from and writes to the primary database [SQL]',
      source,
      target,
    )
    expect(fit.availableWidth).toBeLessThan(
      estimateTextWidth('Reads from and writes to the primary database [SQL]'),
    )
    expect(fit.lines.length).toBeGreaterThan(1)
    expect(fit.needsVerticalSeparation).toBe(true)
    expect(fit.requestedVerticalGap).toBeGreaterThan(0)
  })

  it('does not request vertical separation when the gap is wide enough', () => {
    const source = { id: 'a', x: 0, y: 0, width: 180, height: 96 }
    const target = { id: 'b', x: 520, y: 0, width: 180, height: 96 }
    const fit = fitEdgeLabel('Uses [HTTPS]', source, target)
    expect(fit.lines).toEqual(['Uses [HTTPS]'])
    expect(fit.needsVerticalSeparation).toBe(false)
  })
})

describe('availableLabelWidth', () => {
  it('uses the clear horizontal gap between boxes', () => {
    const width = availableLabelWidth(
      { id: 'a', x: 0, y: 0, width: 100, height: 80 },
      { id: 'b', x: 220, y: 0, width: 100, height: 80 },
    )
    expect(width).toBeGreaterThan(50)
    expect(width).toBeLessThanOrEqual(220)
  })
})
