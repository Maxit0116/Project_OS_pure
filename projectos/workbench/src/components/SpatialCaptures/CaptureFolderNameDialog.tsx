import { useEffect, useId, useState } from 'react'
import { useI18n } from '../../i18n'
import Checkbox from '../ui/Checkbox'
import TextInput from '../ui/TextInput'
import styles from './CaptureFolderNameDialog.module.css'

export type CaptureNamePromptKind = 'merge_misc' | 'new_folder' | 'merge_folders'

export interface CaptureNamePromptState {
  kind: CaptureNamePromptKind
  defaultName: string
  sourceName?: string
  targetName?: string
  /** When merging misc, offer to keep original capture titles. */
  allowKeepTitles?: boolean
}

interface Props {
  prompt: CaptureNamePromptState
  onCancel: () => void
  onConfirm: (result: { name: string; keepTitles: boolean }) => void
}

export default function CaptureFolderNameDialog({
  prompt,
  onCancel,
  onConfirm,
}: Props) {
  const { ts } = useI18n()
  const titleId = useId()
  const [name, setName] = useState(prompt.defaultName)
  const [keepTitles, setKeepTitles] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(prompt.defaultName)
    setKeepTitles(true)
    setError(null)
  }, [prompt])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const title =
    prompt.kind === 'merge_folders'
      ? ts('spatialCaptures.dragMergeFoldersTitle')
      : prompt.kind === 'new_folder'
        ? ts('spatialCaptures.dragNewFolderTitle')
        : ts('spatialCaptures.dragMergeMiscTitle')

  const hint =
    prompt.kind === 'merge_folders'
      ? ts('spatialCaptures.dragMergeFoldersHint')
      : prompt.kind === 'new_folder'
        ? ts('spatialCaptures.dragNewFolderHint')
        : ts('spatialCaptures.dragMergeMiscHint')

  return (
    <div className={styles.backdrop} role="presentation" onClick={onCancel}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id={titleId} className={styles.title}>
          {title}
        </h3>
        <p className={styles.hint}>{hint}</p>
        <TextInput
          fieldClassName={styles.field}
          label={ts('spatialCaptures.folderNamePlaceholder')}
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              const trimmed = name.trim()
              if (!trimmed) {
                setError(ts('spatialCaptures.folderNameRequired'))
                return
              }
              onConfirm({ name: trimmed, keepTitles })
            }
          }}
        />
        {prompt.kind === 'merge_folders' &&
        (prompt.sourceName || prompt.targetName) ? (
          <div className={styles.presets}>
            {prompt.targetName ? (
              <button
                type="button"
                className={styles.preset}
                onClick={() => setName(prompt.targetName!)}
              >
                {ts('spatialCaptures.dragKeepName').replace(
                  '{name}',
                  prompt.targetName,
                )}
              </button>
            ) : null}
            {prompt.sourceName && prompt.sourceName !== prompt.targetName ? (
              <button
                type="button"
                className={styles.preset}
                onClick={() => setName(prompt.sourceName!)}
              >
                {ts('spatialCaptures.dragUseName').replace(
                  '{name}',
                  prompt.sourceName,
                )}
              </button>
            ) : null}
          </div>
        ) : null}
        {prompt.allowKeepTitles ? (
          <Checkbox
            className={styles.checkRow}
            checked={keepTitles}
            onCheckedChange={setKeepTitles}
            label={ts('spatialCaptures.dragKeepTitles')}
          />
        ) : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={onCancel}>
            {ts('common.cancel')}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.primary}`}
            onClick={() => {
              const trimmed = name.trim()
              if (!trimmed) {
                setError(ts('spatialCaptures.folderNameRequired'))
                return
              }
              onConfirm({ name: trimmed, keepTitles })
            }}
          >
            {ts('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
