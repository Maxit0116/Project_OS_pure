const SCROLL_EPSILON = 1

function isScrollableOverflowY(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el)
  const overflowY = style.overflowY
  if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') {
    return false
  }
  return el.scrollHeight > el.clientHeight + SCROLL_EPSILON
}

function isTextarea(el: Element): el is HTMLTextAreaElement {
  return el instanceof HTMLTextAreaElement
}

/**
 * Walk from the event target up to `root` and return the first element that
 * can scroll vertically (overflow container or textarea with overflow).
 */
export function findVerticalScrollTarget(target: Element, root: HTMLElement): HTMLElement | null {
  let current: Element | null = target

  while (current && current instanceof HTMLElement) {
    if (isTextarea(current)) {
      if (current.scrollHeight > current.clientHeight + SCROLL_EPSILON) {
        return current
      }
    } else if (isScrollableOverflowY(current)) {
      return current
    }

    if (current === root) break
    current = current.parentElement
  }

  if (isScrollableOverflowY(root)) {
    return root
  }

  return null
}

export function canConsumeVerticalWheel(el: HTMLElement, deltaY: number): boolean {
  if (deltaY === 0) return false
  if (el.scrollHeight <= el.clientHeight + SCROLL_EPSILON) return false

  if (deltaY < 0) {
    // scrolling up — can consume if not already at top
    return el.scrollTop > SCROLL_EPSILON
  }
  // scrolling down — can consume if not already at bottom
  return el.scrollTop + el.clientHeight < el.scrollHeight - SCROLL_EPSILON
}

/**
 * Native bubble-phase wheel handler for artifact card bodies.
 * React Flow's d3-zoom listens on the pane with native DOM listeners, so React
 * synthetic onWheelCapture/stopPropagation does not block canvas zoom. When
 * content can scroll in the wheel direction, stop native propagation so the
 * pane never receives the event; otherwise let it bubble for canvas zoom.
 *
 * Pair with React Flow's `nowheel` class on the same element as a belt-and-
 * suspenders guard inside the card content region.
 */
export function handleArtifactWheelNative(event: WheelEvent): void {
  if (event.deltaY === 0) return

  const root = event.currentTarget
  if (!(root instanceof HTMLElement)) return

  const target = event.target
  if (!(target instanceof Element)) return

  const scrollEl = findVerticalScrollTarget(target, root)
  if (!scrollEl) return

  if (!canConsumeVerticalWheel(scrollEl, event.deltaY)) return

  event.stopPropagation()
}
