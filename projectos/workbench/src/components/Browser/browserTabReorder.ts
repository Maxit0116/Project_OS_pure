export function moveTabInArray<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return [...items]
  }

  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

export interface TabDropMetric {
  id: string
  left: number
  width: number
}

/** Map pointer X to a store-order insertion index for the dragged tab. */
export function computeTabDropIndex(
  pointerX: number,
  storeTabIds: readonly string[],
  metrics: readonly TabDropMetric[],
  draggedTabId: string,
): number {
  const fromIndex = storeTabIds.indexOf(draggedTabId)
  if (fromIndex < 0) return 0

  const ordered = [...metrics].sort((a, b) => a.left - b.left)

  for (const metric of ordered) {
    if (metric.id === draggedTabId) continue
    const midpoint = metric.left + metric.width / 2
    if (pointerX < midpoint) {
      const targetIndex = storeTabIds.indexOf(metric.id)
      return targetIndex > fromIndex ? targetIndex - 1 : targetIndex
    }
  }

  return storeTabIds.length - 1
}
