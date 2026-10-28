import { useI18n } from '../../i18n'
import { isDesktopApp, isMacElectronShell } from '../../data/clientMode'
import { useWorkbenchStore, type ChatModeSwitchPreference } from '../../state/workbenchStore'
import type { KeepAwakeMode } from '@contracts/keep-awake'
import PresentationModeToggle from './PresentationModeToggle'
import styles from './SettingsPanel.module.css'

export default function GeneralSettingsSection() {
  const settings = useWorkbenchStore((s) => s.settings)
  const updateSettings = useWorkbenchStore((s) => s.updateSettings)
  const chatModeSwitch = useWorkbenchStore((s) => s.chatModeSwitch)
  const setChatModeSwitch = useWorkbenchStore((s) => s.setChatModeSwitch)
  const keepAwakeMode = useWorkbenchStore((s) => s.keepAwakeMode)
  const keepAwakeStatus = useWorkbenchStore((s) => s.keepAwakeStatus)
  const setKeepAwakeMode = useWorkbenchStore((s) => s.setKeepAwakeMode)
  const { ts } = useI18n()

  if (!settings) return null

  const showKeepAwake = isDesktopApp() && isMacElectronShell()

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
          <option value="same_session">{ts('settings.chatModeSwitchSameSession')}</option>
          <option value="new_session">{ts('settings.chatModeSwitchNewSession')}</option>
        </select>
      </label>
      {showKeepAwake && (
        <label className={styles.field}>
          <span className={styles.label}>{ts('settings.keepAwake')}</span>
          <span className={styles.help}>{ts('settings.keepAwakeDesc')}</span>
          <select
            className={styles.select}
            value={keepAwakeMode}
            onChange={(e) => void setKeepAwakeMode(e.target.value as KeepAwakeMode)}
          >
            <option value="off">{ts('settings.keepAwakeOff')}</option>
            <option value="while_agents_running">{ts('settings.keepAwakeWhileAgents')}</option>
            <option value="while_app_open">{ts('settings.keepAwakeWhileApp')}</option>
          </select>
          {keepAwakeMode !== 'off' && (
            <span className={styles.help}>
              {keepAwakeStatus?.lidGuardActive
                ? ts('settings.keepAwakeStatusLidOn')
                : keepAwakeStatus?.idleBlocked
                  ? ts('settings.keepAwakeStatusIdleOnly')
                  : keepAwakeStatus?.lastError
                    ? ts('settings.keepAwakeStatusError', { error: keepAwakeStatus.lastError })
                    : ts('settings.keepAwakeStatusWaiting')}
            </span>
          )}
          {keepAwakeMode !== 'off' && (
            <span className={styles.help}>{ts('settings.keepAwakeThermalNote')}</span>
          )}
        </label>
      )}
    </section>
  )
}
