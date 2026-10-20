import type { AnnotationAnchor, ScreenRect } from '@contracts/spatial-pin'
import type { IntentEdgePort } from '@contracts/index'
import { portNormal } from '../components/LoopGraph/loopEdgeRouting'
import { anchorToPort } from './composeConnectionPorts'

export type CurvePoint = { x: number; y: number }

export { anchorToPort } from './composeConnectionPorts'

function outwardControl(
  from: CurvePoint,
  port: IntentEdgePort,
  distance: number,
): CurvePoint {
  const n = portNormal(port)
  return { x: from.x + n.x * distance, y: from.y + n.y * distance }
}

function sampleCubic(
  p0: CurvePoint,
  p1: CurvePoint,
  p2: CurvePoint,
  p3: CurvePoint,
  t: number,
): CurvePoint {
  const u = 1 - t
  const tt = t * t
  const uu = u * u
  const uuu = uu * u
  const ttt = tt * t
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  }
}

function inflate(rect: ScreenRect, pad: number): ScreenRect {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  }
}

function pointInRect(p: CurvePoint, r: ScreenRect): boolean {
  return (
    p.x >= r.x &&
    p.x <= r.x + r.width &&
    p.y >= r.y &&
    p.y <= r.y + r.height
  )
}

function nearEndpoint(
  p: CurvePoint,
  a: CurvePoint,
  b: CurvePoint,
  excludePx: number,
): boolean {
  return (
    Math.hypot(p.x - a.x, p.y - a.y) <= excludePx ||
    Math.hypot(p.x - b.x, p.y - b.y) <= excludePx
  )
}

function cubicHitsObstacles(
  p0: CurvePoint,
  p1: CurvePoint,
  p2: CurvePoint,
  p3: CurvePoint,
  obstacles: ScreenRect[],
  pad: number,
  endpointExcludePx: number,
): boolean {
  const inflated = obstacles.map((r) => inflate(r, pad))
  for (let i = 1; i < 16; i += 1) {
    const sample = sampleCubic(p0, p1, p2, p3, i / 16)
    if (nearEndpoint(sample, p0, p3, endpointExcludePx)) continue
    for (const rect of inflated) {
      if (pointInRect(sample, rect)) return true
    }
  }
  return false
}

/**
 * Cubic Bézier from compose attach → region/stencil head (Loop Graph style).
 * Control points push outward along NESW normals and laterally nudge so the
 * shaft stays in free space (does not cross card / region / stencil interiors).
 */
export function routeComposeArrowCurve(input: {
  /** Compose-card attach (visual tail). */
  from: CurvePoint
  /** Region / stencil head (arrow tip). */
  to: CurvePoint
  fromAnchor?: AnnotationAnchor
  toAnchor?: AnnotationAnchor
  /** Stage rects the curve must travel around (card, region, stubs…). */
  obstacles?: ScreenRect[]
}): { d: string; mid: CurvePoint; tipAngle: number } {
  const fromPort = input.fromAnchor
    ? anchorToPort(input.fromAnchor)
    : inferPortToward(input.from, input.to)
  const toPort = input.toAnchor
    ? anchorToPort(input.toAnchor)
    : inferPortToward(input.to, input.from)

  const p0 = input.from
  const p3 = input.to
  const span = Math.hypot(p3.x - p0.x, p3.y - p0.y)
  let pull = Math.max(40, Math.min(160, span * 0.38))
  const obstacles = input.obstacles ?? []
  const pad = 8
  const endpointExclude = 18

  let p1 = outwardControl(p0, fromPort, pull)
  let p2 = outwardControl(p3, toPort, pull)

  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (
      !cubicHitsObstacles(p0, p1, p2, p3, obstacles, pad, endpointExclude)
    ) {
      break
    }
    const lateral = (attempt + 1) * 40
    const dx = p3.x - p0.x
    const dy = p3.y - p0.y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const sign = attempt % 2 === 0 ? 1 : -1
    pull += 28
    p1 = outwardControl(p0, fromPort, pull)
    p2 = outwardControl(p3, toPort, pull)
    p1 = {
      x: p1.x + nx * lateral * sign,
      y: p1.y + ny * lateral * sign,
    }
    p2 = {
      x: p2.x + nx * lateral * sign,
      y: p2.y + ny * lateral * sign,
    }
  }

  const mid = sampleCubic(p0, p1, p2, p3, 0.5)
  const tipAngle = Math.atan2(p3.y - p2.y, p3.x - p2.x)
  return {
    d: `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`,
    mid,
    tipAngle,
  }
}

function inferPortToward(from: CurvePoint, toward: CurvePoint): IntentEdgePort {
  const dx = toward.x - from.x
  const dy = toward.y - from.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'e' : 'w'
  }
  return dy >= 0 ? 's' : 'n'
}
