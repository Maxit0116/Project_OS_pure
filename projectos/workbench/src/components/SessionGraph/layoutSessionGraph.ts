import { SESSION_GRAPH_STRIP_MAX_ITEMS, type SessionGraphModel } from '@contracts/index'
import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js'

export const SESSION_NODE_WIDTH = 252
/** Compact head row: task + title + live chip. */
export const SESSION_NODE_HEAD_HEIGHT = 34
/** Footer: message count + relative time. */
export const SESSION_NODE_FOOT_HEIGHT = 26
/** Vertical padding around the strip list. */
export const SESSION_NODE_STRIP_PAD = 8
/** One curated strip row. */
export const SESSION_NODE_STRIP_ROW = 22
/** Empty / missing strip still reserves one row for the empty label. */
export const SESSION_NODE_MIN_STRIP_ROWS = 1

/** Compact card when there is no strip content yet. */
export const SESSION_NODE_HEIGHT = estimateSessionNodeHeight(0)

/**
 * Card height grows with strip rows up to SESSION_GRAPH_STRIP_MAX_ITEMS.
 * Beyond that the strip scrolls inside a fixed viewport of that many rows.
 */
export function estimateSessionNodeHeight(stripCount: number): number {
  const rows = Math.min(
    Math.max(SESSION_NODE_MIN_STRIP_ROWS, stripCount),
    SESSION_GRAPH_STRIP_MAX_ITEMS,
  )
  return (
    SESSION_NODE_HEAD_HEIGHT +
    SESSION_NODE_STRIP_PAD +
    rows * SESSION_NODE_STRIP_ROW +
    SESSION_NODE_FOOT_HEIGHT
  )
}

export interface SessionGraphLayout {
  width: number
  height: number
  positions: Record<string, { x: number; y: number }>
  heights: Record<string, number>
}

const elk = new ELK()

export async function layoutSessionGraph(model: SessionGraphModel): Promise<SessionGraphLayout> {
  if (model.nodes.length === 0) {
    return { width: 0, height: 0, positions: {}, heights: {} }
  }

  const heights: Record<string, number> = {}
  for (const node of model.nodes) {
    heights[node.id] = estimateSessionNodeHeight(node.stripCount)
  }

  const graph: ElkNode = {
    id: 'sessions',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.separateConnectedComponents': 'true',
      'elk.spacing.componentComponent': '72',
      'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '64',
    },
    children: model.nodes.map((node) => ({
      id: node.id,
      width: SESSION_NODE_WIDTH,
      height: heights[node.id] ?? SESSION_NODE_HEIGHT,
    })),
    edges: model.edges.map((edge) => ({
      id: `${edge.source}-${edge.target}`,
      sources: [edge.source],
      targets: [edge.target],
    })),
  }
  const laidOut = await elk.layout(graph)

  const positions: Record<string, { x: number; y: number }> = {}
  for (const child of laidOut.children ?? []) {
    positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 }
  }

  return {
    width: Math.max(laidOut.width ?? SESSION_NODE_WIDTH, SESSION_NODE_WIDTH),
    height: Math.max(laidOut.height ?? SESSION_NODE_HEIGHT, SESSION_NODE_HEIGHT),
    positions,
    heights,
  }
}
