import { listUnmappedActivities } from '../../../../services/live-graph/index.js'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import styles from './LiveGraphUnmappedRail.module.css'

/** Shows Agent file/command activity that is not on the current C4 graph. */
export default function LiveGraphUnmappedRail() {
  const { ts } = useI18n()
  const overlay = useWorkbenchStore((s) => s.executionOverlay)
  const items = listUnmappedActivities(overlay)
  if (items.length === 0) return null

  return (
    <aside className={styles.rail} aria-label={ts('map.liveGraph.unmappedTitle')}>
      <header className={styles.header}>
        <span className={styles.title}>{ts('map.liveGraph.unmappedTitle')}</span>
        <span className={styles.count}>{items.length}</span>
      </header>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={styles.item} data-live-kind={item.kind}>
            <span className={styles.kind}>{ts(`map.liveGraph.kind.${item.kind}`)}</span>
            <span className={styles.label} title={item.path ?? item.label}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
