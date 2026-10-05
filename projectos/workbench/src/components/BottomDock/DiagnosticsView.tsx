import { useDiagnosticsStore, type DiagnosticFilter, severityRank } from '../../state/diagnosticsStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { revealPosition } from '../CodeEditor/editorNavigation'
import { useI18n } from '../../i18n'
import styles from './DiagnosticsView.module.css'

const FILTERS: DiagnosticFilter[] = ['all', 'error', 'warning']

export default function DiagnosticsView() {
  const items = useDiagnosticsStore((s) => s.items)
  const filter = useDiagnosticsStore((s) => s.filter)
  const setFilter = useDiagnosticsStore((s) => s.setFilter)
  const selectFile = useWorkbenchStore((s) => s.selectFile)
  const { ts } = useI18n()

  const filtered =
    filter === 'all' ? items : items.filter((item) => item.severity === filter)

  const sorted = [...filtered].sort((a, b) => {
    const severityDiff = severityRank(a.severity) - severityRank(b.severity)
    if (severityDiff !== 0) return severityDiff
    if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath)
    return a.line - b.line
  })

  return (
    <div className={styles.diagnosticsView}>
      <div className={styles.toolbar}>
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            className={`${styles.filterBtn} ${filter === value ? styles.filterBtnActive : ''}`}
            onClick={() => setFilter(value)}
          >
            {value === 'all'
              ? ts('diagnostics.filterAll')
              : value === 'error'
                ? ts('diagnostics.filterErrors')
                : ts('diagnostics.filterWarnings')}
          </button>
        ))}
      </div>
      <div className={styles.list}>
        {sorted.length === 0 ? (
          <p className={styles.empty}>{ts('diagnostics.empty')}</p>
        ) : (
          sorted.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.row}
              onClick={() => {
                void selectFile(item.filePath).then(() => {
                  revealPosition(item.filePath, item.line, item.column)
                })
              }}
            >
              <span
                className={`${styles.severity} ${styles[`severity_${item.severity}`]}`}
                aria-hidden
              />
              <div>
                <div className={styles.message}>{item.message}</div>
                <div className={styles.location}>
                  {item.filePath}:{item.line}:{item.column}
                  {item.source ? ` · ${item.source}` : ''}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
