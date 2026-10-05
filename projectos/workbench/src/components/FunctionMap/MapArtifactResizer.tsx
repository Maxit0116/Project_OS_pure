import { NodeResizeControl, ResizeControlVariant } from '@xyflow/react'
import styles from './mapArtifactNodes.module.css'
import {
  useMapArtifactPointerResize,
  type ArtifactResizeEdge,
  type MapArtifactResizeEndParams,
} from './useMapArtifactPointerResize'

interface Props {
  /** React Flow node id — stack cards use `stack_*`, solo cards use `art_*`. */
  flowNodeId: string
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
  onResizeStart?: () => void
  onResize?: (params: MapArtifactResizeEndParams) => void
  onResizeEnd?: (params: MapArtifactResizeEndParams) => void
}

const EDGE_CONFIG: { edge: ArtifactResizeEdge; className: string }[] = [
  { edge: 'west', className: styles.edgeWest },
  { edge: 'east', className: styles.edgeEast },
  { edge: 'north', className: styles.edgeNorth },
  { edge: 'south', className: styles.edgeSouth },
]

function MapArtifactEdgeHandle({
  flowNodeId,
  edge,
  className,
  minWidth,
  minHeight,
  maxWidth,
  maxHeight,
  onResizeStart,
  onResize,
  onResizeEnd,
}: Props & { edge: ArtifactResizeEdge; className: string }) {
  const { onPointerDown } = useMapArtifactPointerResize({
    nodeId: flowNodeId,
    edge,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    onResizeStart,
    onResize,
    onResizeEnd,
  })

  return (
    <div
      role="separator"
      aria-orientation={edge === 'north' || edge === 'south' ? 'horizontal' : 'vertical'}
      className={`${styles.edgeHandle} ${className} nodrag nopan`}
      onPointerDown={onPointerDown}
    />
  )
}

export default function MapArtifactResizer({
  flowNodeId,
  minWidth,
  minHeight,
  maxWidth,
  maxHeight,
  onResizeStart,
  onResize,
  onResizeEnd,
}: Props) {
  const cornerOnResizeStart = onResizeStart ? () => onResizeStart() : undefined
  const cornerOnResize = onResize
    ? (_event: unknown, params: MapArtifactResizeEndParams) => onResize(params)
    : undefined
  const cornerOnResizeEnd = onResizeEnd
    ? (_event: unknown, params: MapArtifactResizeEndParams) => onResizeEnd(params)
    : undefined

  const cornerShared = {
    nodeId: flowNodeId,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    onResizeStart: cornerOnResizeStart,
    onResize: cornerOnResize,
    onResizeEnd: cornerOnResizeEnd,
    autoScale: true,
    keepAspectRatio: true,
  }

  const cornerClass = (corner: string) => `${corner} nodrag nopan`

  return (
    <>
      {EDGE_CONFIG.map(({ edge, className }) => (
        <MapArtifactEdgeHandle
          key={edge}
          flowNodeId={flowNodeId}
          edge={edge}
          className={className}
          minWidth={minWidth}
          minHeight={minHeight}
          maxWidth={maxWidth}
          maxHeight={maxHeight}
          onResizeStart={onResizeStart}
          onResize={onResize}
          onResizeEnd={onResizeEnd}
        />
      ))}

      <NodeResizeControl
        position="top-left"
        variant={ResizeControlVariant.Handle}
        className={cornerClass(styles.cornerNW)}
        {...cornerShared}
      />
      <NodeResizeControl
        position="top-right"
        variant={ResizeControlVariant.Handle}
        className={cornerClass(styles.cornerNE)}
        {...cornerShared}
      />
      <NodeResizeControl
        position="bottom-left"
        variant={ResizeControlVariant.Handle}
        className={cornerClass(styles.cornerSW)}
        {...cornerShared}
      />
      <NodeResizeControl
        position="bottom-right"
        variant={ResizeControlVariant.Handle}
        className={cornerClass(styles.cornerSE)}
        {...cornerShared}
      />
    </>
  )
}
