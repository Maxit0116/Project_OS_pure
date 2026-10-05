import type { DiffFileStat } from './diffFileStats'
import type { PendingChangesDrawerUndoMode } from '../../state/pendingChangesDrawer'
import { useI18n } from '../../i18n'
import { splitFilePath } from '../../utils/filePathDisplay'
import { resolveFileTypeIcon } from '../../utils/fileTypeIcon'
import Button from '../ui/Button'
import styles from './PendingChangesDrawer.module.css'

type Props = {
  files: DiffFileStat[]
  expanded: boolean
  undoMode: PendingChangesDrawerUndoMode
  undoLoading?: boolean
  onToggleExpanded: () => void
  onReview: () => void
  onReviewFile: (path: string) => void
  onUndoAll: () => void
}

function changeBadge(changeType: DiffFileStat['changeType']): string {
  switch (changeType) {
    case 'create':
      return 'A'
    case 'delete':
      return 'D'
    default:
      return 'M'
  }
}

export default function PendingChangesDrawer({
  files,
  expanded,
  undoMode,
  undoLoading = false,
  onToggleExpanded,
  onReview,
  onReviewFile,
  onUndoAll,
}: Props) {
  const { ts } = useI18n()

  return (
    <section
      className={styles.pendingChangesDrawer}
      aria-label={ts('pendingChanges.drawerLabel')}
      data-pending-changes-drawer=""
    >
      <div className={`${styles.header} ${expanded ? styles.headerExpanded : ''}`}>
        <button
          type="button"
          className={styles.filesToggle}
          onClick={onToggleExpanded}
          aria-expanded={expanded}
        >
          <span>{ts('pendingChanges.filesButton', { count: files.length })}</span>
          <span className={styles.chevron} aria-hidden>
            {expanded ? '▾' : '▴'}
          </span>
        </button>
        <div className={styles.headerActions}>
          <Button size="sm" onClick={onReview}>
            {ts('pendingChanges.review')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onUndoAll}
            disabled={undoLoading}
          >
            {undoMode === 'restore'
              ? ts('pendingChanges.undoRestore')
              : ts('pendingChanges.undoAll')}
          </Button>
        </div>
      </div>
      <div
        className={`${styles.fileList} ${expanded ? styles.fileListExpanded : ''}`}
        hidden={!expanded}
      >
        {files.map((file) => {
          const Icon = resolveFileTypeIcon(file.path)
          const { basename, dirname } = splitFilePath(file.path)
          return (
            <button
              key={file.path}
              type="button"
              className={styles.fileRow}
              onClick={() => onReviewFile(file.path)}
            >
              <span className={styles.changeBadge} aria-hidden>
                {changeBadge(file.changeType)}
              </span>
              <Icon className={styles.fileIcon} size={14} strokeWidth={1.75} aria-hidden />
              <span className={styles.fileMeta}>
                <span className={styles.fileBasename}>{basename}</span>
                {dirname ? <span className={styles.fileDirname}>{dirname}</span> : null}
              </span>
              <span className={styles.fileStats}>
                {file.added > 0 ? (
                  <span className={styles.statsAdded}>+{file.added}</span>
                ) : null}
                {file.added > 0 && file.removed > 0 ? ' ' : null}
                {file.removed > 0 ? (
                  <span className={styles.statsRemoved}>-{file.removed}</span>
                ) : null}
                {file.added === 0 && file.removed === 0 ? (
                  <span className={styles.statsRemoved}>0</span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
