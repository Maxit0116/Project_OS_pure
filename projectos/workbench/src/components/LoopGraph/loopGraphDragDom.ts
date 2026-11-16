/** Apply world-space left/top during geometry drag without touching React state. */

function escapeAttr(id: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(id)
  }
  return id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function setWorldNodeDomPosition(
  worldEl: HTMLElement | null,
  nodeId: string,
  position: { x: number; y: number },
): void {
  if (!worldEl) return
  const el = worldEl.querySelector(
    `[data-loop-node="${escapeAttr(nodeId)}"]`,
  ) as HTMLElement | null
  if (!el) return
  el.style.left = `${position.x}px`
  el.style.top = `${position.y}px`
}

export function setWorldWorkGroupDomPosition(
  worldEl: HTMLElement | null,
  workGroupId: string,
  position: { x: number; y: number },
): void {
  if (!worldEl) return
  const el = worldEl.querySelector(
    `[data-loop-work-group="${escapeAttr(workGroupId)}"]`,
  ) as HTMLElement | null
  if (!el) return
  el.style.left = `${position.x}px`
  el.style.top = `${position.y}px`
}

export function setWorldDomPositions(
  worldEl: HTMLElement | null,
  positions: Map<string, { x: number; y: number }>,
): void {
  for (const [id, position] of positions) {
    setWorldNodeDomPosition(worldEl, id, position)
  }
}

export function setGeometryChromeDimmed(
  edgesEl: HTMLElement | SVGElement | null,
  branchLabelEl: HTMLElement | SVGElement | null,
  dimmed: boolean,
): void {
  const opacity = dimmed ? '0.28' : ''
  if (edgesEl) edgesEl.style.opacity = opacity
  if (branchLabelEl) branchLabelEl.style.opacity = opacity
}
