import { useEffect, useMemo, useRef, useState, type WheelEvent } from 'react'
import { isConfigNode, type IntentGraph } from '@contracts/index'
import { expectedConfigPort, nodeBoxSize } from './loopWiringVisuals'
import { LoopIntegrationIcon } from './integrations/LoopIntegrationIcon'
import { visualForIntentNode } from './loopNodeVisuals'
import { formatEdgeLabel, routeLoopEdge } from './loopEdgeRouting'
import styles from './LoopGraphCanvasPreview.module.css'

interface Props {
  draft: IntentGraph
  emptyLabel: string
  untitledNodeLabel: string
  edgeLabelPending: string
  wiringProvidesLabel: string
  className?: string
}

type Viewport = { x: number; y: number; scale: number }

function categoryClassName(
  categoryClass: string,
): string {
  switch (categoryClass) {
    case 'catAgent':
      return styles.catAgent
    case 'catAction':
      return styles.catAction
    case 'catLogic':
      return styles.catLogic
    case 'catHuman':
      return styles.catHuman
    case 'catConfig':
      return styles.catConfig
    default:
      return styles.catDraft
  }
}

function fitViewport(
  draft: IntentGraph,
  width: number,
  height: number,
): Viewport {
  if (draft.nodes.length === 0 || width <= 0 || height <= 0) {
    return { x: 24, y: 24, scale: 1 }
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const node of draft.nodes) {
    const size = nodeBoxSize(node)
    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
    maxX = Math.max(maxX, node.position.x + size.width)
    maxY = Math.max(maxY, node.position.y + size.height)
  }

  const pad = 36
  const contentW = Math.max(1, maxX - minX + pad * 2)
  const contentH = Math.max(1, maxY - minY + pad * 2)
  const scale = Math.min(1.15, Math.max(0.45, Math.min(width / contentW, height / contentH)))
  const worldW = contentW * scale
  const worldH = contentH * scale
  return {
    x: (width - worldW) / 2 - (minX - pad) * scale,
    y: (height - worldH) / 2 - (minY - pad) * scale,
    scale,
  }
}

/** Read-only IntentGraph canvas for marketplace / preview surfaces. */
export default function LoopGraphCanvasPreview({
  draft,
  emptyLabel,
  untitledNodeLabel,
  edgeLabelPending,
  wiringProvidesLabel,
  className,
}: Props) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const [viewport, setViewport] = useState<Viewport>({ x: 24, y: 24, scale: 1 })
  const [dragging, setDragging] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const apply = () => {
      const rect = el.getBoundingClientRect()
      setViewport(fitViewport(draft, rect.width, rect.height))
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => observer.disconnect()
  }, [draft])

  const worldWidth = useMemo(
    () =>
      Math.max(
        640,
        ...draft.nodes.map((node) => {
          const size = nodeBoxSize(node)
          return node.position.x + size.width + 80
        }),
      ),
    [draft.nodes],
  )
  const worldHeight = useMemo(
    () =>
      Math.max(
        420,
        ...draft.nodes.map((node) => {
          const size = nodeBoxSize(node)
          return node.position.y + size.height + 80
        }),
      ),
    [draft.nodes],
  )

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const nextScale = Math.min(
      1.6,
      Math.max(0.4, viewport.scale * (event.deltaY > 0 ? 0.92 : 1.08)),
    )
    setViewport((current) => ({ ...current, scale: nextScale }))
  }

  return (
    <div
      ref={canvasRef}
      className={`${styles.canvas} ${dragging ? styles.canvasDragging : ''} ${className ?? ''}`}
      onWheel={onWheel}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        if ((event.target as HTMLElement).closest('[data-loop-preview-node]')) return
        dragRef.current = {
          x: viewport.x,
          y: viewport.y,
          px: event.clientX,
          py: event.clientY,
        }
        setDragging(true)
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (!drag) return
        setViewport((current) => ({
          ...current,
          x: drag.x + event.clientX - drag.px,
          y: drag.y + event.clientY - drag.py,
        }))
      }}
      onPointerUp={() => {
        dragRef.current = null
        setDragging(false)
      }}
    >
      {draft.nodes.length === 0 ? (
        <p className={styles.empty}>{emptyLabel}</p>
      ) : (
        <div
          className={styles.world}
          style={{
            width: worldWidth,
            height: worldHeight,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          }}
        >
          <svg className={styles.edges} width={worldWidth} height={worldHeight}>
            {draft.edges.map((edge) => {
              const source = draft.nodes.find((node) => node.id === edge.source)
              const target = draft.nodes.find((node) => node.id === edge.target)
              if (!source || !target) return null
              const sourceSize = nodeBoxSize(source)
              const targetSize = nodeBoxSize(target)
              const provides = edge.kind === 'provides'
              const routed = routeLoopEdge({
                source,
                target,
                sourcePort: edge.sourcePort ?? (provides ? 'n' : undefined),
                targetPort: edge.targetPort ?? (provides ? 's' : undefined),
                obstacles: draft.nodes,
                width: sourceSize.width,
                height: sourceSize.height,
                targetWidth: targetSize.width,
                targetHeight: targetSize.height,
              })
              const feedback = edge.kind === 'feedback'
              const conditional = edge.kind === 'conditional'
              const label = provides
                ? edge.configPort ??
                  expectedConfigPort(source) ??
                  wiringProvidesLabel
                : formatEdgeLabel(
                    edge.branchKey
                      ? `${edge.branchKey}: ${edge.prompt ?? ''}`
                      : (edge.prompt ?? ''),
                  ) || edgeLabelPending
              return (
                <g key={edge.id}>
                  <path
                    className={`${styles.edge} ${feedback ? styles.edgeFeedback : ''} ${
                      conditional ? styles.edgeConditional : ''
                    } ${provides ? styles.edgeProvides : ''}`}
                    d={routed.d}
                  />
                  {!provides ? (
                    <foreignObject
                      className={styles.edgeLabelForeign}
                      x={routed.mid.x}
                      y={routed.mid.y}
                      width={1}
                      height={1}
                    >
                      <div className={styles.edgeLabelChip} title={label}>
                        {label}
                      </div>
                    </foreignObject>
                  ) : (
                    <text
                      className={styles.edgeProvidesLabel}
                      x={routed.mid.x}
                      y={routed.mid.y + 3}
                      textAnchor="middle"
                    >
                      {label}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
          {draft.nodes.map((node) => {
            const size = nodeBoxSize(node)
            const visual = visualForIntentNode(node)
            const NodeIcon = visual.Icon
            const categoryClass = categoryClassName(visual.categoryClass)
            const configSatellite = isConfigNode(node)
            const selected = selectedNodeId === node.id
            return (
              <div
                key={node.id}
                className={`${styles.node} ${categoryClass} ${
                  configSatellite ? styles.nodeConfig : ''
                } ${selected ? styles.nodeActive : ''}`}
                style={{
                  left: node.position.x,
                  top: node.position.y,
                  width: size.width,
                  minHeight: size.height,
                }}
                data-loop-preview-node={node.id}
                aria-label={`${visual.shortLabel}: ${node.title || untitledNodeLabel}`}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  event.stopPropagation()
                  setSelectedNodeId(node.id)
                }}
              >
                <div className={styles.nodeTop}>
                  <span className={`${styles.nodeIcon} ${categoryClass}`} aria-hidden>
                    {visual.integrationIconKey ? (
                      <LoopIntegrationIcon
                        integrationId={visual.integrationId}
                        iconKey={visual.integrationIconKey}
                        size={15}
                      />
                    ) : (
                      <NodeIcon size={15} strokeWidth={1.75} />
                    )}
                  </span>
                  <span className={styles.nodeTitle}>
                    {node.title || visual.shortLabel}
                    {visual.operationLabel ? (
                      <span className={styles.nodeOpMeta}>{visual.operationLabel}</span>
                    ) : null}
                  </span>
                </div>
                {!configSatellite && node.prompt.trim() ? (
                  <p className={styles.nodePrompt}>{node.prompt}</p>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
