import { useEffect, useRef, useState } from 'react'
import type { WorkspaceDirectoryEntry } from '@contracts/index'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useI18n } from '../../i18n'
import { File, Folder } from 'lucide-react'
import TreeRowChevron from './TreeRowChevron'
import { resolveTreeExpanded } from './treeExpansion'
import { moveTreeRowFocus } from './treeKeyboardNavigation'
import { scrollTreeRowIntoView } from './treeScroll'
import styles from './SemanticFileTree.module.css'

function DirNode({
  entry,
  depth,
  flashKey,
  focusedRowId,
  onFocusedRow,
}: {
  entry: WorkspaceDirectoryEntry
  depth: number
  flashKey: number
  focusedRowId: string | null
  onFocusedRow: (rowId: string) => void
}) {
  const rowRef = useRef<HTMLButtonElement>(null)
  const selectedFilePath = useWorkbenchStore((s) => s.selectedFilePath)
  const highlightedFilePaths = useWorkbenchStore((s) => s.highlightedFilePaths)
  const directoryTreeExpansion = useWorkbenchStore((s) => s.directoryTreeExpansion)
  const listing = useWorkbenchStore((s) =>
    entry.kind === 'directory' ? s.directoryListings[entry.path] : undefined,
  )
  const selectFile = useWorkbenchStore((s) => s.selectFile)
  const toggleDirectoryTreeExpanded = useWorkbenchStore((s) => s.toggleDirectoryTreeExpanded)
  const loadDirectoryListing = useWorkbenchStore((s) => s.loadDirectoryListing)
  const { ts } = useI18n()

  const isFile = entry.kind === 'file'
  const isSelected = isFile && entry.path === selectedFilePath
  const isHighlighted = isFile && highlightedFilePaths.includes(entry.path)
  const isExpanded = !isFile && resolveTreeExpanded(directoryTreeExpansion, entry.path, depth)

  useEffect(() => {
    if (isHighlighted && rowRef.current) {
      scrollTreeRowIntoView(rowRef.current)
    }
  }, [isHighlighted, flashKey])

  useEffect(() => {
    if (isFile || !isExpanded || listing) return
    void loadDirectoryListing(entry.path)
  }, [entry.path, isExpanded, isFile, listing, loadDirectoryListing])

  const toggleExpanded = () => toggleDirectoryTreeExpanded(entry.path, depth)

  if (isFile) {
    return (
      <div role="none">
        <button
          ref={rowRef}
          type="button"
          role="treeitem"
          aria-selected={isSelected}
          className={`${styles.row} ${isSelected ? styles.rowSelected : ''} ${isHighlighted && !isSelected ? styles.rowHighlighted : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => void selectFile(entry.path)}
          data-tree-row-id={entry.path}
          tabIndex={focusedRowId === entry.path ? 0 : -1}
          onFocus={() => onFocusedRow(entry.path)}
          onKeyDown={(event) => {
            if (moveTreeRowFocus(event.currentTarget, event.key, onFocusedRow)) {
              event.preventDefault()
              event.stopPropagation()
            }
          }}
        >
          <span className={styles.chevronSpacer} aria-hidden />
          <File size={12} className={styles.lucideIcon} />
          <span className={styles.label}>{entry.name}</span>
        </button>
      </div>
    )
  }

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
        data-tree-row-id={entry.path}
        tabIndex={focusedRowId === entry.path ? 0 : -1}
        onFocus={() => onFocusedRow(entry.path)}
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
          visible
          onToggle={toggleExpanded}
          label={entry.name}
        />
        <Folder size={12} className={styles.lucideIcon} />
        <span className={styles.label}>{entry.name}</span>
      </button>
      {isExpanded && (
        <div role="group">
          {listing?.status === 'loading' || !listing ? (
            <div className={styles.folderHint} style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
              {ts('tree.directoryLoading')}
            </div>
          ) : listing.status === 'error' ? (
            <div className={styles.folderHint} style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
              {ts('tree.directoryError')}
            </div>
          ) : listing.entries.length === 0 ? (
            <div className={styles.folderHint} style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
              {ts('tree.folderEmpty')}
            </div>
          ) : (
            listing.entries.map((child) => (
              <DirNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                flashKey={flashKey}
                focusedRowId={focusedRowId}
                onFocusedRow={onFocusedRow}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function DirectoryTree() {
  const projectId = useWorkbenchStore((s) => s.project?.projectId ?? null)
  const rootListing = useWorkbenchStore((s) => s.directoryListings[''])
  const flashKey = useWorkbenchStore((s) => s.flashKey)
  const loadDirectoryListing = useWorkbenchStore((s) => s.loadDirectoryListing)
  const { ts } = useI18n()
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId || rootListing) return
    void loadDirectoryListing('')
  }, [projectId, rootListing, loadDirectoryListing])

  useEffect(() => {
    const first = rootListing?.entries[0]?.path ?? null
    setFocusedRowId((current) =>
      current && rootListing && containsDirectoryEntry(rootListing.entries, current)
        ? current
        : first,
    )
  }, [rootListing])

  if (!rootListing || rootListing.status === 'loading') {
    return <div className={styles.empty}>{ts('tree.directoryLoading')}</div>
  }
  if (rootListing.status === 'error') {
    return <div className={styles.empty}>{ts('tree.directoryError')}</div>
  }
  if (rootListing.entries.length === 0) {
    return <div className={styles.empty}>{ts('tree.folderEmpty')}</div>
  }

  return (
    <div className={styles.tree} role="tree" aria-label={ts('tree.directory')}>
      {rootListing.entries.map((entry) => (
        <DirNode
          key={entry.path}
          entry={entry}
          depth={0}
          flashKey={flashKey}
          focusedRowId={focusedRowId}
          onFocusedRow={setFocusedRowId}
        />
      ))}
    </div>
  )
}

function containsDirectoryEntry(
  entries: WorkspaceDirectoryEntry[],
  path: string,
): boolean {
  return entries.some((entry) => entry.path === path || path.startsWith(`${entry.path}/`))
}
