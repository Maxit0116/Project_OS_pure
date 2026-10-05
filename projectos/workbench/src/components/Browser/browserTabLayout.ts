/** Chrome-like tab strip width distribution. */
export const BROWSER_TAB_LAYOUT = {
  maxWidth: 200,
  minWidth: 68,
  /** Flex `gap` between tab strip items. */
  gap: 4,
  /** Horizontal margin on each tab (`margin-inline: tab-gap / 2` × 2). */
  tabMargin: 4,
  /** New-tab control width including its leading margin. */
  newTabButton: 28,
  /** Horizontal padding on the tab list (`padding-inline: tab-radius` × 2). */
  listPadding: 24,
} as const

export interface BrowserTabLayoutResult {
  tabWidth: number
  isCompressed: boolean
  isScrollable: boolean
}

export function computeTabStripLayout(
  tabCount: number,
  listClientWidth: number,
  trailingReserve = 0,
): BrowserTabLayoutResult {
  const { maxWidth, minWidth, gap, tabMargin, listPadding } = BROWSER_TAB_LAYOUT

  if (tabCount <= 0) {
    return { tabWidth: maxWidth, isCompressed: false, isScrollable: false }
  }

  if (listClientWidth <= 0) {
    return { tabWidth: maxWidth, isCompressed: false, isScrollable: false }
  }

  const available = listClientWidth - listPadding - trailingReserve
  const rawWidth =
    (available - (tabCount - 1) * gap - tabCount * tabMargin) / tabCount
  const tabWidth = Math.max(minWidth, Math.min(maxWidth, rawWidth))
  const totalWidth = tabCount * (tabWidth + tabMargin) + (tabCount - 1) * gap

  return {
    tabWidth,
    isCompressed: tabWidth < maxWidth - 0.5,
    isScrollable: totalWidth > available + 0.5,
  }
}

export function computeBrowserTabLayout(
  tabCount: number,
  listClientWidth: number,
): BrowserTabLayoutResult {
  return computeTabStripLayout(tabCount, listClientWidth, BROWSER_TAB_LAYOUT.newTabButton)
}
