import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import PresentationModeToggle from './PresentationModeToggle'
import styles from './SettingsPanel.module.css'

export default function NotificationSettingsSection() {
  const notifyOnDiffReady = useWorkbenchStore((s) => s.notifyOnDiffReady)
  const setNotifyOnDiffReady = useWorkbenchStore((s) => s.setNotifyOnDiffReady)
  const notifyOnPendingDecision = useWorkbenchStore((s) => s.notifyOnPendingDecision)
  const setNotifyOnPendingDecision = useWorkbenchStore((s) => s.setNotifyOnPendingDecision)
  const { ts } = useI18n()

  return (
    <section className={styles.section}>
      <PresentationModeToggle
        checked={notifyOnDiffReady}
        label={ts('settings.notifyOnDiffReady')}
        description={ts('settings.notifyOnDiffReadyDesc')}
        onChange={setNotifyOnDiffReady}
      />
      <PresentationModeToggle
        checked={notifyOnPendingDecision}
        label={ts('settings.notifyOnPendingDecision')}
        description={ts('settings.notifyOnPendingDecisionDesc')}
        onChange={setNotifyOnPendingDecision}
      />
    </section>
  )
}
