import type { FunctionalNode } from '@contracts/index'

export interface CodeNodeTarget {
  nodeId: string
  filePath: string
  parentNodeId: string
}

export function resolveCodeNodeTarget(
  node: FunctionalNode | undefined,
): CodeNodeTarget | null {
  const filePath = node?.linkedFiles[0]?.path
  if (node?.level !== 'code' || !filePath || !node.parentId) return null
  return { nodeId: node.id, filePath, parentNodeId: node.parentId }
}

export function isCodeElementNode(node: FunctionalNode): boolean {
  return node.level === 'code' || node.elementType === 'code_element'
}

/** Primary title shown on flat map cards and galaxy labels for internal file nodes. */
export function codeNodeDisplayTitle(node: FunctionalNode): string {
  return node.responsibility ?? node.summary ?? node.name
}

export function codeNodeFilePath(node: FunctionalNode): string {
  return node.linkedFiles[0]?.path ?? node.name
}

export async function focusCodeNodeForMap(
  target: CodeNodeTarget,
  actions: {
    focusCodeNode: (nodeId: string) => void
    selectNode: (nodeId: string) => void | Promise<void>
  },
): Promise<void> {
  actions.focusCodeNode(target.nodeId)
  await actions.selectNode(target.parentNodeId)
}

export async function openCodeNodeFile(
  target: Pick<CodeNodeTarget, 'filePath' | 'parentNodeId'>,
  selectFile: (
    filePath: string,
    preferredNodeId?: string,
  ) => void | Promise<void>,
): Promise<void> {
  await selectFile(target.filePath, target.parentNodeId)
}

/**
 * Open a code-file node in the Code / Diff editor.
 * Does not enter one-hop map focus — returning to Function Map keeps the full graph.
 */
export async function openCodeNodeInEditor(
  target: CodeNodeTarget,
  actions: {
    selectFile: (
      filePath: string,
      preferredNodeId?: string,
    ) => void | Promise<void>
  },
): Promise<void> {
  await openCodeNodeFile(target, actions.selectFile)
}
