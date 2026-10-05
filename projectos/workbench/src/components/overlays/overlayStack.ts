export type OverlayToken = symbol

const overlayStack: OverlayToken[] = []

export function registerOverlay(token: OverlayToken): () => void {
  const previousIndex = overlayStack.indexOf(token)
  if (previousIndex >= 0) overlayStack.splice(previousIndex, 1)
  overlayStack.push(token)
  return () => {
    const index = overlayStack.lastIndexOf(token)
    if (index >= 0) overlayStack.splice(index, 1)
  }
}

export function isTopmostOverlay(token: OverlayToken): boolean {
  return overlayStack[overlayStack.length - 1] === token
}

interface EscapeKeyEvent {
  key: string
  preventDefault(): void
  stopPropagation(): void
}

export function handleTopmostOverlayEscape(
  event: EscapeKeyEvent,
  token: OverlayToken,
  close: () => void,
): boolean {
  if (event.key !== 'Escape' || !isTopmostOverlay(token)) return false
  event.preventDefault()
  event.stopPropagation()
  close()
  return true
}

export function resetOverlayStackForTests(): void {
  overlayStack.length = 0
}
