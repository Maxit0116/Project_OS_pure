import { useWorkbenchStore } from '../../state/workbenchStore'
import { usePointerResize, type ResizeEdge } from '../../hooks/usePointerResize'
import { applyPanelResizeArrowKey } from './panelResizeKeyboard'
import styles from './PanelResizeHandle.module.css'

interface Props {
  edge: ResizeEdge
  onDelta: (delta: number) => number | void
  value: number
  min: number
  max: number
  ariaLabel: string
  disabled?: boolean
}

const EDGE_CLASS: Record<ResizeEdge, string> = {
  east: styles.edgeEast,
  west: styles.edgeWest,
  north: styles.edgeNorth,
  south: styles.edgeSouth,
}

export default function PanelResizeHandle({
  edge,
  onDelta,
  value,
  min,
  max,
  ariaLabel,
  disabled,
}: Props) {
  const setPanelResizing = useWorkbenchStore((s) => s.setPanelResizing)
  const effectiveMax = Math.max(min, max)

  const { onPointerDown } = usePointerResize({
    edge,
    onDelta,
    value,
    min,
    max: effectiveMax,
    disabled,
    onResizeStart: () => setPanelResizing(true),
    onResizeEnd: () => setPanelResizing(false),
  })

  if (disabled) return null

  const horizontal = edge === 'north' || edge === 'south'

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={horizontal ? 'horizontal' : 'vertical'}
      aria-label={ariaLabel}
      aria-valuenow={Math.round(value)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(effectiveMax)}
      data-panel-resize-handle
      className={`${styles.handle} ${EDGE_CLASS[edge]}`}
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        applyPanelResizeArrowKey(event, edge, onDelta)
      }}
    />
  )
}
