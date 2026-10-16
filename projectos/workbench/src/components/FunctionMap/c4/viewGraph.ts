/**
 * View-graph intermediate layer (c4studio view_graph style).
 * Produces unpositioned diagram elements shared by builders and export.
 */

import type {
  ArchitectureLevel,
  ArchitectureView,
  FileEntry,
  FileRelation,
  FunctionalEdge,
  FunctionalNode,
  ProjectArchitecture,
} from '@contracts/index'
import {
  projectArchitectureView,
  type ArchitectureViewScope,
} from '../architectureView'
import { resolveC4ShapeKind } from './shapeKind'
import type { C4Boundary, C4DiagramEdge, C4DiagramNode, C4ShapeKind } from './types'

export interface ViewGraphInput {
  level: ArchitectureLevel
  nodes: FunctionalNode[]
  edges: FunctionalEdge[]
  architecture?: ProjectArchitecture
  scope?: ArchitectureViewScope
  views?: ArchitectureView[]
  viewKey?: string
  fileIndex?: FileEntry[]
  fileRelations?: FileRelation[]
}

export interface ViewGraph {
  level: ArchitectureLevel
  nodes: C4DiagramNode[]
  edges: C4DiagramEdge[]
  boundaries: C4Boundary[]
  sourceNodes: FunctionalNode[]
  sourceEdges: FunctionalEdge[]
}

function estimateSize(shape: C4ShapeKind): { width: number; height: number } {
  if (shape === 'person') return { width: 160, height: 180 }
  if (shape === 'database') return { width: 180, height: 140 }
  if (shape === 'code') return { width: 200, height: 160 }
  return { width: 220, height: 120 }
}

/**
 * Build an unpositioned view graph. Callers run ELK / seed layout afterward.
 */
export function buildViewGraph(input: ViewGraphInput): ViewGraph {
  const projected = projectArchitectureView(
    input.nodes,
    input.edges,
    input.level,
    input.scope ?? {},
    input.fileIndex ?? [],
    input.fileRelations ?? [],
    {
      views: input.views,
      viewKey: input.viewKey,
    },
  )

  const parentId = input.scope?.parentId
  const parent = parentId
    ? input.nodes.find((node) => node.id === parentId)
    : undefined

  const diagramNodes: C4DiagramNode[] = projected.nodes.map((node) => {
    const shape = resolveC4ShapeKind(node)
    const size = estimateSize(shape)
    return {
      id: node.id,
      shape,
      label: node.name,
      description: node.summary || node.description,
      technology: node.technology,
      elementType: node.elementType,
      level: node.level,
      sourceNodeId: node.id,
      position: { x: 0, y: 0 },
      width: size.width,
      height: size.height,
      members: node.refs?.slice(0, 12),
    }
  })

  const diagramEdges: C4DiagramEdge[] = projected.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    technology: edge.technology,
    relation: edge.relation,
    purpose: edge.purpose,
    confidence: edge.confidence,
  }))

  const boundaries: C4Boundary[] = []
  if (
    parent &&
    (input.level === 'container' ||
      input.level === 'component' ||
      input.level === 'code')
  ) {
    boundaries.push({
      id: `boundary_${parent.id}`,
      label: parent.name,
      description: parent.summary,
      position: { x: 0, y: 0 },
      width: 400,
      height: 300,
    })
  }

  return {
    level: input.level,
    nodes: diagramNodes,
    edges: diagramEdges,
    boundaries,
    sourceNodes: projected.nodes,
    sourceEdges: projected.edges,
  }
}
