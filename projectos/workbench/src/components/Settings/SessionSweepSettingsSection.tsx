import type { AffinityMode } from '@contracts/index'
import { AFFINITY_LLM_DAILY_BUDGET } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useSessionRouteStore } from '../../state/sessionRouteStore'
import { useSessionSweepStore } from '../../state/sessionSweepStore'
import { localDateKey, syncAffinityLlmBudgetDay } from '../../preferences/sessionSweep'
import Button from '../ui/Button'
import PresentationModeToggle from './PresentationModeToggle'
import SettingsGroup from './SettingsGroup'
import SettingsRow from './SettingsRow'
import styles from './SettingsPanel.module.css'

const AFFINITY_MODES: AffinityMode[] = ['off', 'balanced', 'accurate']

export default function SessionSweepSettingsSection() {
  const { ts } = useI18n()
  const preferences = useSessionSweepStore((s) => s.preferences)
  const runtime = useSessionSweepStore((s) => s.runtime)
  const setPreferences = useSessionSweepStore((s) => s.setPreferences)
  const runHygieneCheck = useSessionSweepStore((s) => s.runHygieneCheck)
  const openSweepReview = useSessionSweepStore((s) => s.openSweepReview)
  const openTidyReview = useSessionSweepStore((s) => s.openTidyReview)
  const pendingPlan = useSessionSweepStore((s) => s.pendingPlan)
  const pendingTidyPlan = useSessionSweepStore((s) => s.pendingTidyPlan)
  const routePreferences = useSessionRouteStore((s) => s.preferences)
  const setRoutePreferences = useSessionRouteStore((s) => s.setPreferences)

  const synced = syncAffinityLlmBudgetDay(runtime, localDateKey())
  const budget = AFFINITY_LLM_DAILY_BUDGET[preferences.affinityMode]

  return (
    <>
      <SettingsGroup label={ts('settings.sessionAffinity.group')}>
        <SettingsRow
          title={ts('settings.sessionAffinity.mode')}
          description={ts(`settings.sessionAffinity.modeDesc.${preferences.affinityMode}`)}
        >
          <div
            className={styles.affinityModeRow}
            role="tablist"
            aria-label={ts('settings.sessionAffinity.mode')}
          >
            {AFFINITY_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={preferences.affinityMode === mode}
                className={`${styles.affinityModeChip} ${
                  preferences.affinityMode === mode ? styles.affinityModeChipActive : ''
                }`}
                onClick={() => setPreferences({ affinityMode: mode })}
              >
                {ts(`settings.sessionAffinity.modes.${mode}`)}
              </button>
            ))}
          </div>
        </SettingsRow>
        {preferences.affinityMode !== 'off' ? (
          <p className={styles.affinityBudget}>
            {ts('settings.sessionAffinity.callsToday', {
              used: synced.affinityLlmCallsToday,
              budget,
            })}
          </p>
        ) : null}
      </SettingsGroup>

      <SettingsGroup label={ts('settings.sessionRoute.group')}>
        <PresentationModeToggle
          checked={routePreferences.enabled}
          label={ts('settings.sessionRoute.enabled')}
          description={ts('settings.sessionRoute.enabledDesc')}
          onChange={(enabled) => setRoutePreferences({ enabled })}
        />
        <PresentationModeToggle
          checked={routePreferences.autoApplyHighConfidence}
          label={ts('settings.sessionRoute.autoApply')}
          description={ts('settings.sessionRoute.autoApplyDesc')}
          onChange={(autoApplyHighConfidence) =>
            setRoutePreferences({ autoApplyHighConfidence })
          }
        />
      </SettingsGroup>

      <SettingsGroup label={ts('settings.sessionSweep.group')}>
        <PresentationModeToggle
          checked={preferences.enabled}
          label={ts('settings.sessionSweep.enabled')}
          description={ts('settings.sessionSweep.enabledDesc')}
          onChange={(enabled) => setPreferences({ enabled })}
        />
        <PresentationModeToggle
          checked={preferences.notifyEnabled}
          label={ts('settings.sessionSweep.notify')}
          description={ts('settings.sessionSweep.notifyDesc')}
          onChange={(notifyEnabled) => setPreferences({ notifyEnabled })}
        />
        <SettingsRow
          title={ts('settings.sessionSweep.dailyTime')}
          description={ts('settings.sessionSweep.dailyTimeDesc')}
        >
          <input
            className={styles.select}
            type="time"
            value={preferences.dailyTime}
            onChange={(event) => setPreferences({ dailyTime: event.target.value })}
            aria-label={ts('settings.sessionSweep.dailyTime')}
          />
        </SettingsRow>
        <SettingsRow
          title={ts('settings.sessionSweep.snoozeDays')}
          description={ts('settings.sessionSweep.snoozeDaysDesc')}
        >
          <input
            className={styles.select}
            type="number"
            min={1}
            max={90}
            value={preferences.snoozeDays}
            onChange={(event) =>
              setPreferences({ snoozeDays: Number(event.target.value) || 3 })
            }
            aria-label={ts('settings.sessionSweep.snoozeDays')}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup label={ts('settings.sessionTidy.group')}>
        <PresentationModeToggle
          checked={preferences.tidyEnabled}
          label={ts('settings.sessionTidy.enabled')}
          description={ts('settings.sessionTidy.enabledDesc')}
          onChange={(tidyEnabled) => setPreferences({ tidyEnabled })}
        />
        <PresentationModeToggle
          checked={preferences.tidyNotifyEnabled}
          label={ts('settings.sessionTidy.notify')}
          description={ts('settings.sessionTidy.notifyDesc')}
          onChange={(tidyNotifyEnabled) => setPreferences({ tidyNotifyEnabled })}
        />
        <PresentationModeToggle
          checked={preferences.allowAbsorb}
          label={ts('settings.sessionTidy.allowAbsorb')}
          description={ts('settings.sessionTidy.allowAbsorbDesc')}
          onChange={(allowAbsorb) => setPreferences({ allowAbsorb })}
        />
        <SettingsRow
          title={ts('settings.sessionTidy.runNow')}
          description={ts('settings.sessionTidy.runNowDesc')}
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void runHygieneCheck({ force: true, notify: true }).then(({ tidy, sweep }) => {
                if (tidy && tidy.clusters.length > 0) openTidyReview()
                else if (sweep && sweep.candidates.length > 0) openSweepReview()
              })
            }}
          >
            {pendingTidyPlan?.clusters.length
              ? ts('settings.sessionTidy.openPending', {
                  count: pendingTidyPlan.clusters.length,
                })
              : pendingPlan?.candidates.length
                ? ts('settings.sessionSweep.openPending', {
                    count: pendingPlan.candidates.length,
                  })
                : ts('settings.sessionTidy.scanNow')}
          </Button>
        </SettingsRow>
      </SettingsGroup>
    </>
  )
}
