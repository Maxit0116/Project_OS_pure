import type {
  FileEntry,
  FileEntryType,
  FileRelation,
  FunctionalEdge,
  FunctionalNode,
  ProjectGraph,
} from '@contracts/index'
import { impactStructureGraph } from '../../../../services/structure-graph-impact.js'
import { codeElementStereotype } from './architectureView'
import { codeNodeFilePath, isCodeElementNode } from './codeNodeInteraction'

export type ChangeRiskLevel = 'low' | 'medium' | 'high'

export interface NeighborRef {
  id: string
  label: string
}

export interface CodeFileUnderstanding {
  isCodeNode: boolean
  filePath: string | null
  fileType: FileEntryType | null
  stereotype: string | null
  usedBy: NeighborRef[]
  dependsOn: NeighborRef[]
  changeRisk: ChangeRiskLevel
  impactDependentCount: number
  impactDependencyCount: number
  impactViews: string[]
}

function basename(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

export function neighborDisplayLabel(
  node: FunctionalNode | undefined,
  fallbackId: string,
): string {
  if (!node) return basename(fallbackId)
  return (
    node.responsibility?.trim() ||
    node.summary?.trim() ||
    node.name?.trim() ||
    basename(codeNodeFilePath(node) || fallbackId)
  )
}

export function changeRiskFromDependentCount(count: number): ChangeRiskLevel {
  if (count >= 5) return 'high'
  if (count >= 2) return 'medium'
  return 'low'
}

function uniqueNeighbors(items: NeighborRef[]): NeighborRef[] {
  const seen = new Set<string>()
  const result: NeighborRef[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    result.push(item)
  }
  return result
}

function neighborsFromEdges(
  nodeId: string,
  edges: FunctionalEdge[],
  nodesById: Map<string, FunctionalNode>,
  direction: 'usedBy' | 'dependsOn',
): NeighborRef[] {
  const refs: NeighborRef[] = []
  for (const edge of edges) {
    if (direction === 'usedBy' && edge.target === nodeId) {
      refs.push({
        id: edge.source,
        label: neighborDisplayLabel(nodesById.get(edge.source), edge.source),
      })
    }
    if (direction === 'dependsOn' && edge.source === nodeId) {
      refs.push({
        id: edge.target,
        label: neighborDisplayLabel(nodesById.get(edge.target), edge.target),
      })
    }
  }
  return uniqueNeighbors(refs)
}

function neighborsFromFileRelations(
  filePath: string,
  fileRelations: FileRelation[],
  fileIndex: FileEntry[],
  direction: 'usedBy' | 'dependsOn',
): NeighborRef[] {
  const refs: NeighborRef[] = []
  for (const relation of fileRelations) {
    if (direction === 'usedBy' && relation.targetPath === filePath) {
      refs.push({
        id: relation.sourcePath,
        label: basename(relation.sourcePath),
      })
    }
    if (direction === 'dependsOn' && relation.sourcePath === filePath) {
      refs.push({
        id: relation.targetPath,
        label: basename(relation.targetPath),
      })
    }
  }
  if (direction === 'dependsOn') {
    const entry = fileIndex.find((file) => file.path === filePath)
    for (const importPath of entry?.imports ?? []) {
      refs.push({ id: importPath, label: basename(importPath) })
    }
  }
  return uniqueNeighbors(refs)
}

/**
 * Build OS-level code/architecture understanding for the detail drawer.
 * Code nodes use projected edges / fileRelations; architecture nodes use
 * durable-graph impactStructureGraph.
 */
export function buildNodeUnderstanding(input: {
  node: FunctionalNode
  /** Layer-projected nodes (includes code_file_*). */
  layerNodes: FunctionalNode[]
  layerEdges: FunctionalEdge[]
  fileIndex: FileEntry[]
  fileRelations: FileRelation[]
  /** Durable project graph for architecture impact. */
  durableGraph: ProjectGraph | null
}): CodeFileUnderstanding {
  const { node, layerNodes, layerEdges, fileIndex, fileRelations, durableGraph } =
    input
  const nodesById = new Map(layerNodes.map((item) => [item.id, item]))
  const isCodeNode = isCodeElementNode(node)
  const filePath = isCodeNode ? codeNodeFilePath(node) : null
  const fileEntry = filePath
    ? fileIndex.find((file) => file.path === filePath)
    : undefined

  let usedBy = neighborsFromEdges(node.id, layerEdges, nodesById, 'usedBy')
  let dependsOn = neighborsFromEdges(node.id, layerEdges, nodesById, 'dependsOn')

  if (isCodeNode && filePath) {
    if (usedBy.length === 0) {
      usedBy = neighborsFromFileRelations(
        filePath,
        fileRelations,
        fileIndex,
        'usedBy',
      )
    }
    if (dependsOn.length === 0) {
      dependsOn = neighborsFromFileRelations(
        filePath,
        fileRelations,
        fileIndex,
        'dependsOn',
      )
    }
  }

  let impactDependentCount = usedBy.length
  let impactDependencyCount = dependsOn.length
  let impactViews: string[] = []

  if (!isCodeNode && durableGraph) {
    const impact = impactStructureGraph(durableGraph, node.id)
    impactDependentCount = impact.dependents.length
    impactDependencyCount = impact.dependencies.length
    impactViews = impact.views
    if (usedBy.length === 0) {
      usedBy = impact.dependents.map((item) => ({
        id: item.id,
        label: neighborDisplayLabel(
          durableGraph.nodes.find((candidate) => candidate.id === item.id),
          item.id,
        ),
      }))
    }
    if (dependsOn.length === 0) {
      dependsOn = impact.dependencies.map((item) => ({
        id: item.id,
        label: neighborDisplayLabel(
          durableGraph.nodes.find((candidate) => candidate.id === item.id),
          item.id,
        ),
      }))
    }
  }

  return {
    isCodeNode,
    filePath: filePath || null,
    fileType: fileEntry?.type ?? null,
    stereotype:
      isCodeNode && filePath
        ? codeElementStereotype(fileEntry, filePath)
        : null,
    usedBy,
    dependsOn,
    changeRisk: changeRiskFromDependentCount(impactDependentCount),
    impactDependentCount,
    impactDependencyCount,
    impactViews,
  }
}
