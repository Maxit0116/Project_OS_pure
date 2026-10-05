import type { ResizeEdge } from '../../hooks/usePointerResize'

interface ResizeKeyEvent {
  key: string
  preventDefault(): void
  stopPropagation(): void
}

function deltaForArrowKey(edge: ResizeEdge, key: string, step: number): number | null {
  if (edge === 'east') {
    if (key === 'ArrowRight') return step
    if (key === 'ArrowLeft') return -step
  } else if (edge === 'west') {
    if (key === 'ArrowLeft') return step
    if (key === 'ArrowRight') return -step
  } else if (edge === 'north') {
    if (key === 'ArrowUp') return step
    if (key === 'ArrowDown') return -step
  } else {
    if (key === 'ArrowDown') return step
    if (key === 'ArrowUp') return -step
  }
  return null
}

export function applyPanelResizeArrowKey(
  event: ResizeKeyEvent,
  edge: ResizeEdge,
  onDelta: (delta: number) => unknown,
  step = 16,
): boolean {
  const delta = deltaForArrowKey(edge, event.key, step)
  if (delta === null) return false
  event.preventDefault()
  event.stopPropagation()
  onDelta(delta)
  return true
}
