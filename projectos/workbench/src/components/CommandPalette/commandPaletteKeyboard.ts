interface PaletteKeyEvent {
  key: string
  preventDefault(): void
  stopPropagation(): void
}

export function handleCommandPaletteNavigation(
  event: PaletteKeyEvent,
  highlightedIndex: number,
  itemCount: number,
  onHighlight: (index: number) => void,
  onActivate: (index: number) => void,
): boolean {
  if (itemCount <= 0) return false

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    event.stopPropagation()
    const direction = event.key === 'ArrowDown' ? 1 : -1
    onHighlight((highlightedIndex + direction + itemCount) % itemCount)
    return true
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    onActivate(Math.min(Math.max(highlightedIndex, 0), itemCount - 1))
    return true
  }

  return false
}
