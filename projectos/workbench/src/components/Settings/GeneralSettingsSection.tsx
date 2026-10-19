import { useI18n } from '../../i18n'
import { useWorkbenchStore, type ChatModeSwitchPreference } from '../../state/workbenchStore'
import PresentationModeToggle from './PresentationModeToggle'
import styles from './SettingsPanel.module.css'

export default function GeneralSettingsSection() {
  const settings = useWorkbenchStore((s) => s.settings)
  const updateSettings = useWorkbenchStore((s) => s.updateSettings)
  const chatModeSwitch = useWorkbenchStore((s) => s.chatModeSwitch)
  const setChatModeSwitch = useWorkbenchStore((s) => s.setChatModeSwitch)
  const { ts } = useI18n()

  if (!settings) return null

  return (
    <section className={styles.section}>
      <PresentationModeToggle
        checked={settings.presentationMode}
        label={ts('settings.presentationMode')}
        description={ts('settings.presentationModeDesc')}
        onChange={(checked) => void updateSettings({ presentationMode: checked })}
      />
      <label className={styles.field}>
        <span className={styles.label}>{ts('settings.executionMode')}</span>
        <select
          className={styles.select}
          value={settings.execution.mode}
          onChange={(e) =>
            void updateSettings({
              execution: {
                ...settings.execution,
                mode: e.target.value as typeof settings.execution.mode,
              },
            })
          }
        >
          <option value="auto">auto</option>
          <option value="fixture">fixture</option>
          <option value="model">model</option>
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>{ts('settings.changeExecutionPolicy')}</span>
        <span className={styles.help}>{ts('settings.changeExecutionPolicyDesc')}</span>
        <select
          className={styles.select}
          value={settings.execution.changeExecutionPolicy}
          onChange={(e) =>
            void updateSettings({
              execution: {
                ...settings.execution,
                changeExecutionPolicy: e.target.value as typeof settings.execution.changeExecutionPolicy,
              },
            })
          }
        >
          <option value="automatic">{ts('settings.changePolicyAutomatic')}</option>
          <option value="review_first">{ts('settings.changePolicyReviewFirst')}</option>
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>{ts('settings.chatModeSwitch')}</span>
        <span className={styles.help}>{ts('settings.chatModeSwitchDesc')}</span>
        <select
          className={styles.select}
          value={chatModeSwitch}
          onChange={(e) =>
            setChatModeSwitch(e.target.value as ChatModeSwitchPreference)
          }
        >
          <option value="new_session">{ts('settings.chatModeSwitchNewSession')}</option>
          <option value="same_session">{ts('settings.chatModeSwitchSameSession')}</option>
        </select>
      </label>
    </section>
  )
}
