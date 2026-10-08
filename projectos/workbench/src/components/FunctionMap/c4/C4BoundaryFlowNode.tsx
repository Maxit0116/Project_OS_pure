import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import BoundaryShape from './shapes/BoundaryShape'

export interface C4BoundaryFlowNodeData {
  label: string
  description?: string
}

/**
 * React Flow node for dashed C4 system/container boundaries.
 * Wave 2 registers as `c4Boundary` with z-index below feature nodes.
 */
function C4BoundaryFlowNode({ data }: NodeProps & { data: C4BoundaryFlowNodeData }) {
  return <BoundaryShape label={data.label} description={data.description} />
}

export default memo(C4BoundaryFlowNode)
