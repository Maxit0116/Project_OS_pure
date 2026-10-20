import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import styles from './LiveGraphFocusChip.module.css'

/** Clears Phase 2 Focus Task when active. */
export default function LiveGraphFocusChip() {
  const { ts } = useI18n()
  const focusTaskId = useWorkbenchStore((s) => s.liveGraphFocusTaskId)
  const clearFocus = useWorkbenchStore((s) => s.setLiveGraphFocusTask)
  if (!focusTaskId) return null

  return (
    <div className={styles.chip} role="status">
      <span className={styles.label}>
        {ts('map.liveGraph.focusActive', { task: focusTaskId })}
      </span>
      <button
        type="button"
        className={`${styles.clear} tech-focus`}
        onClick={() => clearFocus(null)}
      >
        {ts('map.liveGraph.clearFocus')}
      </button>
    </div>
  )
}
