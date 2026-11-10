/**
 * GC-6.5 — navigable Loop graph minimap (P2 polish).
 * Click pans the main viewport; does not invent a second edit surface.
 */
import { useMemo, type MouseEvent } from 'react'
import type { IntentGraphNode } from '@contracts/index'
import { useI18n } from '../../i18n'
import { LOOP_NODE_H, LOOP_NODE_W } from './loopEdgeRouting'
import styles from './LoopGraphMinimap.module.css'

export type LoopViewport = { x: number; y: number; scale: number }

export type LoopGraphMinimapProps = {
  nodes: IntentGraphNode[]
  viewport: LoopViewport
  canvasWidth: number
  canvasHeight: number
  onPanToWorld: (worldX: number, worldY: number) => void
}

const PAD = 40
const MAP_W = 148
const MAP_H = 108

export function computeGraphBounds(nodes: IntentGraphNode[]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
} {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 400, maxY: 300, width: 400, height: 300 }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
    maxX = Math.max(maxX, node.position.x + LOOP_NODE_W)
    maxY = Math.max(maxY, node.position.y + LOOP_NODE_H)
  }
  minX -= PAD
  minY -= PAD
  maxX += PAD
  maxY += PAD
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  }
}

export default function LoopGraphMinimap({
  nodes,
  viewport,
  canvasWidth,
  canvasHeight,
  onPanToWorld,
}: LoopGraphMinimapProps) {
  const { ts } = useI18n()
  const bounds = useMemo(() => computeGraphBounds(nodes), [nodes])
  const fit = Math.min(MAP_W / bounds.width, MAP_H / bounds.height)

  const viewLeft = (-viewport.x) / viewport.scale
  const viewTop = (-viewport.y) / viewport.scale
  const viewW = canvasWidth / Math.max(0.01, viewport.scale)
  const viewH = canvasHeight / Math.max(0.01, viewport.scale)

  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const mx = event.clientX - rect.left
    const my = event.clientY - rect.top
    const worldX = bounds.minX + mx / fit
    const worldY = bounds.minY + my / fit
    onPanToWorld(worldX, worldY)
  }

  return (
    <button
      type="button"
      className={styles.minimap}
      data-loop-minimap=""
      data-testid="loop-graph-minimap"
      aria-label={ts('chat.loopGraph.minimap')}
      title={ts('chat.loopGraph.minimapHint')}
      onClick={onClick}
    >
      <span className={styles.surface} aria-hidden="true">
        {nodes.map((node) => (
          <span
            key={node.id}
            className={styles.node}
            data-loop-minimap-node={node.id}
            style={{
              left: (node.position.x - bounds.minX) * fit,
              top: (node.position.y - bounds.minY) * fit,
              width: Math.max(3, LOOP_NODE_W * fit),
              height: Math.max(2, LOOP_NODE_H * fit),
            }}
          />
        ))}
        <span
          className={styles.viewport}
          data-loop-minimap-viewport=""
          style={{
            left: (viewLeft - bounds.minX) * fit,
            top: (viewTop - bounds.minY) * fit,
            width: Math.max(8, viewW * fit),
            height: Math.max(6, viewH * fit),
          }}
        />
      </span>
    </button>
  )
}
