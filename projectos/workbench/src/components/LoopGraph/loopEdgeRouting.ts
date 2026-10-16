import type { IntentEdgePort, IntentGraphNode } from '@contracts/index'

export type Point = { x: number; y: number }

export const LOOP_NODE_W = 200
export const LOOP_NODE_H = 56
export const LOOP_PORT_INSET = 0

const PORTS: IntentEdgePort[] = ['n', 'e', 's', 'w']

export function portPoint(
  node: Pick<IntentGraphNode, 'position'>,
  port: IntentEdgePort,
  width = LOOP_NODE_W,
  height = LOOP_NODE_H,
): Point {
  const { x, y } = node.position
  switch (port) {
    case 'n':
      return { x: x + width / 2, y: y + LOOP_PORT_INSET }
    case 'e':
      return { x: x + width - LOOP_PORT_INSET, y: y + height / 2 }
    case 's':
      return { x: x + width / 2, y: y + height - LOOP_PORT_INSET }
    case 'w':
      return { x: x + LOOP_PORT_INSET, y: y + height / 2 }
  }
}

export function portNormal(port: IntentEdgePort): Point {
  switch (port) {
    case 'n':
      return { x: 0, y: -1 }
    case 'e':
      return { x: 1, y: 0 }
    case 's':
      return { x: 0, y: 1 }
    case 'w':
      return { x: -1, y: 0 }
  }
}

function dist2(a: Point, b: Point): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

export function nearestPort(
  node: Pick<IntentGraphNode, 'position'>,
  point: Point,
  width = LOOP_NODE_W,
  height = LOOP_NODE_H,
): IntentEdgePort {
  let best: IntentEdgePort = 's'
  let bestDist = Number.POSITIVE_INFINITY
  for (const port of PORTS) {
    const d = dist2(portPoint(node, port, width, height), point)
    if (d < bestDist) {
      bestDist = d
      best = port
    }
  }
  return best
}

/** Prefer facing ports between two node centers (fallback when ports not stored). */
export function preferredPortsForPair(
  source: Pick<IntentGraphNode, 'position'>,
  target: Pick<IntentGraphNode, 'position'>,
  width = LOOP_NODE_W,
  height = LOOP_NODE_H,
): { sourcePort: IntentEdgePort; targetPort: IntentEdgePort } {
  const sc = {
    x: source.position.x + width / 2,
    y: source.position.y + height / 2,
  }
  const tc = {
    x: target.position.x + width / 2,
    y: target.position.y + height / 2,
  }
  return {
    sourcePort: nearestPort(source, tc, width, height),
    targetPort: nearestPort(target, sc, width, height),
  }
}

function nodeRect(
  node: Pick<IntentGraphNode, 'position' | 'id'>,
  width = LOOP_NODE_W,
  height = LOOP_NODE_H,
  pad = 10,
): { id: string; x: number; y: number; w: number; h: number } {
  return {
    id: node.id,
    x: node.position.x - pad,
    y: node.position.y - pad,
    w: width + pad * 2,
    h: height + pad * 2,
  }
}

function pointInRect(
  p: Point,
  r: { x: number; y: number; w: number; h: number },
): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}

function sampleCubic(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
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

function cubicHitsObstacle(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  obstacles: Array<{ id: string; x: number; y: number; w: number; h: number }>,
  ignoreIds: Set<string>,
): boolean {
  for (let i = 1; i < 12; i += 1) {
    const sample = sampleCubic(p0, p1, p2, p3, i / 12)
    for (const rect of obstacles) {
      if (ignoreIds.has(rect.id)) continue
      if (pointInRect(sample, rect)) return true
    }
  }
  return false
}

function outwardControl(from: Point, port: IntentEdgePort, distance: number): Point {
  const n = portNormal(port)
  return { x: from.x + n.x * distance, y: from.y + n.y * distance }
}

export interface RoutedEdge {
  d: string
  x1: number
  y1: number
  x2: number
  y2: number
  mid: Point
  sourcePort: IntentEdgePort
  targetPort: IntentEdgePort | null
}

/**
 * Route a cubic edge from a source port to a target port (or free-floating point for previews).
 * Pushes control points outward and laterally to reduce covering other nodes.
 */
export function routeLoopEdge(input: {
  source: IntentGraphNode
  target?: IntentGraphNode | null
  endPoint?: Point | null
  sourcePort?: IntentEdgePort
  targetPort?: IntentEdgePort
  obstacles?: IntentGraphNode[]
  width?: number
  height?: number
}): RoutedEdge {
  const width = input.width ?? LOOP_NODE_W
  const height = input.height ?? LOOP_NODE_H
  const end: Point =
    input.endPoint ??
    (input.target
      ? {
          x: input.target.position.x + width / 2,
          y: input.target.position.y + height / 2,
        }
      : portPoint(input.source, 's', width, height))

  const sourcePort =
    input.sourcePort ??
    nearestPort(input.source, end, width, height)

  let targetPort: IntentEdgePort | null = input.targetPort ?? null
  if (input.target && !targetPort) {
    targetPort = nearestPort(
      input.target,
      portPoint(input.source, sourcePort, width, height),
      width,
      height,
    )
  }

  const p0 = portPoint(input.source, sourcePort, width, height)
  const p3 = input.target && targetPort
    ? portPoint(input.target, targetPort, width, height)
    : end

  const span = Math.hypot(p3.x - p0.x, p3.y - p0.y)
  let pull = Math.max(48, Math.min(160, span * 0.35))

  const obstacles = (input.obstacles ?? [])
    .filter((node) => node.id !== input.source.id && node.id !== input.target?.id)
    .map((node) => nodeRect(node, width, height))

  const ignore = new Set(
    [input.source.id, input.target?.id].filter(Boolean) as string[],
  )

  let p1 = outwardControl(p0, sourcePort, pull)
  let p2 = targetPort
    ? outwardControl(p3, targetPort, pull)
    : {
        x: p3.x - (p3.x - p0.x) * 0.15,
        y: p3.y - (p3.y - p0.y) * 0.15,
      }

  // Lateral nudge to reduce crossings / node overlap.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (!cubicHitsObstacle(p0, p1, p2, p3, obstacles, ignore)) break
    const lateral = (attempt + 1) * 36
    const dx = p3.x - p0.x
    const dy = p3.y - p0.y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const sign = attempt % 2 === 0 ? 1 : -1
    p1 = {
      x: p1.x + nx * lateral * sign,
      y: p1.y + ny * lateral * sign,
    }
    p2 = {
      x: p2.x + nx * lateral * sign,
      y: p2.y + ny * lateral * sign,
    }
    pull += 24
    p1 = outwardControl(p0, sourcePort, pull)
    p1 = {
      x: p1.x + nx * lateral * sign,
      y: p1.y + ny * lateral * sign,
    }
    if (targetPort) {
      p2 = outwardControl(p3, targetPort, pull)
      p2 = {
        x: p2.x + nx * lateral * sign,
        y: p2.y + ny * lateral * sign,
      }
    }
  }

  const mid = sampleCubic(p0, p1, p2, p3, 0.5)
  return {
    d: `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`,
    x1: p0.x,
    y1: p0.y,
    x2: p3.x,
    y2: p3.y,
    mid,
    sourcePort,
    targetPort,
  }
}

export function truncateEdgeLabel(text: string, max = 36): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  if (!trimmed) return ''
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}
