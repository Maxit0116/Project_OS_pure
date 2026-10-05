import { describe, expect, it } from 'vitest'
import { BROWSER_TAB_LAYOUT, computeBrowserTabLayout } from './browserTabLayout'

const { maxWidth, minWidth, gap, tabMargin, newTabButton, listPadding } = BROWSER_TAB_LAYOUT

function totalTabStripWidth(tabCount: number, tabWidth: number) {
  return tabCount * (tabWidth + tabMargin) + Math.max(0, tabCount - 1) * gap
}

describe('computeBrowserTabLayout', () => {
  it('uses max width when few tabs fit comfortably', () => {
    const result = computeBrowserTabLayout(2, 800)
    expect(result.tabWidth).toBe(maxWidth)
    expect(result.isCompressed).toBe(false)
    expect(result.isScrollable).toBe(false)
  })

  it('compresses tabs equally when space is tight', () => {
    const listWidth = 420
    const available = listWidth - listPadding - newTabButton
    const result = computeBrowserTabLayout(4, listWidth)

    expect(result.tabWidth).toBeLessThan(maxWidth)
    expect(result.tabWidth).toBeGreaterThan(minWidth)
    expect(result.isCompressed).toBe(true)
    expect(totalTabStripWidth(4, result.tabWidth)).toBeLessThanOrEqual(available + 0.5)
  })

  it('clamps to min width and enables scrolling when overcrowded', () => {
    const listWidth = 360
    const result = computeBrowserTabLayout(8, listWidth)

    expect(result.tabWidth).toBe(minWidth)
    expect(result.isScrollable).toBe(true)
  })

  it('returns max width before the list is measured', () => {
    const result = computeBrowserTabLayout(3, 0)
    expect(result.tabWidth).toBe(maxWidth)
    expect(result.isScrollable).toBe(false)
  })
})
