import { memo, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  useInternalNode,
  useReactFlow,
  type EdgeProps,
  type EdgeLabelOptions,
} from '@xyflow/react'
import { NODE_HEIGHT, NODE_WIDTH } from '../autoGridLayout'
import { formatC4EdgeLabel } from '../edgePresentation'
import { Z_EDGE_DETAIL } from '../mapWorkGroupOverlap'
import { fitEdgeLabel } from './edgeLabelFit'
import {
  buildOrthogonalRoute,
  pinRouteToPorts,
  placeCenteredLabel,
  pointsToRoundedPath,
  type OrthogonalRouteResult,
  type RoutePoint,
  type RouteRect,
  type RouteSide,
} from './orthogonalRoute'
import styles from '../FloatingStraightEdge.module.css'

type Props = EdgeProps & EdgeLabelOptions

type EdgeMeta = {
  relationship?: string
  purpose?: string
  technology?: string
  evidence?: string
  detailVisibility?: 'always' | 'hover'
  parallelIndex?: number
  parallelCount?: number
  edgeIndex?: number
  obstacles?: RouteRect[]
  reservedLabels?: RouteRect[]
  foreignWires?: RoutePoint[][]
  sourceSide?: RouteSide
  targetSide?: RouteSide
  sourceAlong?: number
  targetAlong?: number
  /** Precomputed global route (preferred — reserves sibling labels). */
  precomputedRoute?: Pick<
    OrthogonalRouteResult,
    | 'points'
    | 'label'
    | 'path'
    | 'labelRect'
    | 'sourceSide'
    | 'targetSide'
    | 'sourceAlong'
    | 'targetAlong'
  >
}

/**
 * Classic C4 orthogonal multi-bend edge. Labels sit centered on the wire
 * (translate -50%/-50% at the segment mid) and routing lengthens / re-bends
 * to clear nodes and sibling label boxes.
 */
function C4OrthogonalEdge({
  id,
  source,
  target,
  style,
  label,
  markerEnd,
  markerStart,
  interactionWidth,
  data,
}: Props) {
  const { screenToFlowPosition } = useReactFlow()
  const [detailsRevealed, setDetailsRevealed] = useState(false)
  const [cursorFlowPos, setCursorFlowPos] = useState<{ x: number; y: number } | null>(
    null,
  )
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  const metadata = data as EdgeMeta | undefined

  const labelText = useMemo(() => {
    const relationshipLabel =
      (typeof label === 'string' ? label : undefined) ?? metadata?.relationship
    const purposeText = metadata?.purpose
    const intentForC4 =
      (typeof relationshipLabel === 'string' ? relationshipLabel : undefined) ??
      purposeText
    return formatC4EdgeLabel(intentForC4, metadata?.technology)
  }, [label, metadata?.relationship, metadata?.purpose, metadata?.technology])

  const route = useMemo(() => {
    if (!sourceNode || !targetNode) return null

    const sw = sourceNode.measured?.width ?? NODE_WIDTH
    const sh = sourceNode.measured?.height ?? NODE_HEIGHT
    const tw = targetNode.measured?.width ?? NODE_WIDTH
    const th = targetNode.measured?.height ?? NODE_HEIGHT

    const sourceRect: RouteRect = {
      id: source,
      x: sourceNode.internals.positionAbsolute.x,
      y: sourceNode.internals.positionAbsolute.y,
      width: sw,
      height: sh,
    }
    const targetRect: RouteRect = {
      id: target,
      x: targetNode.internals.positionAbsolute.x,
      y: targetNode.internals.positionAbsolute.y,
      width: tw,
      height: th,
    }

    // Prefer canvas-global route, but re-pin ports onto measured node boxes
    // so 0.25/0.5/0.75 stay correct even when layout height ≠ measured height.
    if (metadata?.precomputedRoute?.points?.length) {
      const sourceSide =
        metadata.precomputedRoute.sourceSide ?? metadata.sourceSide ?? 'right'
      const targetSide =
        metadata.precomputedRoute.targetSide ?? metadata.targetSide ?? 'left'
      const sourceAlong =
        metadata.precomputedRoute.sourceAlong ?? metadata.sourceAlong ?? 0.5
      const targetAlong =
        metadata.precomputedRoute.targetAlong ?? metadata.targetAlong ?? 0.5
      const points = pinRouteToPorts(
        metadata.precomputedRoute.points as RoutePoint[],
        sourceRect,
        targetRect,
        sourceSide,
        targetSide,
        sourceAlong,
        targetAlong,
      )
      const approxFit = labelText
        ? fitEdgeLabel(labelText, sourceRect, targetRect, points)
        : null
      const placement = approxFit
        ? placeCenteredLabel(
            points,
            { width: approxFit.boxWidth, height: approxFit.boxHeight },
            [sourceRect, targetRect, ...(metadata.obstacles ?? [])],
            metadata.reservedLabels ?? [],
            `label:${source}->${target}`,
            metadata.foreignWires ?? [],
          )
        : {
            label: metadata.precomputedRoute.label,
            labelRect: metadata.precomputedRoute.labelRect,
          }
      return {
        points,
        label: placement.label,
        labelRect: placement.labelRect,
        path: pointsToRoundedPath(points),
        sourceSide,
        targetSide,
        sourceAlong,
        targetAlong,
      }
    }

    const approxFit = labelText
      ? fitEdgeLabel(labelText, sourceRect, targetRect)
      : null

    return buildOrthogonalRoute({
      source: sourceRect,
      target: targetRect,
      obstacles: metadata?.obstacles ?? [],
      reservedLabels: metadata?.reservedLabels ?? [],
      foreignWires: metadata?.foreignWires ?? [],
      labelBox: approxFit
        ? { width: approxFit.boxWidth, height: approxFit.boxHeight }
        : { width: 96, height: 22 },
      sourceSide: metadata?.sourceSide,
      targetSide: metadata?.targetSide,
      sourceAlong: metadata?.sourceAlong,
      targetAlong: metadata?.targetAlong,
      parallelIndex: metadata?.parallelIndex,
      parallelCount: metadata?.parallelCount,
      edgeIndex: metadata?.edgeIndex,
      clearance: 36,
    })
  }, [
    sourceNode,
    targetNode,
    source,
    target,
    labelText,
    metadata?.obstacles,
    metadata?.reservedLabels,
    metadata?.foreignWires,
    metadata?.parallelIndex,
    metadata?.parallelCount,
    metadata?.edgeIndex,
    metadata?.sourceSide,
    metadata?.targetSide,
    metadata?.sourceAlong,
    metadata?.targetAlong,
    metadata?.precomputedRoute,
  ])

  const labelFit = useMemo(() => {
    if (!sourceNode || !targetNode || !route || !labelText) return null

    const sw = sourceNode.measured?.width ?? NODE_WIDTH
    const sh = sourceNode.measured?.height ?? NODE_HEIGHT
    const tw = targetNode.measured?.width ?? NODE_WIDTH
    const th = targetNode.measured?.height ?? NODE_HEIGHT
    return fitEdgeLabel(
      labelText,
      {
        id: source,
        x: sourceNode.internals.positionAbsolute.x,
        y: sourceNode.internals.positionAbsolute.y,
        width: sw,
        height: sh,
      },
      {
        id: target,
        x: targetNode.internals.positionAbsolute.x,
        y: targetNode.internals.positionAbsolute.y,
        width: tw,
        height: th,
      },
      route.points,
    )
  }, [sourceNode, targetNode, route, labelText, source, target])

  if (!sourceNode || !targetNode || !route) return null

  const relationshipLabel =
    (typeof label === 'string' ? label : undefined) ?? metadata?.relationship
  const purposeText = metadata?.purpose
  const hasHoverableDetails = Boolean(
    relationshipLabel || purposeText || metadata?.technology,
  )

  const showOverlayDetails = Boolean(
    hasHoverableDetails &&
      ((metadata?.detailVisibility === 'hover' && detailsRevealed) ||
        (metadata?.detailVisibility === 'always' && purposeText)),
  )
  const showCompactBaseLabel =
    Boolean(labelFit) &&
    metadata?.detailVisibility !== 'hover' &&
    !(metadata?.detailVisibility === 'always' && purposeText)

  const overlayTitle =
    formatC4EdgeLabel(
      typeof relationshipLabel === 'string' ? relationshipLabel : undefined,
      metadata?.technology,
    ) || labelFit?.text

  const baseOpacity = typeof style?.opacity === 'number' ? style.opacity : 1
  const baseStrokeWidth =
    typeof style?.strokeWidth === 'number' ? style.strokeWidth : 1.8
  const renderedStyle =
    metadata?.detailVisibility === 'hover'
      ? {
          ...style,
          opacity: detailsRevealed ? baseOpacity : baseOpacity * 0.42,
          strokeWidth: detailsRevealed
            ? baseStrokeWidth + 0.55
            : Math.max(1, baseStrokeWidth - 0.3),
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

  const hoverRevealEnabled = metadata?.detailVisibility === 'hover'
  const syncCursorFlowPos = (event: ReactMouseEvent<SVGPathElement>) => {
    setCursorFlowPos(screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  // Center the label box on the edge midline (no vertical lift).
  const labelX = route.label.x
  const labelY = route.label.y

  const detailLabelTransform =
    hoverRevealEnabled && cursorFlowPos
      ? `translate(${cursorFlowPos.x}px, ${cursorFlowPos.y}px)`
      : `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`

  return (
    <>
      {accessibleDescription && <title>{accessibleDescription}</title>}
      <BaseEdge
        id={id}
        path={route.path}
        style={renderedStyle}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={interactionWidth}
      />
      {hasHoverableDetails && (
        <path
          className={styles.interactionPath}
          d={route.path}
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
      {showCompactBaseLabel && labelFit && (
        <EdgeLabelRenderer>
          <div
            className={styles.edgeLabel}
            style={{
              zIndex: Z_EDGE_DETAIL,
              width: labelFit.boxWidth,
              maxWidth: labelFit.availableWidth,
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {labelFit.lines.map((line) => (
              <span key={line} className={styles.edgeLabelLine}>
                {line}
              </span>
            ))}
          </div>
        </EdgeLabelRenderer>
      )}
      {showOverlayDetails && (
        <EdgeLabelRenderer>
          <div
            className={styles.detailLabel}
            style={{
              zIndex: Z_EDGE_DETAIL,
              transform: detailLabelTransform,
              maxWidth: labelFit?.availableWidth ?? 260,
            }}
            aria-label={`${overlayTitle || String(relationshipLabel ?? '')}。${purposeText ?? ''}`}
          >
            {overlayTitle && <strong className={styles.detailLabelWrap}>{overlayTitle}</strong>}
            {purposeText &&
              purposeText !== overlayTitle &&
              purposeText !== relationshipLabel && (
                <span className={styles.detailLabelWrap}>{purposeText}</span>
              )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export default memo(C4OrthogonalEdge)
