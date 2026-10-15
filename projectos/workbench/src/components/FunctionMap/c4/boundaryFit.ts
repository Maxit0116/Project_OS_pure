/**
 * Tight C4 boundary geometry. Every side stays exactly PAD away from the
 * outermost member on that side, so the frame grows and shrinks with drags
 * and never keeps an empty margin larger than the padding.
 */

export const BOUNDARY_PAD = {
  left: 56,
  right: 56,
  top: 72,
  bottom: 48,
} as const

export interface BoundaryPad {
  left: number
  right: number
  top: number
  bottom: number
}

export interface BoundaryBox {
  position: { x: number; y: number }
  width: number
  height: number
}

export interface MemberRect {
  x: number
  y: number
  width: number
  height: number
}

export interface FittedBoundary {
  position: { x: number; y: number }
  width: number
  height: number
}

export function fitBoundaryToMembers(
  boundary: BoundaryBox,
  members: MemberRect[],
  pad: BoundaryPad = BOUNDARY_PAD,
): FittedBoundary {
  if (members.length === 0) {
    return {
      position: { x: boundary.position.x, y: boundary.position.y },
      width: boundary.width,
      height: boundary.height,
    }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const member of members) {
    minX = Math.min(minX, member.x)
    minY = Math.min(minY, member.y)
    maxX = Math.max(maxX, member.x + member.width)
    maxY = Math.max(maxY, member.y + member.height)
  }

  return {
    position: {
      x: minX - pad.left,
      y: minY - pad.top,
    },
    width: maxX - minX + pad.left + pad.right,
    height: maxY - minY + pad.top + pad.bottom,
  }
}

export function fitBoundaryToMemberNodes<
  B extends BoundaryBox,
  M extends { position: { x: number; y: number }; width: number; height: number },
>(boundary: B, members: M[], pad: BoundaryPad = BOUNDARY_PAD): B {
  const fitted = fitBoundaryToMembers(
    boundary,
    members.map((member) => ({
      x: member.position.x,
      y: member.position.y,
      width: member.width,
      height: member.height,
    })),
    pad,
  )
  return {
    ...boundary,
    position: fitted.position,
    width: fitted.width,
    height: fitted.height,
  }
}

export interface BoundaryMembershipNode {
  id: string
  position: { x: number; y: number }
  width: number
  height: number
  elementType?: string
  level?: string
}

function nodeInsideBoundary(boundary: BoundaryBox, node: BoundaryMembershipNode): boolean {
  return (
    node.position.x >= boundary.position.x - 1 &&
    node.position.y >= boundary.position.y - 1 &&
    node.position.x + node.width <= boundary.position.x + boundary.width + 1 &&
    node.position.y + node.height <= boundary.position.y + boundary.height + 1
  )
}

function isFallbackBoundaryMember(node: BoundaryMembershipNode): boolean {
  if (node.elementType === 'external_system' || node.elementType === 'person') return false
  return (
    node.level === 'container' ||
    node.level === 'component' ||
    node.level === 'code' ||
    node.elementType === 'data_store' ||
    node.elementType === 'container' ||
    node.elementType === 'component'
  )
}

/**
 * Membership is snapshotted once from the laid-out diagram. Later drags must
 * not reclassify a node, or a member that reaches the border would stop
 * pulling the frame.
 */
export function snapshotBoundaryMembers(
  boundaries: Array<BoundaryBox & { id: string }>,
  nodes: BoundaryMembershipNode[],
): Record<string, string[]> {
  const membership: Record<string, string[]> = {}
  for (const boundary of boundaries) {
    const inside = nodes.filter((node) => nodeInsideBoundary(boundary, node)).map((node) => node.id)
    if (inside.length > 0 || boundaries.length !== 1) {
      membership[boundary.id] = inside
      continue
    }
    membership[boundary.id] = nodes.filter(isFallbackBoundaryMember).map((node) => node.id)
  }
  return membership
}
