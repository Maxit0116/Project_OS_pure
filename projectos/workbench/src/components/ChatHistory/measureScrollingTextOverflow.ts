export const SCROLL_OVERFLOW_TOLERANCE_PX = 3

export function measureNaturalTextWidth(text: HTMLElement): number {
  const range = document.createRange()
  range.selectNodeContents(text)
  return range.getBoundingClientRect().width
}

export function measureScrollingTextOverflow(
  container: HTMLElement,
  text: HTMLElement,
): number {
  const availableWidth = Math.floor(container.clientWidth)
  if (availableWidth <= 0) return 0

  const naturalWidth = Math.ceil(measureNaturalTextWidth(text))
  const overflow = naturalWidth - availableWidth
  return overflow > SCROLL_OVERFLOW_TOLERANCE_PX ? overflow : 0
}
