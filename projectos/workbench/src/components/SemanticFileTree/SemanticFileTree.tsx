import { useEffect, useMemo, useRef, useState } from 'react'
import {
  File,
  Folder,
  Zap,
  Settings,
  FlaskConical,
  AlertTriangle,
  Link,
  Diamond,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { SemanticTreeNode } from '@contracts/index'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useI18n } from '../../i18n'
import TreeRowChevron from './TreeRowChevron'
import { isSemanticFileKind, resolveSemanticTreeExpanded } from './treeExpansion'
import {
  activateSemanticTreeRow,
  handleSemanticTreeRowKey,
} from './semanticTreeRowInteraction'
import { moveTreeRowFocus } from './treeKeyboardNavigation'
import { scrollTreeRowIntoView } from './treeScroll'
import styles from './SemanticFileTree.module.css'

const KIND_ICON: Record<string, LucideIcon> = {
  feature: Diamond,
  file: File,
  route: Link,
  api: Zap,
  config: Settings,
  folder: Folder,
  test: FlaskConical,
  error_group: AlertTriangle,
}

function collectErrorNodes(nodes: SemanticTreeNode[]): SemanticTreeNode[] {
  const errors: SemanticTreeNode[] = []
  const walk = (n: SemanticTreeNode) => {
    if (n.status === 'error') errors.push(n)
    n.children.forEach(walk)
  }
  nodes.forEach(walk)
  return errors
}

function TreeNode({
  node,
  depth,
  flashKey,
  focusedRowId,
  onFocusedRow,
}: {
  node: SemanticTreeNode
  depth: number
  flashKey: number
  focusedRowId: string | null
  onFocusedRow: (rowId: string) => void
}) {
  const rowRef = useRef<HTMLButtonElement>(null)
  const selectedFilePath = useWorkbenchStore((s) => s.selectedFilePath)
  const selectedNodeId = useWorkbenchStore((s) => s.selectedNodeId)
  const highlightedFilePaths = useWorkbenchStore((s) => s.highlightedFilePaths)
  const semanticTreeExpansion = useWorkbenchStore((s) => s.semanticTreeExpansion)
  const selectFile = useWorkbenchStore((s) => s.selectFile)
  const selectNode = useWorkbenchStore((s) => s.selectNode)
  const toggleSemanticTreeExpanded = useWorkbenchStore((s) => s.toggleSemanticTreeExpanded)

  const hasChildren = node.children.length > 0
  const isFile = isSemanticFileKind(node.kind)
  const isExpanded = resolveSemanticTreeExpanded(semanticTreeExpansion, node.id, depth)
  const isSelected =
    (isFile && node.path === selectedFilePath) ||
    (!isFile && node.sourceNodeId === selectedNodeId && node.kind === 'feature')
  const isHighlighted = node.path ? highlightedFilePaths.includes(node.path) : false
  const isError = node.status === 'error'
  const Icon = KIND_ICON[node.kind] ?? File

  useEffect(() => {
    if (isHighlighted && rowRef.current) {
      scrollTreeRowIntoView(rowRef.current)
    }
  }, [isHighlighted, flashKey])

  const toggleExpanded = () => toggleSemanticTreeExpanded(node.id, depth)

  const rowActions = {
    selectFile: (path: string, sourceNodeId?: string) => {
      void selectFile(path, sourceNodeId)
    },
    selectNode: (nodeId: string) => {
      void selectNode(nodeId)
    },
    toggleExpanded,
  }

  const handleRowClick = () => {
    activateSemanticTreeRow(node, rowActions)
  }

  return (
    <div role="none">
      <button
        ref={rowRef}
        type="button"
        role="treeitem"
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-selected={isSelected}
        className={`${styles.row} ${isSelected ? styles.rowSelected : ''} ${isHighlighted && !isSelected ? styles.rowHighlighted : ''} ${isError ? styles.rowError : ''} ${isHighlighted ? 'flash-highlight' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={handleRowClick}
        data-tree-row-id={node.id}
        tabIndex={focusedRowId === node.id ? 0 : -1}
        onFocus={() => onFocusedRow(node.id)}
        onKeyDown={(event) => {
          if (moveTreeRowFocus(event.currentTarget, event.key, onFocusedRow)) {
            event.preventDefault()
            event.stopPropagation()
            return
          }
          handleSemanticTreeRowKey(event, node, isExpanded, rowActions)
        }}
      >
        <TreeRowChevron
          expanded={isExpanded}
          visible={hasChildren}
          onToggle={toggleExpanded}
          label={node.label}
        />
        <Icon size={12} className={styles.lucideIcon} />
        <span className={styles.label}>{node.label}</span>
        {node.badges?.map((b) => (
          <span key={b} className={styles.badge}>{b}</span>
        ))}
        <span className={`${styles.status} ${styles[`status_${node.status}`] ?? ''}`} />
      </button>
      {isExpanded && (
        <div role="group">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              flashKey={flashKey}
              focusedRowId={focusedRowId}
              onFocusedRow={onFocusedRow}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AttentionRow({ node }: { node: SemanticTreeNode }) {
  const selectFile = useWorkbenchStore((s) => s.selectFile)
  const attentionRef = useRef<HTMLButtonElement>(null)
  const flashKey = useWorkbenchStore((s) => s.flashKey)

  useEffect(() => {
    if (attentionRef.current) scrollTreeRowIntoView(attentionRef.current)
  }, [flashKey])

  return (
    <button
      ref={attentionRef}
      type="button"
      className={`${styles.attentionRow} flash-highlight`}
      onClick={() => node.path && void selectFile(node.path, node.sourceNodeId)}
    >
      <AlertTriangle size={12} />
      <span>{node.label}</span>
    </button>
  )
}

export default function SemanticFileTree() {
  const tree = useWorkbenchStore((s) => s.tree)
  const flashKey = useWorkbenchStore((s) => s.flashKey)
  const { ts } = useI18n()
  const [focusedRowId, setFocusedRowId] = useState<string | null>(
    tree?.roots[0]?.id ?? null,
  )

  const errorNodes = useMemo(
    () => (tree ? collectErrorNodes(tree.roots) : []),
    [tree],
  )

  useEffect(() => {
    setFocusedRowId((current) =>
      current && tree?.roots.some((root) => containsNode(root, current))
        ? current
        : tree?.roots[0]?.id ?? null,
    )
  }, [tree])

  if (!tree || tree.roots.length === 0) {
    return <div className={styles.empty}>{ts('tree.empty')}</div>
  }

  return (
    <div className={styles.tree} role="tree" aria-label={ts('tree.semantic')}>
      {errorNodes.length > 0 && (
        <section className={styles.attention}>
          <div className={styles.attentionLabel}>{ts('tree.needsAttention')}</div>
          {errorNodes.map((n) => (
            <AttentionRow key={n.id} node={n} />
          ))}
        </section>
      )}
      {tree.roots.map((root) => (
        <TreeNode
          key={root.id}
          node={root}
          depth={0}
          flashKey={flashKey}
          focusedRowId={focusedRowId}
          onFocusedRow={setFocusedRowId}
        />
      ))}
    </div>
  )
}

function containsNode(node: SemanticTreeNode, nodeId: string): boolean {
  return node.id === nodeId || node.children.some((child) => containsNode(child, nodeId))
}
