import type { SessionGraphModel } from '@contracts/index'
import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js'

export const SESSION_NODE_WIDTH = 228
export const SESSION_NODE_HEIGHT = 84

export interface SessionGraphLayout {
  width: number
  height: number
  positions: Record<string, { x: number; y: number }>
}

const elk = new ELK()

export async function layoutSessionGraph(model: SessionGraphModel): Promise<SessionGraphLayout> {
  if (model.nodes.length === 0) {
    return { width: 0, height: 0, positions: {} }
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
      height: SESSION_NODE_HEIGHT,
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
  }
}
