interface TreeScrollElement {
  scrollTop: number
  getBoundingClientRect(): { top: number; bottom: number }
  scrollTo(options: { top: number; behavior: ScrollBehavior }): void
}

interface TreeRowElement {
  closest(selector: string): TreeScrollElement | null
  getBoundingClientRect(): { top: number; bottom: number }
}

export function scrollTreeRowIntoView(row: TreeRowElement): void {
  const container = row.closest('[role="tree"]')
  if (!container) return
  const containerRect = container.getBoundingClientRect()
  const rowRect = row.getBoundingClientRect()
  let nextTop = container.scrollTop
  if (rowRect.top < containerRect.top) {
    nextTop += rowRect.top - containerRect.top
  } else if (rowRect.bottom > containerRect.bottom) {
    nextTop += rowRect.bottom - containerRect.bottom
  } else {
    return
  }
  container.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
}
