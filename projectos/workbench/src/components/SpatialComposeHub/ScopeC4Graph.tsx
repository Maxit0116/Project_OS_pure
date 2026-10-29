import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type OnNodesChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { FunctionalEdge } from '@contracts/index'
import C4BoundaryFlowNode from '../FunctionMap/c4/C4BoundaryFlowNode'
import C4FlowNode, { type C4FlowNodeData } from '../FunctionMap/c4/C4FlowNode'
import C4OrthogonalEdge from '../FunctionMap/c4/C4OrthogonalEdge'
import {
  fitBoundaryToMembers,
  snapshotBoundaryMembers,
} from '../FunctionMap/c4/boundaryFit'
import { fitEdgeLabel } from '../FunctionMap/c4/edgeLabelFit'
import { layoutFromC4Diagram } from '../FunctionMap/c4/layoutFromC4Diagram'
import {
  routeAllOrthogonalEdges,
  type RouteRect,
  type RoutedEdgeSpec,
} from '../FunctionMap/c4/orthogonalRoute'
import type { C4Diagram } from '../FunctionMap/c4/types'
import { EDGE_COLORS, formatC4EdgeLabel } from '../FunctionMap/edgePresentation'
import styles from './hubMotion.module.css'

const Z_BOUNDARY = 1
const Z_SHAPE = 2

const nodeTypes = {
  c4Shape: C4FlowNode,
  c4Boundary: C4BoundaryFlowNode,
}

const edgeTypes = {
  c4Orthogonal: C4OrthogonalEdge,
}

function parallelEdgeIndex(
  edges: Array<{ id: string; source: string; target: string }>,
  edgeId: string,
  source: string,
  target: string,
): { parallelIndex: number; parallelCount: number } {
  const key = (a: string, b: string) => (a < b ? `${a}::${b}` : `${b}::${a}`)
  const pair = key(source, target)
  const siblings = edges.filter((edge) => key(edge.source, edge.target) === pair)
  const parallelIndex = Math.max(
    0,
    siblings.findIndex((edge) => edge.id === edgeId),
  )
  return { parallelIndex, parallelCount: Math.max(1, siblings.length) }
}

function toDisplayEdges(diagram: C4Diagram): FunctionalEdge[] {
  return diagram.edges
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      relation: edge.relation as FunctionalEdge['relation'],
      label: edge.label,
      purpose: edge.purpose,
      technology: edge.technology,
      confidence: edge.confidence ?? 1,
      evidence: undefined,
    }))
    .filter((edge) => edge.source !== edge.target)
}

function buildShapeNodes(
  diagram: C4Diagram,
  selectedNodeIds: ReadonlySet<string>,
): Node[] {
  return diagram.nodes.map((c4Node) => ({
    id: c4Node.sourceNodeId,
    type: 'c4Shape',
    position: { ...c4Node.position },
    draggable: true,
    zIndex: Z_SHAPE,
    width: c4Node.width,
    height: c4Node.height,
    initialWidth: c4Node.width,
    initialHeight: c4Node.height,
    measured: { width: c4Node.width, height: c4Node.height },
    style: { width: c4Node.width, height: c4Node.height },
    data: {
      shape: c4Node.shape,
      label: c4Node.label,
      description: c4Node.description,
      technology: c4Node.technology,
      stereotype: c4Node.stereotype,
      members: c4Node.members,
      selected: selectedNodeIds.has(c4Node.sourceNodeId),
      dimmed: false,
    } satisfies C4FlowNodeData,
  }))
}

function buildBoundaryNodes(
  diagram: C4Diagram,
  shapeNodes: Node[],
): Node[] {
  const membership = snapshotBoundaryMembers(diagram.boundaries, diagram.nodes)
  const byId = new Map(shapeNodes.map((node) => [node.id, node]))
  return diagram.boundaries.map((boundary) => {
    const memberIds = membership[boundary.id] ?? []
    const members = memberIds.flatMap((id) => {
      const node = byId.get(id)
      if (!node) return []
      const width =
        typeof node.width === 'number'
          ? node.width
          : Number((node.style as { width?: number } | undefined)?.width) || 200
      const height =
        typeof node.height === 'number'
          ? node.height
          : Number((node.style as { height?: number } | undefined)?.height) ||
            100
      return [
        {
          x: node.position.x,
          y: node.position.y,
          width,
          height,
        },
      ]
    })
    const fitted = fitBoundaryToMembers(boundary, members)
    return {
      id: boundary.id,
      type: 'c4Boundary',
      position: fitted.position,
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: Z_BOUNDARY,
      width: fitted.width,
      height: fitted.height,
      initialWidth: fitted.width,
      initialHeight: fitted.height,
      measured: { width: fitted.width, height: fitted.height },
      style: {
        width: fitted.width,
        height: fitted.height,
        pointerEvents: 'none' as const,
      },
      data: {
        label: boundary.label,
        description: boundary.description,
      },
    }
  })
}

function buildFlowEdges(
  displayEdges: FunctionalEdge[],
  shapeNodes: Node[],
): Edge[] {
  const obstacles: RouteRect[] = shapeNodes.map((node) => {
    const data = node.data as unknown as C4FlowNodeData
    const width =
      typeof node.width === 'number'
        ? node.width
        : Number((node.style as { width?: number } | undefined)?.width) || 200
    const height =
      typeof node.height === 'number'
        ? node.height
        : Number((node.style as { height?: number } | undefined)?.height) || 100
    return {
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      width,
      height,
      shape: data.shape,
    }
  })
  const obstacleById = new Map(obstacles.map((rect) => [rect.id, rect]))
  const denseC4 = displayEdges.length > 8
  const edgeSpecs: RoutedEdgeSpec[] = displayEdges.map((edge) => {
    const source = obstacleById.get(edge.source)
    const target = obstacleById.get(edge.target)
    const compactLabel = formatC4EdgeLabel(
      edge.label,
      edge.technology,
      edge.relation,
      undefined,
      denseC4 ? 'tech' : 'full',
    )
    const fit =
      compactLabel && source && target
        ? fitEdgeLabel(compactLabel, source, target)
        : null
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      labelText: compactLabel || undefined,
      labelBox: fit
        ? { width: fit.boxWidth, height: fit.boxHeight }
        : { width: 96, height: 22 },
    }
  })
  const routes = routeAllOrthogonalEdges({
    nodes: obstacles,
    edges: edgeSpecs,
    clearance: 36,
  })

  return displayEdges.map((edge, edgeIndex) => {
    const color = EDGE_COLORS[edge.relation] ?? 'var(--color-text-muted)'
    const parallel = parallelEdgeIndex(
      displayEdges,
      edge.id,
      edge.source,
      edge.target,
    )
    const compactLabel = formatC4EdgeLabel(
      edge.label,
      edge.technology,
      edge.relation,
      undefined,
      denseC4 ? 'tech' : 'full',
    )
    const precomputed = routes.get(edge.id)
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'c4Orthogonal' as const,
      animated: false,
      data: {
        purpose: edge.purpose,
        detailVisibility: denseC4 ? ('hover' as const) : ('always' as const),
        technology: edge.technology,
        relationship: edge.label ?? compactLabel,
        parallelIndex: parallel.parallelIndex,
        parallelCount: parallel.parallelCount,
        edgeIndex,
        obstacles,
        ...(precomputed
          ? {
              sourceSide: precomputed.sourceSide,
              targetSide: precomputed.targetSide,
              sourceAlong: precomputed.sourceAlong,
              targetAlong: precomputed.targetAlong,
              precomputedRoute: {
                points: precomputed.points,
                label: precomputed.label,
                path: precomputed.path,
                labelRect: precomputed.labelRect,
                sourceSide: precomputed.sourceSide,
                targetSide: precomputed.targetSide,
                sourceAlong: precomputed.sourceAlong,
                targetAlong: precomputed.targetAlong,
              },
            }
          : {}),
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color,
      },
      style: {
        stroke: color,
        strokeWidth: 1.8,
        strokeDasharray:
          edge.relation === 'depends_on' || edge.confidence < 0.8
            ? '6 4'
            : undefined,
      },
      labelStyle: { fill: 'var(--color-text-secondary)', fontSize: 11 },
    }
  })
}

function mergeFlowGraph(
  diagram: C4Diagram,
  selectedNodeIds: ReadonlySet<string>,
  previousShapes?: Node[],
): { nodes: Node[]; edges: Edge[] } {
  const baseShapes = buildShapeNodes(diagram, selectedNodeIds)
  const shapes =
    previousShapes && previousShapes.length > 0
      ? baseShapes.map((node) => {
          const prev = previousShapes.find((item) => item.id === node.id)
          if (!prev) return node
          return {
            ...node,
            position: prev.position,
            selected: prev.selected,
          }
        })
      : baseShapes
  const boundaries = buildBoundaryNodes(diagram, shapes)
  const displayEdges = toDisplayEdges(diagram)
  return {
    nodes: [...boundaries, ...shapes],
    edges: buildFlowEdges(displayEdges, shapes),
  }
}

interface ScopeC4GraphCanvasProps {
  diagram: C4Diagram
  selectedNodeIds: ReadonlySet<string>
  onToggleNode: (nodeId: string) => void
  onDrillNode?: (nodeId: string) => void
  canDrillNode?: (nodeId: string) => boolean
}

function ScopeC4GraphCanvas({
  diagram,
  selectedNodeIds,
  onToggleNode,
  onDrillNode,
  canDrillNode,
}: ScopeC4GraphCanvasProps) {
  const diagramKey = useMemo(() => {
    const posSig = diagram.nodes
      .map(
        (node) =>
          `${node.id}@${Math.round(node.position.x)},${Math.round(node.position.y)}`,
      )
      .join('|')
    return `${diagram.level}:${diagram.bounds.width}x${diagram.bounds.height}:${posSig}`
  }, [diagram])
  const initial = useMemo(
    () => mergeFlowGraph(diagram, selectedNodeIds),
    // Only seed when the diagram structure changes; selection updates separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [diagramKey],
  )
  const [nodes, setNodes, onNodesChangeBase] = useNodesState(initial.nodes)
  const [edges, setEdges] = useEdgesState(initial.edges)
  const { getNodes, setViewport } = useReactFlow()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const dragMovedRef = useRef(false)
  const clickTimerRef = useRef<number | null>(null)
  const diagramRef = useRef(diagram)
  diagramRef.current = diagram
  const selectedRef = useRef(selectedNodeIds)
  selectedRef.current = selectedNodeIds
  const pendingFitRef = useRef(false)

  const syncDecorationsFromShapes = useCallback(() => {
    const shapeNodes = getNodes().filter((node) => node.type === 'c4Shape')
    const active = diagramRef.current
    const boundaries = buildBoundaryNodes(active, shapeNodes)
    setNodes((current) => {
      const nextShapes = current.filter((node) => node.type === 'c4Shape')
      return [...boundaries, ...nextShapes]
    })
    setEdges(buildFlowEdges(toDisplayEdges(active), shapeNodes))
  }, [getNodes, setEdges, setNodes])

  const fitGraphToHost = useCallback(() => {
    const host = hostRef.current
    if (!host) return
    const sw = host.clientWidth
    const sh = host.clientHeight
    if (sw < 40 || sh < 40) return
    // Same camera math as Function Map: scale the ELK-laid-out C4 into the safe rect.
    const layout = layoutFromC4Diagram(diagramRef.current, {
      sx: 0,
      sy: 0,
      sw,
      sh,
    })
    void setViewport(layout.viewport, { duration: 0 })
  }, [setViewport])

  // Reset graph when level / parent scope changes — once, no fitView feedback loop.
  useEffect(() => {
    const next = mergeFlowGraph(diagram, selectedRef.current)
    setNodes(next.nodes)
    setEdges(next.edges)
    pendingFitRef.current = true
    const frame = window.requestAnimationFrame(() => {
      if (pendingFitRef.current) {
        pendingFitRef.current = false
        fitGraphToHost()
      }
    })
    return () => window.cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramKey, fitGraphToHost, setNodes, setEdges])

  // Host size can be 0 on first paint (flex modal); refit when it becomes real.
  useEffect(() => {
    const host = hostRef.current
    if (!host || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      fitGraphToHost()
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [fitGraphToHost])

  // Selection highlight only — do not rebuild layout/edges.
  useEffect(() => {
    setNodes((current) => {
      let changed = false
      const next = current.map((node) => {
        if (node.type !== 'c4Shape') return node
        const selected = selectedNodeIds.has(node.id)
        const data = node.data as unknown as C4FlowNodeData
        if (data.selected === selected) return node
        changed = true
        return {
          ...node,
          data: { ...data, selected },
        }
      })
      return changed ? next : current
    })
  }, [selectedNodeIds, setNodes])

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      const moved = changes.some(
        (change) =>
          change.type === 'position' &&
          change.dragging === true &&
          change.position != null,
      )
      if (moved) dragMovedRef.current = true
      onNodesChangeBase(changes)
    },
    [onNodesChangeBase],
  )

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (node.type !== 'c4Shape') return
      if (dragMovedRef.current) {
        dragMovedRef.current = false
        return
      }
      if (clickTimerRef.current != null) {
        window.clearTimeout(clickTimerRef.current)
      }
      clickTimerRef.current = window.setTimeout(() => {
        clickTimerRef.current = null
        onToggleNode(node.id)
      }, 220)
    },
    [onToggleNode],
  )

  const handleNodeDoubleClick: NodeMouseHandler = useCallback(
    (event, node) => {
      event.preventDefault()
      if (node.type !== 'c4Shape') return
      if (clickTimerRef.current != null) {
        window.clearTimeout(clickTimerRef.current)
        clickTimerRef.current = null
      }
      if (canDrillNode && !canDrillNode(node.id)) return
      onDrillNode?.(node.id)
    },
    [canDrillNode, onDrillNode],
  )

  useEffect(() => {
    return () => {
      if (clickTimerRef.current != null) {
        window.clearTimeout(clickTimerRef.current)
      }
    }
  }, [])

  return (
    <div ref={hostRef} className={styles.scopeMapFlowHost}>
      <ReactFlow
        className={styles.scopeMapFlow}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeDragStart={() => {
          dragMovedRef.current = false
        }}
        onNodeDrag={() => {
          dragMovedRef.current = true
        }}
        onNodeDragStop={() => {
          syncDecorationsFromShapes()
        }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        panOnScroll
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        minZoom={0.12}
        maxZoom={2.2}
        elevateNodesOnSelect={false}
        edgesFocusable={false}
        zIndexMode="manual"
        proOptions={{ hideAttribution: true }}
        style={{ background: 'transparent', width: '100%', height: '100%' }}
      >
        <Background gap={22} size={1} color="rgba(255,255,255,0.04)" />
        <Controls
          showInteractive={false}
          position="bottom-right"
          onFitView={() => fitGraphToHost()}
        />
      </ReactFlow>
    </div>
  )
}

export interface ScopeC4GraphProps {
  diagram: C4Diagram
  selectedNodeIds: ReadonlySet<string>
  onToggleNode: (nodeId: string) => void
  onDrillNode?: (nodeId: string) => void
  canDrillNode?: (nodeId: string) => boolean
}

/** Function-Map-parity C4 React Flow surface for the Scope Map picker. */
export default function ScopeC4Graph(props: ScopeC4GraphProps) {
  return (
    <ReactFlowProvider>
      <ScopeC4GraphCanvas {...props} />
    </ReactFlowProvider>
  )
}
