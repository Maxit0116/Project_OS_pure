import type {
  ArchitectureLevel,
  ArchitectureView,
  FileEntry,
  FileRelation,
  FunctionalEdge,
  FunctionalNode,
} from '../../../../contracts/index.js'
import {
  applyViewNodeFilters,
  findArchitectureView,
  liftRelationshipsToVisibleAncestors,
  resolveArchitectureView,
  synthesizeDefaultArchitectureViews,
  viewsForLevel,
  type ArchitectureViewScope,
} from '../../../../shared/c4-architecture-views/index.js'

export type { ArchitectureViewScope }
export {
  applyViewNodeFilters,
  findArchitectureView,
  liftRelationshipsToVisibleAncestors,
  resolveArchitectureView,
  synthesizeDefaultArchitectureViews,
  viewsForLevel,
}

export const ARCHITECTURE_LEVELS: ArchitectureLevel[] = [
  'context',
  'container',
  'component',
  'code',
]

export function isNodeAgentArchitectureLevel(
  level: ArchitectureLevel | undefined,
): boolean {
  return level === 'context' || level === 'container' || level === 'component'
}

export function availableArchitectureLevels(
  nodes: FunctionalNode[],
  fileIndex: FileEntry[] = [],
): ArchitectureLevel[] {
  const available = new Set(nodes.map((node) => node.level).filter(Boolean))
  const componentIds = new Set(
    nodes.filter((node) => node.level === 'component').map((node) => node.id),
  )
  const hasLinkedFiles = nodes.some(
    (node) => node.level === 'component' && node.linkedFiles.length > 0,
  )
  const hasOwnedFiles = fileIndex.some((file) =>
    file.nodeIds.some((nodeId) => componentIds.has(nodeId)),
  )
  if (hasLinkedFiles || hasOwnedFiles) {
    available.add('code')
  }
  return ARCHITECTURE_LEVELS.filter((level) => available.has(level))
}

/**
 * Default zoom-into parent for a C4 level when the level switcher is used
 * (not a specific double-click drill). Prefers parentId reverse links so
 * missing `children[]` still scopes Container/Component diagrams.
 */
export function defaultArchitectureScopeId(
  nodes: FunctionalNode[],
  level: ArchitectureLevel,
): string | null {
  if (level === 'context') return null

  if (level === 'code') {
    return (
      nodes.find(
        (candidate) =>
          candidate.level === 'component' && candidate.linkedFiles.length > 0,
      )?.id ?? null
    )
  }

  if (level === 'container') {
    const systems = nodes.filter((n) => n.elementType === 'software_system')
    const withContainers = systems.find((system) =>
      nodes.some((n) => n.level === 'container' && n.parentId === system.id),
    )
    if (withContainers) return withContainers.id
    if (systems[0]) return systems[0].id
  }

  if (level === 'component') {
    const containers = nodes.filter((n) => n.level === 'container')
    const withComponents = containers.find((container) =>
      nodes.some((n) => n.level === 'component' && n.parentId === container.id),
    )
    if (withComponents) return withComponents.id
  }

  return (
    nodes.find((candidate) =>
      candidate.children?.some(
        (childId) => nodes.find((node) => node.id === childId)?.level === level,
      ),
    )?.id ?? null
  )
}

export function architectureFileNodeId(componentId: string, path: string): string {
  const safePath = path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  let hash = 2166136261
  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `code_file_${componentId}_${safePath}_${(hash >>> 0).toString(36)}`
}

function fileLayer(file: FileEntry | undefined): string {
  const path = file?.path ?? ''
  if (file?.type === 'page' || path.startsWith('lib/hooks/')) return 'experience'
  if (path.startsWith('app/api/') || path === 'app/middleware.ts') return 'interface'
  if (path.startsWith('prisma/')) return 'data'
  if (/^lib\/(db|data|constants)\./.test(path)) return 'infrastructure'
  if (file?.type === 'lib') return 'application'
  return 'infrastructure'
}

function fileTechnology(path: string): string {
  if (path.endsWith('.prisma')) return 'Prisma Schema'
  if (path.endsWith('.tsx')) return 'React / TypeScript'
  if (path.endsWith('/route.ts')) return 'Next.js Route Handler'
  if (path.endsWith('.ts')) return 'TypeScript'
  return '项目文件'
}

function filePurposeFromPath(path: string): string {
  const base = path.split('/').pop() ?? path
  const stem = base.replace(/\.[^.]+$/, '')
  return stem || base
}

export function codeElementStereotype(file: FileEntry | undefined, path: string): string {
  if (file?.type === 'page') return '[Page]'
  if (file?.type === 'api') return '[API Route]'
  if (path.endsWith('.prisma')) return '[Schema]'
  if (path.endsWith('.css') || path.endsWith('.scss') || path.endsWith('.module.css')) {
    return '[Style]'
  }
  if (file?.type === 'test' || /\.(test|spec)\./.test(path)) return '[Test]'
  if (file?.exports.some((name) => name !== 'default') || file?.type === 'lib') {
    return '[Module]'
  }
  if (path.endsWith('.tsx') || path.endsWith('.jsx')) return '[Component]'
  return '[Code]'
}

const INTERNAL_IMPORT_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.prisma',
  '.css',
  '.scss',
] as const

function normalizeWorkspacePath(path: string): string | null {
  const normalizedSeparators = path.replace(/\\/g, '/')
  if (
    normalizedSeparators.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalizedSeparators) ||
    normalizedSeparators.includes('\0')
  ) {
    return null
  }

  const segments: string[] = []
  for (const segment of normalizedSeparators.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) return null
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return segments.join('/')
}

function workspaceDirname(path: string): string {
  const separator = path.lastIndexOf('/')
  return separator < 0 ? '' : path.slice(0, separator)
}

export function resolveInternalImportPath(
  sourcePath: string,
  specifier: string,
  availablePaths: ReadonlySet<string>,
): string | null {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0]?.trim() ?? ''
  if (!cleanSpecifier || /^(?:[a-zA-Z][a-zA-Z\d+.-]*:|\/)/.test(cleanSpecifier)) {
    return null
  }

  const unresolved = cleanSpecifier.startsWith('@/')
    ? cleanSpecifier.slice(2)
    : cleanSpecifier.startsWith('./') || cleanSpecifier.startsWith('../')
      ? `${workspaceDirname(sourcePath)}/${cleanSpecifier}`
      : cleanSpecifier
  const base = normalizeWorkspacePath(unresolved)
  if (!base) return null

  const candidates = [
    base,
    ...INTERNAL_IMPORT_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...INTERNAL_IMPORT_EXTENSIONS.map((extension) => `${base}/index${extension}`),
  ]
  return candidates.find((candidate) => availablePaths.has(candidate)) ?? null
}

function withoutTerminalPunctuation(value: string): string {
  return value.trim().replace(/[。.!！?？]+$/, '')
}

function importLabel(file: FileEntry | undefined, fallbackPurpose: string): string {
  const namedExports = file?.exports.filter((name) => name !== 'default') ?? []
  const importedCapability =
    namedExports.length > 0
      ? namedExports.join('、')
      : withoutTerminalPunctuation(fallbackPurpose)
  return `导入：${importedCapability}`
}

function projectInternalFileView(
  component: FunctionalNode,
  fileRelations: FileRelation[],
  fileIndex: FileEntry[],
): { nodes: FunctionalNode[]; edges: FunctionalEdge[] } {
  const filesByPath = new Map(fileIndex.map((file) => [file.path, file]))
  const linkedByPath = new Map(component.linkedFiles.map((file) => [file.path, file]))
  // Classic C4 Code scope = one component. If linkedFiles is thin, recover
  // ownership from fileIndex.nodeIds so the code layer is still reachable.
  for (const file of fileIndex) {
    if (!file.nodeIds.includes(component.id)) continue
    if (linkedByPath.has(file.path)) continue
    linkedByPath.set(file.path, {
      path: file.path,
      role: 'supporting',
      summary: filePurposeFromPath(file.path),
    })
  }
  const nodeIdByPath = new Map(
    [...linkedByPath.keys()].map((path) => [path, architectureFileNodeId(component.id, path)]),
  )
  const linkedPaths = new Set(nodeIdByPath.keys())
  const explicitEdges: FunctionalEdge[] = fileRelations.flatMap((relation) => {
    const source = nodeIdByPath.get(relation.sourcePath)
    const target = nodeIdByPath.get(relation.targetPath)
    if (!source || !target) return []
    return [{
      id: relation.id,
      source,
      target,
      relation: relation.relation,
      label: relation.label,
      ...(relation.purpose ? { purpose: relation.purpose } : {}),
      ...(relation.technology ? { technology: relation.technology } : {}),
      confidence: relation.confidence,
      evidence: relation.evidence,
    }]
  })
  const explicitKeys = new Set(
    explicitEdges.map((edge) => `${edge.source}\u0000${edge.target}`),
  )
  const importEdges: FunctionalEdge[] = []

  for (const [sourcePath, sourceId] of nodeIdByPath) {
    const sourceFile = filesByPath.get(sourcePath)
    for (const rawTargetPath of sourceFile?.imports ?? []) {
      const targetPath = resolveInternalImportPath(sourcePath, rawTargetPath, linkedPaths)
      if (!targetPath) continue
      const targetId = nodeIdByPath.get(targetPath)
      if (!targetId || explicitKeys.has(`${sourceId}\u0000${targetId}`)) continue
      const sourcePurpose = linkedByPath.get(sourcePath)?.summary ?? '完成当前文件的职责。'
      const targetPurpose = linkedByPath.get(targetPath)?.summary ?? '提供当前文件需要的能力。'
      importEdges.push({
        id: `arch_file_import_${sourceId}_${targetId}`,
        source: sourceId,
        target: targetId,
        relation: 'imports',
        label: importLabel(filesByPath.get(targetPath), targetPurpose),
        purpose: `用于：${withoutTerminalPunctuation(sourcePurpose)}`,
        confidence: 1,
        evidence: `${sourcePath} -> ${targetPath}`,
      })
    }
  }

  const projectedEdges = [...explicitEdges, ...importEdges]
  const upstreamById = new Map<string, string[]>()
  const downstreamById = new Map<string, string[]>()
  for (const edge of projectedEdges) {
    downstreamById.set(edge.source, [...(downstreamById.get(edge.source) ?? []), edge.target])
    upstreamById.set(edge.target, [...(upstreamById.get(edge.target) ?? []), edge.source])
  }

  const projectedNodes = [...linkedByPath].map(([path, linkedFile]) => {
    const file = filesByPath.get(path)
    const id = nodeIdByPath.get(path)!
    const basename = path.split('/').pop() ?? path
    const purpose =
      linkedFile.summary?.trim() ||
      (file?.exports.filter((name) => name !== 'default').length
        ? `Exports ${file.exports.filter((name) => name !== 'default').join(', ')}`
        : filePurposeFromPath(path))
    const stereotype = codeElementStereotype(file, path)
    return {
      id,
      type: 'capability' as const,
      // Basename first — classic code diagrams name the type, not the full path.
      name: basename,
      status: 'active' as const,
      description: purpose,
      summary: purpose,
      responsibility: purpose,
      elementType: 'code_element' as const,
      level: 'code' as const,
      layer: fileLayer(file),
      technology: fileTechnology(path),
      linkedFiles: [{ ...linkedFile, path, summary: linkedFile.summary ?? purpose }],
      upstream: upstreamById.get(id) ?? [],
      downstream: downstreamById.get(id) ?? [],
      confidence: 1,
      tags: ['内部文件', 'code', stereotype, file?.type ?? 'other', path],
      parentId: component.id,
      children: [],
      refs: file?.exports ?? [],
      depth: 3,
    } satisfies FunctionalNode
  })

  return { nodes: projectedNodes, edges: projectedEdges }
}

export interface ProjectArchitectureViewOptions {
  views?: ArchitectureView[]
  viewKey?: string
  /** When true (default), lift cross-level edges to visible ancestors. */
  liftRelationships?: boolean
}

export function projectArchitectureView(
  nodes: FunctionalNode[],
  edges: FunctionalEdge[],
  level: ArchitectureLevel,
  scope: ArchitectureViewScope = {},
  fileIndex: FileEntry[] = [],
  fileRelations: FileRelation[] = [],
  options: ProjectArchitectureViewOptions = {},
): { nodes: FunctionalNode[]; edges: FunctionalEdge[] } {
  if (!nodes.some((node) => node.level)) {
    return { nodes, edges }
  }

  const resolved = resolveArchitectureView({
    views: options.views,
    viewKey: options.viewKey,
    level,
    scope,
  })
  const effectiveLevel = resolved.view.level
  const effectiveScope: ArchitectureViewScope = {
    ...resolved.scope,
    ...scope,
  }
  const lift = options.liftRelationships !== false

  if (effectiveLevel === 'code') {
    const component = effectiveScope.parentId
      ? nodes.find(
          (node) =>
            node.id === effectiveScope.parentId && node.level === 'component',
        )
      : undefined
    const fileGraph = component
      ? projectInternalFileView(component, fileRelations, fileIndex)
      : { nodes: [], edges: [] }
    return effectiveScope.focusNodeId
      ? focusOneHop(fileGraph.nodes, fileGraph.edges, effectiveScope.focusNodeId)
      : fileGraph
  }

  let levelNodes = nodes.filter(
    (node) =>
      node.level === effectiveLevel &&
      (!effectiveScope.parentId || node.parentId === effectiveScope.parentId),
  )
  levelNodes = applyViewNodeFilters(levelNodes, resolved.view)
  const levelIds = new Set(levelNodes.map((node) => node.id))

  const labeledEdges = edges.filter((edge) => Boolean(edge.label?.trim()))
  const levelEdges = lift
    ? liftRelationshipsToVisibleAncestors(nodes, labeledEdges, levelIds).filter(
        (edge) => levelIds.has(edge.source) && levelIds.has(edge.target),
      )
    : labeledEdges.filter(
        (edge) => levelIds.has(edge.source) && levelIds.has(edge.target),
      )

  if (!effectiveScope.focusNodeId || !levelIds.has(effectiveScope.focusNodeId)) {
    return { nodes: levelNodes, edges: levelEdges }
  }

  return focusOneHop(levelNodes, levelEdges, effectiveScope.focusNodeId)
}

export function computeOneHopLinkedIds(
  nodes: FunctionalNode[],
  edges: FunctionalEdge[],
  focusNodeId: string,
): Set<string> {
  if (!nodes.some((node) => node.id === focusNodeId)) {
    return new Set(nodes.map((item) => item.id))
  }

  const focusedIds = new Set([focusNodeId])
  for (const edge of edges) {
    if (edge.source === focusNodeId || edge.target === focusNodeId) {
      focusedIds.add(edge.source)
      focusedIds.add(edge.target)
    }
  }
  return focusedIds
}

function focusOneHop(
  nodes: FunctionalNode[],
  edges: FunctionalEdge[],
  focusNodeId: string,
): { nodes: FunctionalNode[]; edges: FunctionalEdge[] } {
  const focusedIds = computeOneHopLinkedIds(nodes, edges, focusNodeId)
  if (!focusedIds.has(focusNodeId)) {
    return { nodes, edges }
  }

  const visibleEdges = edges.filter(
    (edge) =>
      edge.source === focusNodeId || edge.target === focusNodeId,
  )
  const visibleNodes = nodes.filter((node) => focusedIds.has(node.id))

  return { nodes: visibleNodes, edges: visibleEdges }
}

export function architectureScopeForSelection(
  nodes: FunctionalNode[],
  level: ArchitectureLevel,
  selectedNodeId: string | null,
): ArchitectureViewScope {
  if (!selectedNodeId) return {}

  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const selectedNode = nodesById.get(selectedNodeId)
  if (!selectedNode) return {}

  if (selectedNode.level === level) {
    return {
      ...(selectedNode.parentId ? { parentId: selectedNode.parentId } : {}),
      focusNodeId: selectedNode.id,
    }
  }

  const isSelectedParentOfLevel = nodes.some(
    (node) => node.level === level && node.parentId === selectedNode.id,
  )
  if (isSelectedParentOfLevel) {
    return { parentId: selectedNode.id }
  }

  if (
    level === 'code' &&
    selectedNode.level === 'component' &&
    selectedNode.linkedFiles.length > 0
  ) {
    return { parentId: selectedNode.id }
  }

  let ancestor =
    selectedNode.parentId === null || selectedNode.parentId === undefined
      ? undefined
      : nodesById.get(selectedNode.parentId)
  const visitedNodeIds = new Set<string>([selectedNode.id])
  while (ancestor && !visitedNodeIds.has(ancestor.id)) {
    visitedNodeIds.add(ancestor.id)
    if (ancestor.level === level) {
      return {
        ...(ancestor.parentId ? { parentId: ancestor.parentId } : {}),
        focusNodeId: ancestor.id,
      }
    }
    ancestor =
      ancestor.parentId === null || ancestor.parentId === undefined
        ? undefined
        : nodesById.get(ancestor.parentId)
  }

  return {}
}
