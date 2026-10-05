import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { FeatureNodeCard, type FeatureNodeData } from './FeatureNodeCard'
import styles from './FeatureNode.module.css'

export type { FeatureNodeData }
export { isPurposeFirstArchitectureLevel, featureNodeAccent } from './FeatureNodeCard'

/**
 * Feature cards. Invisible center handles satisfy React Flow's edge plumbing;
 * visible attachment points are computed per-edge on an ellipse in FloatingStraightEdge.
 */
function FeatureNode({ data }: NodeProps & { data: FeatureNodeData }) {
  return (
    <div className={styles.flowHost}>
      <Handle type="target" position={Position.Top} className={styles.handleHidden} />
      <Handle type="source" position={Position.Bottom} className={styles.handleHidden} />
      <FeatureNodeCard data={data} />
    </div>
  )
}

export default memo(FeatureNode)
