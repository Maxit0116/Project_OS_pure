import { memo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  useInternalNode,
  useReactFlow,
  type EdgeProps,
  type EdgeLabelOptions,
} from '@xyflow/react'
import { NODE_HEIGHT, NODE_WIDTH } from './autoGridLayout'
import { rectAttachment } from './crossMinLayout'
import { formatC4EdgeLabel } from './edgePresentation'
import { Z_EDGE_DETAIL } from './mapWorkGroupOverlap'
import styles from './FloatingStraightEdge.module.css'

type FloatingStraightEdgeProps = EdgeProps & EdgeLabelOptions

/**
 * Straight edge that attaches to each node on its axis-aligned card border
 * so connections meet feature cards flush (no ellipse inset gaps).
 */
function FloatingStraightEdge({
  id,
  source,
  target,
  style,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  markerEnd,
  markerStart,
  interactionWidth,
  data,
}: FloatingStraightEdgeProps) {
  const { screenToFlowPosition } = useReactFlow()
  const [detailsRevealed, setDetailsRevealed] = useState(false)
  const [cursorFlowPos, setCursorFlowPos] = useState<{ x: number; y: number } | null>(null)
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  if (!sourceNode || !targetNode) return null

  const sw = sourceNode.measured?.width ?? NODE_WIDTH
  const sh = sourceNode.measured?.height ?? NODE_HEIGHT
  const tw = targetNode.measured?.width ?? NODE_WIDTH
  const th = targetNode.measured?.height ?? NODE_HEIGHT

  const scx = sourceNode.internals.positionAbsolute.x + sw / 2
  const scy = sourceNode.internals.positionAbsolute.y + sh / 2
  const tcx = targetNode.internals.positionAbsolute.x + tw / 2
  const tcy = targetNode.internals.positionAbsolute.y + th / 2

  const start = rectAttachment(scx, scy, sw / 2, sh / 2, tcx, tcy)
  const end = rectAttachment(tcx, tcy, tw / 2, th / 2, scx, scy)

  const metadata = data as
    | {
        relationship?: string
        purpose?: string
        technology?: string
        evidence?: string
        detailVisibility?: 'always' | 'hover'
      }
    | undefined

  const relationshipLabel =
    (typeof label === 'string' ? label : undefined) ?? metadata?.relationship
  const purposeText = metadata?.purpose
  const intentForC4 =
    (typeof relationshipLabel === 'string' ? relationshipLabel : undefined) ??
    purposeText
  const c4CompactLabel = formatC4EdgeLabel(intentForC4, metadata?.technology)
  const hasHoverableDetails = Boolean(
    relationshipLabel || purposeText || metadata?.technology,
  )

  const [path, labelX, labelY] = getStraightPath({
    sourceX: start.x,
    sourceY: start.y,
    targetX: end.x,
    targetY: end.y,
  })

  const showOverlayDetails = Boolean(
    hasHoverableDetails &&
    (
      (metadata?.detailVisibility === 'hover' && detailsRevealed) ||
      (metadata?.detailVisibility === 'always' && purposeText)
    ),
  )
  // Compact C4 text on the edge; hide only when the always-visible purpose
  // overlay would duplicate the same string.
  const showCompactBaseLabel =
    Boolean(c4CompactLabel) &&
    !(metadata?.detailVisibility === 'always' && purposeText)
  const overlayTitle =
    formatC4EdgeLabel(
      typeof relationshipLabel === 'string' ? relationshipLabel : undefined,
      metadata?.technology,
    ) || c4CompactLabel
  const baseOpacity = typeof style?.opacity === 'number' ? style.opacity : 1
  const baseStrokeWidth = typeof style?.strokeWidth === 'number' ? style.strokeWidth : 1.8
  const renderedStyle = metadata?.detailVisibility === 'hover'
    ? {
        ...style,
        opacity: detailsRevealed ? baseOpacity : baseOpacity * 0.38,
        strokeWidth: detailsRevealed
          ? baseStrokeWidth + 0.55
          : Math.max(1, baseStrokeWidth - 0.4),
      }
    : style
  const accessibleDescription = [
    metadata?.relationship,
    metadata?.purpose,
    metadata?.technology,
    metadata?.evidence,
  ]
    .filter(Boolean)
    .join(' · ')

  const interactionPathRendered = hasHoverableDetails
  const hoverRevealEnabled = metadata?.detailVisibility === 'hover'

  const syncCursorFlowPos = (event: ReactMouseEvent<SVGPathElement>) => {
    setCursorFlowPos(screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  const detailLabelTransform =
    hoverRevealEnabled && cursorFlowPos
      ? `translate(${cursorFlowPos.x}px, ${cursorFlowPos.y}px)`
      : `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`

  return (
    <>
      {accessibleDescription && <title>{accessibleDescription}</title>}
      <BaseEdge
        id={id}
        path={path}
        labelX={labelX}
        labelY={labelY}
        label={showCompactBaseLabel ? c4CompactLabel : undefined}
        labelStyle={labelStyle}
        labelShowBg={labelShowBg}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
        style={renderedStyle}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={interactionWidth}
      />
      {interactionPathRendered && (
        <path
          className={styles.interactionPath}
          d={path}
          aria-hidden="true"
          onMouseEnter={
            hoverRevealEnabled
              ? (event) => {
                  setDetailsRevealed(true)
                  syncCursorFlowPos(event)
                }
              : undefined
          }
          onMouseMove={hoverRevealEnabled ? syncCursorFlowPos : undefined}
          onMouseLeave={
            hoverRevealEnabled
              ? () => {
                  setDetailsRevealed(false)
                  setCursorFlowPos(null)
                }
              : undefined
          }
        />
      )}
      {showOverlayDetails && (
        <EdgeLabelRenderer>
          <div
            className={styles.detailLabel}
            style={{
              zIndex: Z_EDGE_DETAIL,
              transform: detailLabelTransform,
            }}
            aria-label={`${overlayTitle || String(relationshipLabel ?? '')}。${purposeText ?? ''}`}
          >
            {overlayTitle && <strong>{overlayTitle}</strong>}
            {purposeText &&
              purposeText !== overlayTitle &&
              purposeText !== relationshipLabel && <span>{purposeText}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export default memo(FloatingStraightEdge)
