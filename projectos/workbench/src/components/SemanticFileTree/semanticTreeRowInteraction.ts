import type { SemanticTreeNode } from '@contracts/index'
import { isSemanticFileKind } from './treeExpansion'

interface TreeRowActions {
  selectFile(path: string, sourceNodeId?: string): void
  selectNode(nodeId: string): void
  toggleExpanded(): void
}

interface TreeRowKeyEvent {
  key: string
  preventDefault(): void
  stopPropagation(): void
}

export function activateSemanticTreeRow(
  node: SemanticTreeNode,
  actions: TreeRowActions,
): void {
  if (isSemanticFileKind(node.kind) && node.path) {
    actions.selectFile(node.path, node.sourceNodeId)
    return
  }
  if (node.kind === 'feature' && node.sourceNodeId) {
    actions.selectNode(node.sourceNodeId)
    return
  }
  if (node.children.length > 0) actions.toggleExpanded()
}

export function handleSemanticTreeRowKey(
  event: TreeRowKeyEvent,
  node: SemanticTreeNode,
  expanded: boolean,
  actions: TreeRowActions,
): boolean {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    event.stopPropagation()
    activateSemanticTreeRow(node, actions)
    return true
  }
  if (
    node.children.length > 0 &&
    ((event.key === 'ArrowRight' && !expanded) ||
      (event.key === 'ArrowLeft' && expanded))
  ) {
    event.preventDefault()
    event.stopPropagation()
    actions.toggleExpanded()
    return true
  }
  return false
}
