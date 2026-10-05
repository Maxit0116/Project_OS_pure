import { useEffect, useRef, useState } from 'react'
import type { MapArtifactType } from '@contracts/index'
import { useI18n } from '../../i18n'
import Button from '../ui/Button'
import { GlassLens } from '../Glass'
import { MAP_CREATE_ARTIFACT_ACTIONS } from './mapCreateActions'
import styles from './MapArtifactTitleDialog.module.css'

interface Props {
  mode: 'create' | 'rename'
  artifactType: MapArtifactType
  initialTitle?: string
  onConfirm: (title: string | undefined) => void
  onCancel: () => void
}

export default function MapArtifactTitleDialog({
  mode,
  artifactType,
  initialTitle = '',
  onConfirm,
  onCancel,
}: Props) {
  const { ts } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(initialTitle)

  const typeLabel =
    MAP_CREATE_ARTIFACT_ACTIONS.find((action) => action.type === artifactType)?.labelKey ??
    'mapArtifacts.addNote'

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  const submit = () => {
    const trimmed = value.trim()
    onConfirm(trimmed.length > 0 ? trimmed : undefined)
  }

  const headingKey = mode === 'rename' ? 'map.renameFlow.title' : 'map.createFlow.title'
  const promptKey = mode === 'rename' ? 'map.renameFlow.prompt' : 'map.createFlow.prompt'
  const confirmKey = mode === 'rename' ? 'map.renameFlow.confirm' : 'map.createFlow.confirm'

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="map-artifact-title-dialog-heading"
      data-zone-interactive
    >
      <button
        type="button"
        className={styles.backdrop}
        onClick={onCancel}
        aria-label={ts('common.close')}
      />
      <GlassLens radius={20} tint="overlay" className={styles.panel}>
        <div className={styles.panelInner}>
          <div className={styles.header}>
            <h2 id="map-artifact-title-dialog-heading" className={styles.title}>
              {ts(headingKey)}
            </h2>
            <p className={styles.prompt}>
              {ts(promptKey, { type: ts(typeLabel) })}
            </p>
          </div>
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            value={value}
            placeholder={ts('map.createFlow.inputPlaceholder')}
            aria-label={ts('map.createFlow.inputPlaceholder')}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
          />
          <div className={styles.actions}>
            {mode === 'create' ? (
              <Button variant="secondary" size="sm" onClick={() => onConfirm(undefined)}>
                {ts('common.skip')}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={onCancel}>
                {ts('common.close')}
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={submit}>
              {ts(confirmKey)}
            </Button>
          </div>
        </div>
      </GlassLens>
    </div>
  )
}
