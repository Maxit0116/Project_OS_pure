import type { FileEntry, FunctionalNode } from '@contracts/index'
import {
  codeElementStereotype,
  projectArchitectureView,
} from '../../architectureView'
import { codeNodeFilePath } from '../../codeNodeInteraction'
import { nodeCardBlurb } from '../../nodeCopy'
import {
  computeBounds,
  emptyBounds,
  filterEdgesAmong,
  toC4Edge,
  toC4Node,
} from '../diagramShared'
import type { C4Boundary, C4Diagram, C4DiagramInput, C4DiagramNode } from '../types'
import { layoutCodeNodesByImports } from './layoutCodeNodes'

const BOUNDARY_PAD = 56
const INNER_PAD_X = 48
const INNER_PAD_TOP = 72
const INNER_PAD_BOTTOM = 48
const MEMBER_LINE = 14
const BASE_CODE_HEIGHT = 88
const MAX_MEMBERS = 6

/**
 * Classic C4 Code / internal-file diagram for one component:
 * dashed component boundary + class/module-like file boxes with
 * stereotype and exported symbols (methods), wired by imports.
 * @see https://c4model.com/diagrams/code
 */
export function buildCodeDiagram(input: C4DiagramInput): C4Diagram {
  const parentId = input.scope?.parentId
  const component = parentId
    ? input.nodes.find((n) => n.id === parentId && n.level === 'component')
    : undefined

  const projected = projectArchitectureView(
    input.nodes,
    input.edges,
    'code',
    input.scope ?? {},
    input.fileIndex ?? [],
    input.fileRelations ?? [],
  )

  if (projected.nodes.length === 0) {
    return {
      level: 'code',
      nodes: [],
      edges: [],
      boundaries: [],
      bounds: emptyBounds(),
    }
  }

  const filesByPath = new Map(
    (input.fileIndex ?? []).map((file) => [file.path, file]),
  )

  const sized = projected.nodes.map((node) => {
    const path = codeNodeFilePath(node)
    const file = filesByPath.get(path)
    const members = codeMembers(file)
    const width = 220
    const height = BASE_CODE_HEIGHT + Math.min(members.length, MAX_MEMBERS) * MEMBER_LINE
    const base = toC4Node(node, { x: 0, y: 0 })
    return {
      node,
      base: { ...base, width, height },
      path,
      file,
      members,
    }
  })

  const positions = layoutCodeNodesByImports(
    sized.map(({ node, base, path }) => ({
      id: node.id,
      width: base.width,
      height: base.height,
      sortKey: path,
    })),
    projected.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    })),
    {
      startX: BOUNDARY_PAD + INNER_PAD_X,
      startY: BOUNDARY_PAD + INNER_PAD_TOP,
    },
  )

  const placed: C4DiagramNode[] = sized.map(({ node, base, path, file, members }) => {
    const position = positions.get(node.id) ?? {
      x: BOUNDARY_PAD + INNER_PAD_X,
      y: BOUNDARY_PAD + INNER_PAD_TOP,
    }
    return toCodeDiagramNode(node, base, position, path, file, members)
  })

  let contentMaxX = BOUNDARY_PAD + INNER_PAD_X
  let contentMaxY = BOUNDARY_PAD + INNER_PAD_TOP
  for (const node of placed) {
    contentMaxX = Math.max(contentMaxX, node.position.x + node.width)
    contentMaxY = Math.max(contentMaxY, node.position.y + node.height)
  }

  const boundary: C4Boundary | null = component
    ? {
        id: `boundary_${component.id}`,
        label: component.name,
        description: component.technology
          ? `[Component: ${component.technology}]`
          : '[Component]',
        position: { x: BOUNDARY_PAD, y: BOUNDARY_PAD },
        width: Math.max(420, contentMaxX - BOUNDARY_PAD + INNER_PAD_X),
        height: Math.max(
          240,
          contentMaxY - BOUNDARY_PAD + INNER_PAD_BOTTOM,
        ),
      }
    : null

  const ids = new Set(placed.map((n) => n.id))
  const edges = filterEdgesAmong(projected.edges, ids).map(toC4Edge)
  const boundsItems = [
    ...placed,
    ...(boundary
      ? [
          {
            position: boundary.position,
            width: boundary.width,
            height: boundary.height,
          },
        ]
      : []),
  ]

  return {
    level: 'code',
    nodes: placed,
    edges,
    boundaries: boundary ? [boundary] : [],
    bounds: computeBounds(boundsItems),
  }
}

function codeMembers(file: FileEntry | undefined): string[] {
  if (!file) return []
  const named = file.exports.filter((name) => name && name !== 'default')
  if (named.length > 0) return named.slice(0, MAX_MEMBERS)
  if (file.exports.includes('default')) return ['default']
  return []
}

function toCodeDiagramNode(
  node: FunctionalNode,
  base: C4DiagramNode,
  position: { x: number; y: number },
  path: string,
  file: FileEntry | undefined,
  members: string[],
): C4DiagramNode {
  const basename = path.split('/').pop() ?? node.name
  const stereotype = codeElementStereotype(file, path)
  const blurb = nodeCardBlurb(node)

  return {
    ...base,
    shape: 'code',
    // Classic code diagrams title the type/file; the short summary sits below.
    label: basename,
    description: blurb && blurb !== basename ? blurb : path,
    technology: node.technology,
    stereotype,
    members,
    position,
    width: base.width,
    height: base.height,
  }
}
