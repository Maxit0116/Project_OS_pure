import type {
  ArchitectureLevel,
  FileEntry,
  FileRelation,
  FunctionalEdge,
  FunctionalNode,
} from '../../../../contracts/index.js'

export interface ArchitectureViewScope {
  parentId?: string
  focusNodeId?: string
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

export function availableArchitectureLevels(nodes: FunctionalNode[]): ArchitectureLevel[] {
  const available = new Set(nodes.map((node) => node.level).filter(Boolean))
  if (
    nodes.some(
      (node) => node.level === 'component' && node.linkedFiles.length > 0,
    )
  ) {
    available.add('code')
  }
  return ARCHITECTURE_LEVELS.filter((level) => available.has(level))
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
    const purpose = linkedFile.summary ?? '该文件属于当前功能模块。'
    return {
      id,
      type: 'capability' as const,
      name: path,
      status: 'active' as const,
      description: purpose,
      summary: purpose,
      responsibility: purpose,
      elementType: 'code_element' as const,
      level: 'code' as const,
      layer: fileLayer(file),
      technology: fileTechnology(path),
      linkedFiles: [linkedFile],
      upstream: upstreamById.get(id) ?? [],
      downstream: downstreamById.get(id) ?? [],
      confidence: 1,
      tags: ['内部文件', file?.type ?? 'other'],
      parentId: component.id,
      children: [],
      refs: [],
      depth: 3,
    } satisfies FunctionalNode
  })

  return { nodes: projectedNodes, edges: projectedEdges }
}

export function projectArchitectureView(
  nodes: FunctionalNode[],
  edges: FunctionalEdge[],
  level: ArchitectureLevel,
  scope: ArchitectureViewScope = {},
  fileIndex: FileEntry[] = [],
  fileRelations: FileRelation[] = [],
): { nodes: FunctionalNode[]; edges: FunctionalEdge[] } {
  if (!nodes.some((node) => node.level)) {
    return { nodes, edges }
  }

  if (level === 'code') {
    const component = scope.parentId
      ? nodes.find((node) => node.id === scope.parentId && node.level === 'component')
      : undefined
    const fileGraph = component
      ? projectInternalFileView(component, fileRelations, fileIndex)
      : { nodes: [], edges: [] }
    return scope.focusNodeId
      ? focusOneHop(fileGraph.nodes, fileGraph.edges, scope.focusNodeId)
      : fileGraph
  }

  const levelNodes = nodes.filter(
    (node) =>
      node.level === level &&
      (!scope.parentId || node.parentId === scope.parentId),
  )
  const levelIds = new Set(levelNodes.map((node) => node.id))
  const levelEdges = edges.filter(
    (edge) =>
      Boolean(edge.label?.trim()) &&
      levelIds.has(edge.source) &&
      levelIds.has(edge.target),
  )

  if (!scope.focusNodeId || !levelIds.has(scope.focusNodeId)) {
    return { nodes: levelNodes, edges: levelEdges }
  }

  return focusOneHop(levelNodes, levelEdges, scope.focusNodeId)
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
