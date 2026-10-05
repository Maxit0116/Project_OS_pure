import { Activity, AlertCircle, Server, Terminal } from 'lucide-react'
import { useBottomDockStore, type BottomDockView } from '../../state/bottomDockStore'
import { useI18n } from '../../i18n'
import styles from './BottomDockPanel.module.css'

const VIEWS: Array<{
  id: BottomDockView
  icon: typeof Terminal
}> = [
  { id: 'terminal', icon: Terminal },
  { id: 'activity', icon: Activity },
  { id: 'services', icon: Server },
  { id: 'diagnostics', icon: AlertCircle },
]

interface Props {
  onClosePanel?: () => void
}

export default function BottomDockViewTabs({ onClosePanel }: Props) {
  const activeView = useBottomDockStore((s) => s.activeView)
  const badgeCounts = useBottomDockStore((s) => s.badgeCounts)
  const setActiveView = useBottomDockStore((s) => s.setActiveView)
  const { ts } = useI18n()

  return (
    <div className={styles.viewTabs} role="tablist" aria-label={ts('bottomDock.title')}>
      <div className={styles.viewTabList}>
        {VIEWS.map(({ id, icon: Icon }) => {
          const badge = badgeCounts[id]
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeView === id}
              className={`${styles.viewTab} ${activeView === id ? styles.viewTabActive : ''}`}
              onClick={() => setActiveView(id)}
            >
              <Icon size={14} strokeWidth={1.75} aria-hidden />
              <span>{ts(`bottomDock.views.${id}` as 'bottomDock.views.terminal')}</span>
              {badge != null && badge > 0 ? (
                <span className={styles.viewBadge} aria-label={String(badge)}>
                  {badge > 99 ? '99+' : badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      {onClosePanel ? (
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClosePanel}
          aria-label={ts('bottomDock.closePanel')}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}
