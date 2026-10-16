import { Fragment } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useFunctionMap } from './FunctionMapContext'
import styles from './FunctionMap.module.css'

interface Props {
  showScopeLabel?: boolean
}

export default function FunctionMapLevelNavigator({ showScopeLabel = false }: Props) {
  const {
    architectureLevel,
    architectureLevels,
    setArchitectureLevel,
    architectureBreadcrumbs,
    architectureViewsForLevel,
    activeViewKey,
    setActiveViewKey,
    activeViewTitle,
    drillOut,
  } = useFunctionMap()
  const { ts } = useI18n()

  if (architectureLevels.length === 0) return null

  // Always expose Code when available — classic C4 is a four-step zoom.
  const guidedLevels = architectureLevels
  const activeStepLevel = architectureLevel
  const currentScope = architectureBreadcrumbs.at(-1)
  const breadcrumbTitle = [
    ...architectureBreadcrumbs.map((node) => node.name),
    ...(activeViewTitle ? [activeViewTitle] : []),
  ].join(' › ')

  return (
    <div className={styles.levelNavigator} data-tour="architecture-levels" data-zone-interactive>
      {architectureBreadcrumbs.length > 0 && (
        <button
          type="button"
          className={styles.levelBack}
          onClick={drillOut}
          title={breadcrumbTitle}
          aria-label={ts('map.backOneLevel')}
        >
          <ArrowLeft size={12} aria-hidden />
        </button>
      )}
      {showScopeLabel && currentScope && (
        <span className={styles.scopeLabel} title={breadcrumbTitle}>
          {ts('map.currentGraph', { name: currentScope.name })}
        </span>
      )}
      <div className={styles.levelSwitch} role="tablist" aria-label={ts('map.levelSwitcher')}>
        {guidedLevels.map((level, index) => (
          <Fragment key={level}>
            {index > 0 && (
              <span className={styles.levelSeparator} aria-hidden>
                &gt;
              </span>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={activeStepLevel === level}
              className={`${styles.levelButton} ${activeStepLevel === level ? styles.levelButtonActive : ''}`}
              onClick={() => {
                if (level !== architectureLevel) setArchitectureLevel(level)
              }}
              title={ts(`map.levelDescriptions.${level}`)}
            >
              {ts(`map.levels.${level}`)}
            </button>
          </Fragment>
        ))}
      </div>
      {architectureViewsForLevel.length > 1 && (
        <label className={styles.viewSelectLabel}>
          <span className={styles.viewSelectCaption}>{ts('map.viewSwitcher')}</span>
          <select
            className={styles.viewSelect}
            value={activeViewKey ?? architectureViewsForLevel[0]?.key ?? ''}
            onChange={(event) => {
              const key = event.target.value
              setActiveViewKey(key || null)
            }}
            aria-label={ts('map.viewSwitcher')}
          >
            {architectureViewsForLevel.map((view) => (
              <option key={view.key} value={view.key}>
                {view.title}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
