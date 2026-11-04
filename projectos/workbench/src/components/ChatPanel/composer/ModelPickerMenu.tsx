import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check, Search, Settings2 } from 'lucide-react'
import { modelProfileLabel, type ExecutorOption, type ModelProfile } from '@contracts/index'
import { useI18n } from '../../../i18n'
import styles from './ComposerControlBar.module.css'

interface Props {
  profiles: ModelProfile[]
  selectedId: string | null
  pending: boolean
  onSelect: (id: string) => void
  onManage: () => void
  /** Registered agent runtimes; omitted or empty in a production build. */
  runtimes?: ExecutorOption[]
  selectedRuntimeId?: string | null
  onSelectRuntime?: (executorId: string | null) => void
}

export function filterModelProfiles(profiles: ModelProfile[], query: string): ModelProfile[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  return profiles.filter((profile) => {
    const text = `${modelProfileLabel(profile)} ${profile.name} ${profile.provider} ${profile.model}`.toLocaleLowerCase()
    return words.every((word) => text.includes(word))
  })
}

export default function ModelPickerMenu({
  profiles, selectedId, pending, onSelect, onManage,
  runtimes = [], selectedRuntimeId = null, onSelectRuntime,
}: Props) {
  const { ts } = useI18n()
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const filtered = filterModelProfiles(profiles, query)

  const moveFocus = (event: KeyboardEvent, fromSearch = false) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const options = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    if (!options.length) return
    event.preventDefault()
    const current = options.indexOf(document.activeElement as HTMLButtonElement)
    const next = fromSearch ? (event.key === 'ArrowDown' ? 0 : options.length - 1)
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
    options[next]?.focus()
  }

  return (
    <>
      <label className={styles.modelSearch}>
        <Search size={14} aria-hidden />
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => moveFocus(event, true)}
          aria-label={ts('composer.searchModels')}
          aria-controls={listId}
          placeholder={ts('composer.searchModels')}
        />
      </label>
      <div className={styles.modelList} ref={listRef} id={listId} role="group" aria-label={ts('composer.modelSection')} onKeyDown={(event) => moveFocus(event)} aria-busy={pending}>
        {filtered.map((profile) => (
          <button
            key={profile.id}
            type="button"
            className={`${styles.menuItem} ${profile.id === selectedId ? styles.menuItemActive : ''}`}
            aria-pressed={profile.id === selectedId}
            disabled={pending}
            onClick={() => onSelect(profile.id)}
          >
            <span className={styles.modelCopy}>
              <span>{modelProfileLabel(profile)}</span>
              <span className={styles.modelDetail}>{profile.provider} · {profile.model}</span>
            </span>
            {profile.id === selectedId && <Check size={14} className={styles.modelCheck} aria-hidden />}
          </button>
        ))}
        {filtered.length === 0 && <p className={styles.modelEmpty} role="status">{ts('composer.noModelsFound')}</p>}
      </div>
      {runtimes.length > 0 && onSelectRuntime && (
        <div role="group" aria-label={ts('composer.runtimeSection')}>
          <div className={styles.sectionDivider} />
          <div className={styles.sectionLabel}>{ts('composer.runtimeSection')}</div>
          {runtimes.map((runtime) => {
            const active = runtime.executorId === selectedRuntimeId
            return (
              <button
                key={runtime.executorId}
                type="button"
                className={`${styles.menuItem} ${active ? styles.menuItemActive : ''}`}
                aria-pressed={active}
                onClick={() => onSelectRuntime(active ? null : runtime.executorId)}
              >
                <span className={styles.modelCopy}>
                  <span>{runtime.label}</span>
                </span>
                {active && <Check size={14} className={styles.modelCheck} aria-hidden />}
              </button>
            )
          })}
          <p className={styles.modelHint}>{ts('composer.runtimeHelp')}</p>
        </div>
      )}
      <p className={styles.modelHint} role={pending ? 'status' : undefined}>
        {ts(pending ? 'composer.savingModel' : 'composer.modelChoiceHelp')}
      </p>
      <button type="button" className={styles.menuItem} onClick={onManage} disabled={pending}>
        <Settings2 size={14} aria-hidden />{ts('composer.manageModels')}
      </button>
    </>
  )
}
