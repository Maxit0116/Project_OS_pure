import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import BoundaryShape from './shapes/BoundaryShape'

export interface C4BoundaryFlowNodeData {
  label: string
  description?: string
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

/**
 * React Flow node for dashed C4 system/container boundaries.
 * Wave 2 registers as `c4Boundary` with z-index below feature nodes.
 */
function C4BoundaryFlowNode({
  data,
}: NodeProps & { data: C4BoundaryFlowNodeData }) {
  // Fill the React Flow node box — without explicit 100% height the dashed
  // frame collapses to the header strip (only a top rule is visible).
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      {data.onToggleCollapsed ? (
        <button
          type="button"
          aria-label={data.collapsed ? 'Expand boundary' : 'Collapse boundary'}
          onClick={(event) => {
            event.stopPropagation()
            data.onToggleCollapsed?.()
          }}
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            zIndex: 2,
            display: 'grid',
            placeItems: 'center',
            width: 22,
            height: 22,
            padding: 0,
            border: '1px solid var(--tech-border)',
            borderRadius: 4,
            background: 'var(--tech-bg-elevated)',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            pointerEvents: 'auto',
          }}
        >
          {data.collapsed ? (
            <ChevronRight size={12} aria-hidden />
          ) : (
            <ChevronDown size={12} aria-hidden />
          )}
        </button>
      ) : null}
      <BoundaryShape
        label={data.collapsed ? `${data.label} (collapsed)` : data.label}
        description={data.description}
      />
    </div>
  )
}

export default memo(C4BoundaryFlowNode)
