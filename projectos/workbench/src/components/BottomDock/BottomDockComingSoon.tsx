import { useI18n } from '../../i18n'
import type { BottomDockView } from '../../state/bottomDockStore'
import styles from './BottomDockPanel.module.css'

interface Props {
  view: Exclude<BottomDockView, 'terminal'>
}

export default function BottomDockComingSoon({ view }: Props) {
  const { ts } = useI18n()

  return (
    <div className={styles.comingSoon}>
      <p className={styles.comingSoonTitle}>
        {ts(`bottomDock.views.${view}` as 'bottomDock.views.activity')}
      </p>
      <p className={styles.comingSoonHint}>{ts('bottomDock.comingSoon')}</p>
    </div>
  )
}
