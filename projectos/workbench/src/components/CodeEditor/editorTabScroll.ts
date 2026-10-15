/** Map a wheel gesture to horizontal tab-strip movement.

Cursor and VS Code treat a vertical wheel over the tab bar as a horizontal scroll,
and a horizontal trackpad swipe as a direct left/right scroll. The larger axis wins
so the two gestures do not fight.
*/
export function editorTabScrollDelta(deltaX: number, deltaY: number): number {
  if (deltaX === 0 && deltaY === 0) return 0
  return Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY
}

interface RevealList {
  scrollLeft: number
  clientWidth: number
}

interface RevealTab {
  offsetLeft: number
  offsetWidth: number
}

/** Scroll position that keeps a content-sized tab fully visible inside the strip. */
export function revealEditorTab(
  list: RevealList,
  tab: RevealTab,
  align: 'end' | 'nearest',
): number {
  const tabLeft = tab.offsetLeft
  const tabRight = tab.offsetLeft + tab.offsetWidth
  const viewLeft = list.scrollLeft
  const viewRight = list.scrollLeft + list.clientWidth

  if (align === 'end') {
    return Math.max(0, tabRight - list.clientWidth)
  }

  if (tabLeft < viewLeft) return Math.max(0, tabLeft)
  if (tabRight > viewRight) return Math.max(0, tabRight - list.clientWidth)
  return list.scrollLeft
}
