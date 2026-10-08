import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { C4ShapeKind } from './types'
import { C4_SHAPE_COMPONENTS } from './shapes'
import styles from '../FeatureNode.module.css'

export interface C4FlowNodeData {
  shape: C4ShapeKind
  label: string
  description?: string
  technology?: string
  stereotype?: string
  members?: string[]
  selected?: boolean
  dimmed?: boolean
  /** Drill affordance for Wave 2 wiring. */
  canOpenGraph?: boolean
  onOpenGraph?: () => void
  openGraphLabel?: string
}

/**
 * React Flow wrapper around C4 shapes. Wave 2 registers this as node type `c4Shape`.
 * Hidden handles on all four sides so orthogonal edges can attach to any border;
 * actual attachment points are computed by the C4 orthogonal router.
 * Drill-in remains double-click on the canvas; optional button when canOpenGraph.
 */
function C4FlowNode({ data }: NodeProps & { data: C4FlowNodeData }) {
  const Shape = C4_SHAPE_COMPONENTS[data.shape] ?? C4_SHAPE_COMPONENTS.system
  return (
    <div className={styles.flowHost} data-c4-flow-node={data.shape}>
      <Handle id="t-top" type="target" position={Position.Top} className={styles.handleHidden} />
      <Handle id="t-bottom" type="target" position={Position.Bottom} className={styles.handleHidden} />
      <Handle id="t-left" type="target" position={Position.Left} className={styles.handleHidden} />
      <Handle id="t-right" type="target" position={Position.Right} className={styles.handleHidden} />
      <Handle id="s-top" type="source" position={Position.Top} className={styles.handleHidden} />
      <Handle id="s-bottom" type="source" position={Position.Bottom} className={styles.handleHidden} />
      <Handle id="s-left" type="source" position={Position.Left} className={styles.handleHidden} />
      <Handle id="s-right" type="source" position={Position.Right} className={styles.handleHidden} />
      <Shape
        label={data.label}
        description={data.description}
        technology={data.technology}
        stereotype={data.stereotype}
        members={data.members}
        selected={data.selected}
        dimmed={data.dimmed}
      />
      {data.canOpenGraph && data.onOpenGraph ? (
        <button
          type="button"
          className={styles.openGraph}
          style={{ position: 'absolute', left: 8, bottom: 6, zIndex: 1 }}
          onClick={(event) => {
            event.stopPropagation()
            data.onOpenGraph?.()
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          {data.openGraphLabel ?? 'Open'}
        </button>
      ) : null}
    </div>
  )
}

export default memo(C4FlowNode)
