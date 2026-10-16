import {
  applyViewNodeFilters,
  projectArchitectureView,
  resolveArchitectureView,
} from '../architectureView'
import { buildCodeDiagram } from './code/buildCodeDiagram'
import { buildComponentDiagram } from './component/buildComponentDiagram'
import { buildContainerDiagram } from './container/buildContainerDiagram'
import { buildContextDiagram } from './context/buildContextDiagram'
import type { C4Diagram, C4DiagramInput } from './types'

/**
 * Apply named-view include/exclude to the current level's nodes only.
 * Parents, externals, and other support nodes stay in the graph so builders
 * can still resolve system/container boundaries.
 */
function nodesForScopedLevelBuilders(input: C4DiagramInput): {
  nodes: C4DiagramInput['nodes']
  scope: C4DiagramInput['scope']
} {
  const resolved = resolveArchitectureView({
    views: input.views,
    viewKey: input.viewKey,
    level: input.level,
    scope: input.scope,
  })
  const scope = {
    ...resolved.scope,
    ...input.scope,
  }

  const hasInclude = Boolean(resolved.view.includeNodeIds?.length)
  const hasExclude = Boolean(resolved.view.excludeNodeIds?.length)
  if (!hasInclude && !hasExclude) {
    return { nodes: input.nodes, scope }
  }

  const levelIds = new Set(
    applyViewNodeFilters(
      input.nodes.filter(
        (node) =>
          node.level === input.level &&
          (!scope?.parentId || node.parentId === scope.parentId),
      ),
      resolved.view,
    ).map((node) => node.id),
  )

  return {
    nodes: input.nodes.filter(
      (node) => node.level !== input.level || levelIds.has(node.id),
    ),
    scope,
  }
}

/**
 * Frozen entry point for Wave 2 merge into FunctionMapCanvas.
 *
 * Context uses full view projection (incl. relationship lifting).
 * Container / Component keep the full model graph so parent system/container
 * nodes remain available for dashed C4 boundaries; named-view filters only
 * trim same-level children.
 */
export function buildDiagram(input: C4DiagramInput): C4Diagram {
  switch (input.level) {
    case 'context': {
      const projected = projectArchitectureView(
        input.nodes,
        input.edges,
        'context',
        input.scope ?? {},
        input.fileIndex ?? [],
        input.fileRelations ?? [],
        {
          views: input.views,
          viewKey: input.viewKey,
        },
      )
      return buildContextDiagram({
        ...input,
        nodes: projected.nodes,
        edges: projected.edges,
      })
    }
    case 'container': {
      const scoped = nodesForScopedLevelBuilders(input)
      return buildContainerDiagram({
        ...input,
        nodes: scoped.nodes,
        scope: scoped.scope,
      })
    }
    case 'component': {
      const scoped = nodesForScopedLevelBuilders(input)
      return buildComponentDiagram({
        ...input,
        nodes: scoped.nodes,
        scope: scoped.scope,
      })
    }
    case 'code':
      return buildCodeDiagram(input)
    default:
      return buildContextDiagram(input)
  }
}
