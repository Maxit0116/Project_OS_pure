import { useI18n } from '../../i18n'
import type { Locale } from '../../i18n/types'
import { useWorkbenchStore } from '../../state/workbenchStore'
import styles from './SettingsPanel.module.css'

const LOCALES: Locale[] = ['zh', 'en']

export default function LanguageSettingsSection() {
  const locale = useWorkbenchStore((s) => s.locale)
  const setLocale = useWorkbenchStore((s) => s.setLocale)
  const { ts } = useI18n()

  return (
    <section className={styles.section}>
      <p className={styles.help}>{ts('settings.languageDesc')}</p>
      <div className={styles.optionGroup} role="radiogroup" aria-label={ts('settings.language')}>
        {LOCALES.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={locale === value}
            className={`${styles.optionBtn} ${locale === value ? styles.optionActive : ''}`}
            onClick={() => setLocale(value)}
          >
            {ts(`settings.languageOptions.${value}`)}
          </button>
        ))}
      </div>
    </section>
  )
}
