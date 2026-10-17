import type { C4ShapeKind } from './types'

/** Mirrors RouteSide in orthogonalRoute — kept local to avoid a cycle. */
export type PortSide = 'left' | 'right' | 'top' | 'bottom'

export type PortAttachMode = 'body' | 'outer'

export interface PortInsets {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * Per-shape connection-port layout.
 * - `bodyInset` shrinks the AABB to the silhouette region with straight edges.
 * - `sidePorts` caps how many ports each side may host (0 = none).
 * - `sideAttach` chooses whether a side pins to the body rect or the outer AABB
 *   (e.g. database top/bottom arcs, queue end caps).
 */
export interface ShapePortProfile {
  bodyInset: PortInsets
  sidePorts: Record<PortSide, number>
  sideAttach?: Partial<Record<PortSide, PortAttachMode>>
}

/** Classic rectangular C4 cards — L/R = 3, T/B = 4. */
export const RECT_PORT_PROFILE: ShapePortProfile = {
  bodyInset: { top: 0, right: 0, bottom: 0, left: 0 },
  sidePorts: { left: 3, right: 3, top: 4, bottom: 4 },
}

/**
 * Insets mirror `C4ShapeShell.module.css` chrome for each irregular silhouette.
 * Keep in sync when shape padding / head / stand sizes change.
 */
export const SHAPE_PORT_PROFILES: Record<C4ShapeKind, ShapePortProfile> = {
  // Head (~34) + padding-top (4) − head overlap (1); body padding 8 / 6.
  person: {
    bodyInset: { top: 37, right: 8, bottom: 6, left: 8 },
    sidePorts: { left: 3, right: 3, top: 0, bottom: 4 },
  },
  // Cylinder: L/R on body; one centered port on top/bottom arcs (outer AABB).
  database: {
    bodyInset: { top: 8, right: 4, bottom: 0, left: 4 },
    sidePorts: { left: 3, right: 3, top: 1, bottom: 1 },
    sideAttach: { top: 'outer', bottom: 'outer' },
  },
  // Pipe: T/B on body; one centered port on each elliptical end cap.
  queue: {
    bodyInset: { top: 6, right: 7, bottom: 6, left: 7 },
    sidePorts: { left: 1, right: 1, top: 4, bottom: 4 },
    sideAttach: { left: 'outer', right: 'outer' },
  },
  // Screen only — exclude narrow stand so L/R/B don't float beside it.
  desktop_app: {
    bodyInset: { top: 0, right: 8, bottom: 7, left: 8 },
    sidePorts: { left: 3, right: 3, top: 4, bottom: 4 },
  },
  // Main UML box — exclude left interface tabs.
  component: {
    bodyInset: { top: 0, right: 0, bottom: 0, left: 8 },
    sidePorts: { left: 3, right: 3, top: 4, bottom: 4 },
  },
  system: RECT_PORT_PROFILE,
  external_system: RECT_PORT_PROFILE,
  web_app: RECT_PORT_PROFILE,
  mobile_app: RECT_PORT_PROFILE,
  server: RECT_PORT_PROFILE,
  code: RECT_PORT_PROFILE,
}

export function getShapePortProfile(
  shape: C4ShapeKind | undefined,
): ShapePortProfile {
  if (!shape) return RECT_PORT_PROFILE
  return SHAPE_PORT_PROFILES[shape] ?? RECT_PORT_PROFILE
}

export function sideAttachMode(
  profile: ShapePortProfile,
  side: PortSide,
): PortAttachMode {
  return profile.sideAttach?.[side] ?? 'body'
}
