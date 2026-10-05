import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import type { ThemePreference } from '../../styles/theme'
import styles from './SettingsPanel.module.css'

const THEMES: ThemePreference[] = ['system', 'dark', 'light']

export default function ThemeSettingsSection() {
  const themePreference = useWorkbenchStore((s) => s.themePreference)
  const setThemePreference = useWorkbenchStore((s) => s.setThemePreference)
  const { ts } = useI18n()

  return (
    <section className={styles.section}>
      <p className={styles.help}>{ts('settings.themeDesc')}</p>
      <div className={styles.optionGroup} role="radiogroup" aria-label={ts('settings.theme')}>
        {THEMES.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={themePreference === value}
            className={`${styles.optionBtn} ${themePreference === value ? styles.optionActive : ''}`}
            onClick={() => setThemePreference(value)}
          >
            {ts(`settings.themeOptions.${value}`)}
          </button>
        ))}
      </div>
    </section>
  )
}
