import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import styles from './ArchitectureLayerNode.module.css'

export interface ArchitectureLayerNodeData {
  label: string
  description: string
  opacity?: number
}

function ArchitectureLayerNode({ data }: NodeProps & { data: ArchitectureLayerNodeData }) {
  return (
    <section
      className={styles.band}
      aria-label={`${data.label}: ${data.description}`}
      data-tour="architecture-layer"
      style={{ opacity: data.opacity ?? 1 }}
    >
      <div className={styles.header}>
        <strong>{data.label}</strong>
        <span>{data.description}</span>
      </div>
    </section>
  )
}

export default memo(ArchitectureLayerNode)
