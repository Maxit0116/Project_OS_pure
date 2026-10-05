import type { MapArtifact, MapArtifactType } from '@contracts/index'

export const ARTIFACT_DROP_TARGET_ATTR = 'data-artifact-drop-target'
export const ARTIFACT_DROP_TYPE_ATTR = 'data-artifact-drop-type'

const DRAG_THRESHOLD_PX = 5
const VERTICAL_DOMINANCE_RATIO = 1.2

export interface TabDragTearoffState {
  mode: 'tearoff'
  sourceArtifactId: string
  sourceType: MapArtifactType
  hoverTargetNodeId: string | null
  hoverCompatible: boolean | null
  ghostLabel: string
  ghostX: number
  ghostY: number
}

export interface TabDragReorderState {
  mode: 'reorder'
  stackNodeId: string
  sourceArtifactId: string
  orderedIds: string[]
  insertIndex: number
}

export type TabDragState = TabDragTearoffState | TabDragReorderState

let tabDragState: TabDragState | null = null
let suppressNextTabClick = false
const tabDragListeners = new Set<() => void>()

function tabDragStatesEqual(a: TabDragState, b: TabDragState): boolean {
  if (a.mode !== b.mode) return false
  if (a.mode === 'reorder' && b.mode === 'reorder') {
    return (
      a.stackNodeId === b.stackNodeId &&
      a.sourceArtifactId === b.sourceArtifactId &&
      a.insertIndex === b.insertIndex &&
      a.orderedIds.join('\0') === b.orderedIds.join('\0')
    )
  }
  if (a.mode === 'tearoff' && b.mode === 'tearoff') {
    return (
      a.sourceArtifactId === b.sourceArtifactId &&
      a.sourceType === b.sourceType &&
      a.hoverTargetNodeId === b.hoverTargetNodeId &&
      a.hoverCompatible === b.hoverCompatible &&
      a.ghostLabel === b.ghostLabel &&
      Math.abs(a.ghostX - b.ghostX) < 1 &&
      Math.abs(a.ghostY - b.ghostY) < 1
    )
  }
  return false
}

function setTabDragState(next: TabDragState | null) {
  if (next === null) {
    if (tabDragState === null) return
    tabDragState = null
  } else if (tabDragState !== null && tabDragStatesEqual(tabDragState, next)) {
    return
  } else {
    tabDragState = next
  }
  for (const listener of tabDragListeners) {
    listener()
  }
}

export function getTabDragState(): TabDragState | null {
  return tabDragState
}

export function subscribeTabDrag(listener: () => void): () => void {
  tabDragListeners.add(listener)
  return () => tabDragListeners.delete(listener)
}

export function findArtifactDropTarget(clientX: number, clientY: number): string | null {
  return resolveArtifactDropTarget(clientX, clientY)?.nodeId ?? null
}

export function resolveArtifactDropTarget(
  clientX: number,
  clientY: number,
): { nodeId: string; type: MapArtifactType } | null {
  const element = document.elementFromPoint(clientX, clientY)
  if (!element) return null
  const target = element.closest(`[${ARTIFACT_DROP_TARGET_ATTR}]`)
  if (!target) return null
  const nodeId = target.getAttribute(ARTIFACT_DROP_TARGET_ATTR)
  const type = target.getAttribute(ARTIFACT_DROP_TYPE_ATTR) as MapArtifactType | null
  if (!nodeId || !type) return null
  return { nodeId, type }
}

interface TabCenter {
  id: string
  centerX: number
}

export function isPointerInTabStrip(
  clientX: number,
  clientY: number,
  stripRect: DOMRect,
): boolean {
  return (
    clientX >= stripRect.left &&
    clientX <= stripRect.right &&
    clientY >= stripRect.top &&
    clientY <= stripRect.bottom
  )
}

export function shouldUseReorderDragMode(
  dx: number,
  dy: number,
  inStrip: boolean,
  reorderEnabled: boolean,
): boolean {
  if (!reorderEnabled || !inStrip) return false
  return Math.abs(dy) <= Math.abs(dx) * VERTICAL_DOMINANCE_RATIO
}

export function computeTabReorderPreview(
  sortedIds: string[],
  draggingId: string,
  pointerX: number,
  tabCenters: TabCenter[],
): { orderedIds: string[]; insertIndex: number } {
  const withoutDragged = sortedIds.filter((id) => id !== draggingId)
  const centerById = new Map(tabCenters.map((tab) => [tab.id, tab.centerX]))

  let insertIndex = withoutDragged.length
  for (let index = 0; index < withoutDragged.length; index += 1) {
    const id = withoutDragged[index]!
    const center = centerById.get(id)
    if (center !== undefined && pointerX < center) {
      insertIndex = index
      break
    }
  }

  const orderedIds = [...withoutDragged]
  orderedIds.splice(insertIndex, 0, draggingId)
  return { orderedIds, insertIndex }
}

interface TabDragCallbacks {
  onDetach: (artifactId: string, screenPoint: { x: number; y: number }) => void
  onMerge: (artifactId: string, targetNodeId: string) => void
  onReorder?: (orderedIds: string[]) => void
  onTypeMismatch?: () => void
}

interface StartStackTabDragOptions {
  sortedMemberIds: string[]
  stripElement: HTMLElement
  reorderEnabled: boolean
}

export function startStackTabDrag(
  event: React.PointerEvent<HTMLElement>,
  artifactId: string,
  stackNodeId: string,
  sourceType: MapArtifactType,
  ghostLabel: string,
  callbacks: TabDragCallbacks,
  options: StartStackTabDragOptions,
): () => void {
  if (event.button !== 0) return () => undefined

  const target = event.currentTarget
  const startX = event.clientX
  const startY = event.clientY
  let dragging = false
  let ghostEl: HTMLDivElement | null = null

  const getStripRect = () => options.stripElement.getBoundingClientRect()

  const collectTabCenters = (): TabCenter[] => {
    const tabs = options.stripElement.querySelectorAll<HTMLElement>('[data-stack-tab-id]')
    return [...tabs].map((tab) => {
      const rect = tab.getBoundingClientRect()
      return {
        id: tab.dataset.stackTabId!,
        centerX: rect.left + rect.width / 2,
      }
    })
  }

  const updateGhost = (x: number, y: number) => {
    if (!ghostEl) {
      ghostEl = document.createElement('div')
      ghostEl.className = 'map-artifact-tab-ghost'
      ghostEl.textContent = ghostLabel
      document.body.appendChild(ghostEl)
    }
    ghostEl.style.left = `${x + 12}px`
    ghostEl.style.top = `${y + 8}px`
  }

  const removeGhost = () => {
    ghostEl?.remove()
    ghostEl = null
  }

  let cleanedUp = false
  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true
    document.removeEventListener('pointermove', handleMove)
    document.removeEventListener('pointerup', handleUp)
    document.removeEventListener('pointercancel', handleCancel)
    document.body.style.cursor = previousCursor
    document.body.style.userSelect = previousUserSelect
    removeGhost()
    setTabDragState(null)
    try {
      target.releasePointerCapture(event.pointerId)
    } catch {
      // Pointer capture can already be gone after DOM removal/cancellation.
    }
  }

  const handleTearoffMove = (moveEvent: PointerEvent) => {
    updateGhost(moveEvent.clientX, moveEvent.clientY)

    const dropTarget = resolveArtifactDropTarget(moveEvent.clientX, moveEvent.clientY)
    if (!dropTarget || dropTarget.nodeId === stackNodeId) {
      setTabDragState({
        mode: 'tearoff',
        sourceArtifactId: artifactId,
        sourceType,
        hoverTargetNodeId: null,
        hoverCompatible: null,
        ghostLabel,
        ghostX: moveEvent.clientX,
        ghostY: moveEvent.clientY,
      })
      return
    }

    const compatible = dropTarget.type === sourceType
    setTabDragState({
      mode: 'tearoff',
      sourceArtifactId: artifactId,
      sourceType,
      hoverTargetNodeId: dropTarget.nodeId,
      hoverCompatible: compatible,
      ghostLabel,
      ghostX: moveEvent.clientX,
      ghostY: moveEvent.clientY,
    })
  }

  const handleMove = (moveEvent: PointerEvent) => {
    const dx = moveEvent.clientX - startX
    const dy = moveEvent.clientY - startY
    if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    dragging = true
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'

    const inStrip = isPointerInTabStrip(
      moveEvent.clientX,
      moveEvent.clientY,
      getStripRect(),
    )
    const useReorder = shouldUseReorderDragMode(
      dx,
      dy,
      inStrip,
      options.reorderEnabled,
    )

    if (useReorder) {
      removeGhost()
      const preview = computeTabReorderPreview(
        options.sortedMemberIds,
        artifactId,
        moveEvent.clientX,
        collectTabCenters(),
      )
      setTabDragState({
        mode: 'reorder',
        stackNodeId,
        sourceArtifactId: artifactId,
        orderedIds: preview.orderedIds,
        insertIndex: preview.insertIndex,
      })
      return
    }

    handleTearoffMove(moveEvent)
  }

  const handleUp = (upEvent: PointerEvent) => {
    const wasDragging = dragging
    const finalState = tabDragState
    cleanup()
    if (!wasDragging) return

    suppressNextTabClick = true

    const inStrip = isPointerInTabStrip(
      upEvent.clientX,
      upEvent.clientY,
      getStripRect(),
    )
    const dx = upEvent.clientX - startX
    const dy = upEvent.clientY - startY
    const releaseAsReorder =
      options.reorderEnabled &&
      inStrip &&
      shouldUseReorderDragMode(dx, dy, inStrip, options.reorderEnabled)

    if (releaseAsReorder && finalState?.mode === 'reorder') {
      const baseline = options.sortedMemberIds.join(',')
      const next = finalState.orderedIds.join(',')
      if (next !== baseline) {
        callbacks.onReorder?.(finalState.orderedIds)
      }
      return
    }

    const dropTarget = resolveArtifactDropTarget(upEvent.clientX, upEvent.clientY)
    if (dropTarget && dropTarget.nodeId !== stackNodeId) {
      if (dropTarget.type !== sourceType) {
        callbacks.onTypeMismatch?.()
        return
      }
      callbacks.onMerge(artifactId, dropTarget.nodeId)
      return
    }

    callbacks.onDetach(artifactId, { x: upEvent.clientX, y: upEvent.clientY })
  }

  const handleCancel = () => {
    cleanup()
  }

  const previousCursor = document.body.style.cursor
  const previousUserSelect = document.body.style.userSelect
  target.setPointerCapture(event.pointerId)
  document.addEventListener('pointermove', handleMove)
  document.addEventListener('pointerup', handleUp)
  document.addEventListener('pointercancel', handleCancel)
  return cleanup
}

export function consumeTabClickSuppression(): boolean {
  if (!suppressNextTabClick) return false
  suppressNextTabClick = false
  return true
}

export function sortStackMembersForTabs(members: MapArtifact[]): MapArtifact[] {
  return [...members].sort((a, b) => (a.stackOrder ?? 0) - (b.stackOrder ?? 0))
}

export function isTabDragHoverTarget(
  stackNodeId: string,
  artifactType: MapArtifactType,
): 'compatible' | 'incompatible' | null {
  const state = tabDragState
  if (!state || state.mode !== 'tearoff' || state.hoverTargetNodeId !== stackNodeId) {
    return null
  }
  if (state.sourceType !== artifactType) return 'incompatible'
  return state.hoverCompatible ? 'compatible' : 'incompatible'
}

export function getTabReorderPreview(
  stackNodeId: string,
): TabDragReorderState | null {
  const state = tabDragState
  if (!state || state.mode !== 'reorder' || state.stackNodeId !== stackNodeId) {
    return null
  }
  return state
}
