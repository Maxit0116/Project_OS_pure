import { useState } from 'react'
import type { ExecCommand } from '@contracts/index'
import { useI18n } from '../../i18n'
import { isDesktopApp, isMacElectronShell } from '../../data/clientMode'
import { useWorkbenchStore, type ChatModeSwitchPreference } from '../../state/workbenchStore'
import type { KeepAwakeMode } from '@contracts/keep-awake'
import Button from '../ui/Button'
import PresentationModeToggle from './PresentationModeToggle'
import SettingsGroup from './SettingsGroup'
import SettingsRow from './SettingsRow'
import styles from './SettingsPanel.module.css'

const DEFAULT_VERIFY_COMMAND: ExecCommand = {
  command: 'npx',
  args: ['tsc', '--noEmit'],
  timeoutMs: 120_000,
}

export default function GeneralSettingsSection() {
  const settings = useWorkbenchStore((s) => s.settings)
  const updateSettings = useWorkbenchStore((s) => s.updateSettings)
  const chatModeSwitch = useWorkbenchStore((s) => s.chatModeSwitch)
  const setChatModeSwitch = useWorkbenchStore((s) => s.setChatModeSwitch)
  const keepAwakeMode = useWorkbenchStore((s) => s.keepAwakeMode)
  const keepAwakeStatus = useWorkbenchStore((s) => s.keepAwakeStatus)
  const setKeepAwakeMode = useWorkbenchStore((s) => s.setKeepAwakeMode)
  const { ts } = useI18n()
  const [verifyError, setVerifyError] = useState<string | null>(null)

  if (!settings) return null

  const showKeepAwake = isDesktopApp() && isMacElectronShell()
  const verificationCommands = settings.verification?.commands ?? []

  const saveVerificationCommands = async (commands: ExecCommand[]) => {
    setVerifyError(null)
    try {
      for (const entry of commands) {
        if (!entry.command.trim()) {
          setVerifyError(ts('settings.verificationCommandRequired'))
          return
        }
        if (entry.timeoutMs < 100 || entry.timeoutMs > 300_000) {
          setVerifyError(ts('settings.verificationTimeoutInvalid'))
          return
        }
      }
      await updateSettings({
        verification: { commands },
      })
    } catch (error) {
      setVerifyError(error instanceof Error ? error.message : String(error))
    }
  }

  const keepAwakeStatusText =
    keepAwakeMode === 'off'
      ? null
      : keepAwakeStatus?.lidGuardActive
        ? ts('settings.keepAwakeStatusLidOn')
        : keepAwakeStatus?.idleBlocked
          ? ts('settings.keepAwakeStatusIdleOnly')
          : keepAwakeStatus?.lastError
            ? ts('settings.keepAwakeStatusError', { error: keepAwakeStatus.lastError })
            : ts('settings.keepAwakeStatusWaiting')

  return (
    <section className={styles.section}>
      <SettingsGroup label={ts('settings.groups.presentation')}>
        <PresentationModeToggle
          checked={settings.presentationMode}
          label={ts('settings.presentationMode')}
          description={ts('settings.presentationModeDesc')}
          onChange={(checked) => void updateSettings({ presentationMode: checked })}
        />
      </SettingsGroup>

      <SettingsGroup label={ts('settings.groups.execution')}>
        <SettingsRow title={ts('settings.executionMode')}>
          <select
            className={styles.inlineSelect}
            value={settings.execution.mode}
            aria-label={ts('settings.executionMode')}
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
        </SettingsRow>
        <SettingsRow
          title={ts('settings.changeExecutionPolicy')}
          description={ts('settings.changeExecutionPolicyDesc')}
        >
          <select
            className={styles.inlineSelect}
            value={settings.execution.changeExecutionPolicy}
            aria-label={ts('settings.changeExecutionPolicy')}
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
        </SettingsRow>
        <SettingsRow
          title={ts('settings.chatModeSwitch')}
          description={ts('settings.chatModeSwitchDesc')}
        >
          <select
            className={styles.inlineSelect}
            value={chatModeSwitch}
            aria-label={ts('settings.chatModeSwitch')}
            onChange={(e) =>
              setChatModeSwitch(e.target.value as ChatModeSwitchPreference)
            }
          >
            <option value="same_session">{ts('settings.chatModeSwitchSameSession')}</option>
            <option value="new_session">{ts('settings.chatModeSwitchNewSession')}</option>
          </select>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup label={ts('settings.groups.verification')}>
        <p className={styles.help}>{ts('settings.verificationHelp')}</p>
        {verifyError && <p className={styles.formError}>{verifyError}</p>}
        {verificationCommands.length === 0 ? (
          <p className={styles.help}>{ts('settings.verificationEmpty')}</p>
        ) : (
          <div className={styles.list}>
            {verificationCommands.map((entry, index) => (
              <div className={styles.row} key={`verify-${index}`}>
                <div className={styles.formGrid} style={{ flex: 1 }}>
                  <label className={styles.field}>
                    <span className={styles.label}>{ts('settings.verificationCommand')}</span>
                    <input
                      className={styles.select}
                      value={entry.command}
                      aria-label={ts('settings.verificationCommand')}
                      onChange={(event) => {
                        const next = verificationCommands.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, command: event.target.value }
                            : item,
                        )
                        void saveVerificationCommands(next)
                      }}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>{ts('settings.verificationArgs')}</span>
                    <input
                      className={styles.select}
                      value={entry.args.join(' ')}
                      aria-label={ts('settings.verificationArgs')}
                      onChange={(event) => {
                        const args = event.target.value
                          .split(/\s+/u)
                          .map((part) => part.trim())
                          .filter(Boolean)
                        const next = verificationCommands.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, args } : item,
                        )
                        void saveVerificationCommands(next)
                      }}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>{ts('settings.verificationTimeout')}</span>
                    <input
                      className={styles.select}
                      type="number"
                      min={100}
                      max={300000}
                      value={entry.timeoutMs}
                      aria-label={ts('settings.verificationTimeout')}
                      onChange={(event) => {
                        const timeoutMs = Number(event.target.value)
                        const next = verificationCommands.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                timeoutMs: Number.isFinite(timeoutMs)
                                  ? Math.trunc(timeoutMs)
                                  : item.timeoutMs,
                              }
                            : item,
                        )
                        void saveVerificationCommands(next)
                      }}
                    />
                  </label>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void saveVerificationCommands(
                      verificationCommands.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }}
                >
                  {ts('settings.verificationRemove')}
                </Button>
              </div>
            ))}
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={verificationCommands.length >= 10}
          onClick={() => {
            void saveVerificationCommands([
              ...verificationCommands,
              { ...DEFAULT_VERIFY_COMMAND },
            ])
          }}
        >
          {ts('settings.verificationAdd')}
        </Button>
      </SettingsGroup>

      {showKeepAwake && (
        <SettingsGroup label={ts('settings.groups.power')}>
          <SettingsRow
            title={ts('settings.keepAwake')}
            description={ts('settings.keepAwakeDesc')}
          >
            <select
              className={styles.inlineSelect}
              value={keepAwakeMode}
              aria-label={ts('settings.keepAwake')}
              onChange={(e) => void setKeepAwakeMode(e.target.value as KeepAwakeMode)}
            >
              <option value="off">{ts('settings.keepAwakeOff')}</option>
              <option value="while_agents_running">{ts('settings.keepAwakeWhileAgents')}</option>
              <option value="while_app_open">{ts('settings.keepAwakeWhileApp')}</option>
            </select>
          </SettingsRow>
          {keepAwakeMode !== 'off' && keepAwakeStatusText && (
            <div className={styles.settingRow}>
              <p className={styles.help}>{keepAwakeStatusText}</p>
            </div>
          )}
          {keepAwakeMode !== 'off' && (
            <div className={styles.settingRow}>
              <p className={styles.help}>{ts('settings.keepAwakeThermalNote')}</p>
            </div>
          )}
        </SettingsGroup>
      )}
    </section>
  )
}
