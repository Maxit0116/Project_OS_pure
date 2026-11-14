import type { LoopSpec, LoopSpecNode } from '@contracts/index'
import { useMemo } from 'react'
import {
  isDiamondLoopVisualKey,
  visualForKey,
  visualKeyFromArchitecture,
} from './loopNodeVisuals'
import { layoutLoopReviewPath } from './loopReviewLayout'
import styles from './LoopReviewPathMap.module.css'

type Props = {
  spec: Pick<LoopSpec, 'nodes' | 'edges'>
  selectedNodeId: string | null
  highlightNodeId?: string | null
  highlightEdgeId?: string | null
  caption?: string
  onSelectNode: (nodeId: string | null) => void
}

function visualForSpecNode(node: LoopSpecNode) {
  return visualForKey(visualKeyFromArchitecture(node))
}

export default function LoopReviewPathMap({
  spec,
  selectedNodeId,
  highlightNodeId = null,
  highlightEdgeId = null,
  caption,
  onSelectNode,
}: Props) {
  const layout = useMemo(() => layoutLoopReviewPath(spec), [spec])
  const nodesById = useMemo(
    () => new Map(spec.nodes.map((node) => [node.id, node])),
    [spec.nodes],
  )

  return (
    <div data-loop-review-path-map="">
      {caption ? <p className={styles.caption}>{caption}</p> : null}
      <div className={styles.wrap}>
      <svg
        className={styles.svg}
        width={layout.width}
        height={layout.height}
        role="img"
        aria-label={caption}
        onClick={() => onSelectNode(null)}
      >
        {layout.groups.map((group) => (
          <g key={group.id} pointerEvents="none">
            <rect
              className={
                group.kind === 'parallel'
                  ? styles.groupParallel
                  : group.kind === 'workgroup'
                    ? styles.groupWorkGroup
                    : styles.groupLoop
              }
              x={group.x}
              y={group.y}
              width={group.width}
              height={group.height}
              rx={6}
            />
            <text
              className={styles.groupLabel}
              x={group.x + 8}
              y={group.y + 12}
            >
              {group.label}
            </text>
          </g>
        ))}
        {layout.edges.map((edge) => (
          <g key={edge.id}>
            <path
              className={`${styles.edge} ${
                edge.kind === 'feedback' ? styles.edgeFeedback : ''
              } ${edge.kind === 'conditional' ? styles.edgeConditional : ''} ${
                highlightEdgeId === edge.id ? styles.edgeHighlight : ''
              }`}
              d={edge.d}
              pointerEvents="none"
            />
            {edge.kind === 'feedback' || edge.branchKey ? (
              <text
                className={styles.edgeLabel}
                x={edge.mid.x}
                y={edge.mid.y}
                textAnchor="middle"
                pointerEvents="none"
              >
                {edge.branchKey ?? 'feedback'}
              </text>
            ) : null}
          </g>
        ))}
        {layout.nodes.map((box) => {
          const node = nodesById.get(box.id)
          if (!node) return null
          const visual = visualForSpecNode(node)
          const Icon = visual.Icon
          const diamond = isDiamondLoopVisualKey(visual.key)
          const selected = selectedNodeId === box.id
          const highlighted = highlightNodeId === box.id
          return (
            <g
              key={box.id}
              className={`${styles.node} ${selected ? styles.nodeSelected : ''} ${
                highlighted ? styles.nodeHighlight : ''
              } ${diamond ? styles.nodeIsDiamond : ''}`}
              transform={`translate(${box.x}, ${box.y})`}
              onClick={(event) => {
                event.stopPropagation()
                onSelectNode(selected ? null : box.id)
              }}
            >
              <title>{node.goal}</title>
              {diamond ? (
                <polygon
                  className={styles.nodeDiamond}
                  points={`${box.width / 2},1 ${box.width - 1},${box.height / 2} ${box.width / 2},${box.height - 1} 1,${box.height / 2}`}
                />
              ) : (
                <rect
                  className={styles.nodeRect}
                  width={box.width}
                  height={box.height}
                  rx={6}
                />
              )}
              <foreignObject
                className={styles.nodeForeign}
                x={0}
                y={0}
                width={box.width}
                height={box.height}
              >
                <div
                  className={`${styles.nodeChip} ${styles[visual.categoryClass] ?? ''} ${
                    diamond ? styles.nodeChipDiamond : ''
                  }`}
                  aria-label={`${visual.shortLabel}: ${node.goal}`}
                >
                  <span className={styles.nodeIcon}>
                    <Icon size={14} aria-hidden />
                  </span>
                  <span className={styles.title}>{visual.shortLabel}</span>
                </div>
              </foreignObject>
            </g>
          )
        })}
      </svg>
      </div>
    </div>
  )
}
