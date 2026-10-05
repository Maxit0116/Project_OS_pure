import { useEffect, useMemo, useRef, useState } from 'react'
import type { SemanticTreeNode } from '@contracts/index'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useI18n } from '../../i18n'
import { File, Folder } from 'lucide-react'
import TreeRowChevron from './TreeRowChevron'
import { isSemanticFileKind, resolveTreeExpanded } from './treeExpansion'
import { moveTreeRowFocus } from './treeKeyboardNavigation'
import { scrollTreeRowIntoView } from './treeScroll'
import styles from './SemanticFileTree.module.css'

function collectFiles(nodes: SemanticTreeNode[]): { path: string; label: string }[] {
  const files: { path: string; label: string }[] = []
  const walk = (n: SemanticTreeNode) => {
    if (n.path && isSemanticFileKind(n.kind)) {
      files.push({ path: n.path, label: n.path })
    }
    n.children.forEach(walk)
  }
  nodes.forEach(walk)
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

function buildDirectoryTree(files: { path: string; label: string }[]) {
  const root: Record<string, unknown> = {}
  for (const f of files) {
    const parts = f.path.split('/')
    let cur = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isFile = i === parts.length - 1
      if (!cur[part]) {
        cur[part] = isFile ? { __file: f.path } : {}
      }
      cur = cur[part] as Record<string, unknown>
    }
  }
  return root
}

function DirNode({
  name,
  node,
  depth,
  fullPath,
  flashKey,
  focusedRowId,
  onFocusedRow,
}: {
  name: string
  node: Record<string, unknown>
  depth: number
  fullPath: string
  flashKey: number
  focusedRowId: string | null
  onFocusedRow: (rowId: string) => void
}) {
  const rowRef = useRef<HTMLButtonElement>(null)
  const selectedFilePath = useWorkbenchStore((s) => s.selectedFilePath)
  const highlightedFilePaths = useWorkbenchStore((s) => s.highlightedFilePaths)
  const directoryTreeExpansion = useWorkbenchStore((s) => s.directoryTreeExpansion)
  const selectFile = useWorkbenchStore((s) => s.selectFile)
  const toggleDirectoryTreeExpanded = useWorkbenchStore((s) => s.toggleDirectoryTreeExpanded)

  const isFile = '__file' in node
  const path = isFile ? (node.__file as string) : fullPath
  const isSelected = isFile && path === selectedFilePath
  const isHighlighted = isFile && highlightedFilePaths.includes(path)

  useEffect(() => {
    if (isHighlighted && rowRef.current) {
      scrollTreeRowIntoView(rowRef.current)
    }
  }, [isHighlighted, flashKey])

  if (isFile) {
    return (
      <div role="none">
        <button
          ref={rowRef}
          type="button"
          role="treeitem"
          aria-selected={isSelected}
          className={`${styles.row} ${isSelected ? styles.rowSelected : ''} ${isHighlighted && !isSelected ? styles.rowHighlighted : ''} ${isHighlighted ? 'flash-highlight' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => void selectFile(path)}
          data-tree-row-id={fullPath}
          tabIndex={focusedRowId === fullPath ? 0 : -1}
          onFocus={() => onFocusedRow(fullPath)}
          onKeyDown={(event) => {
            if (moveTreeRowFocus(event.currentTarget, event.key, onFocusedRow)) {
              event.preventDefault()
              event.stopPropagation()
            }
          }}
        >
          <span className={styles.chevronSpacer} aria-hidden />
          <File size={12} className={styles.lucideIcon} />
          <span className={styles.label}>{name}</span>
        </button>
      </div>
    )
  }

  const children = Object.entries(node).filter(([k]) => k !== '__file')
  const isExpanded = resolveTreeExpanded(directoryTreeExpansion, fullPath, depth)
  const toggleExpanded = () => toggleDirectoryTreeExpanded(fullPath, depth)

  return (
    <div role="none">
      <button
        ref={rowRef}
        type="button"
        role="treeitem"
        aria-expanded={isExpanded}
        className={styles.row}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={toggleExpanded}
        data-tree-row-id={fullPath}
        tabIndex={focusedRowId === fullPath ? 0 : -1}
        onFocus={() => onFocusedRow(fullPath)}
        onKeyDown={(event) => {
          if (moveTreeRowFocus(event.currentTarget, event.key, onFocusedRow)) {
            event.preventDefault()
            event.stopPropagation()
            return
          }
          if (
            event.key === 'Enter' || event.key === ' ' ||
            (event.key === 'ArrowRight' && !isExpanded) ||
            (event.key === 'ArrowLeft' && isExpanded)
          ) {
            event.preventDefault()
            toggleExpanded()
          }
        }}
      >
        <TreeRowChevron
          expanded={isExpanded}
          visible={children.length > 0}
          onToggle={toggleExpanded}
          label={name}
        />
        <Folder size={12} className={styles.lucideIcon} />
        <span className={styles.label}>{name}</span>
      </button>
      {isExpanded && (
        <div role="group">
          {children.map(([childName, childNode]) => (
            <DirNode
              key={childName}
              name={childName}
              node={childNode as Record<string, unknown>}
              depth={depth + 1}
              fullPath={fullPath ? `${fullPath}/${childName}` : childName}
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

export default function DirectoryTree() {
  const tree = useWorkbenchStore((s) => s.tree)
  const flashKey = useWorkbenchStore((s) => s.flashKey)
  const { ts } = useI18n()

  const dirTree = useMemo(() => {
    if (!tree) return null
    const files = collectFiles(tree.roots)
    return buildDirectoryTree(files)
  }, [tree])
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null)

  useEffect(() => {
    const firstRoot = dirTree ? Object.keys(dirTree)[0] ?? null : null
    setFocusedRowId((current) =>
      current && dirTree && containsDirectoryPath(dirTree, current)
        ? current
        : firstRoot,
    )
  }, [dirTree])

  if (!dirTree || Object.keys(dirTree).length === 0) {
    return <div className={styles.empty}>{ts('tree.empty')}</div>
  }

  return (
    <div className={styles.tree} role="tree" aria-label={ts('tree.directory')}>
      {Object.entries(dirTree).map(([name, node]) => (
        <DirNode
          key={name}
          name={name}
          node={node as Record<string, unknown>}
          depth={0}
          fullPath={name}
          flashKey={flashKey}
          focusedRowId={focusedRowId}
          onFocusedRow={setFocusedRowId}
        />
      ))}
    </div>
  )
}

function containsDirectoryPath(
  tree: Record<string, unknown>,
  path: string,
): boolean {
  let cursor = tree
  for (const segment of path.split('/')) {
    const child = cursor[segment]
    if (typeof child !== 'object' || child === null || Array.isArray(child)) return false
    cursor = child as Record<string, unknown>
  }
  return true
}
