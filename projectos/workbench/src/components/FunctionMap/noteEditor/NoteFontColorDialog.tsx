import { useCallback, useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useI18n } from '../../../i18n'
import Button from '../../ui/Button'
import { GlassLens } from '../../Glass'
import styles from './noteEditor.module.css'
import {
  NOTE_FONT_COLOR_PRESETS,
  resolveCssTokenColor,
  type NoteFontColorPresetId,
} from './noteFontColors'
import { applyTextColor, collapseEditorSelection, getSelectionPreviewText } from './noteSelectionUtils'

interface Props {
  editor: Editor
  onClose: () => void
}

export default function NoteFontColorDialog({ editor, onClose }: Props) {
  const { ts } = useI18n()
  const [selectedPresetId, setSelectedPresetId] = useState<NoteFontColorPresetId | null>(null)
  const previewText = getSelectionPreviewText(editor)

  const closeDialog = useCallback(() => {
    collapseEditorSelection(editor)
    onClose()
  }, [editor, onClose])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDialog()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeDialog])

  const handleConfirm = () => {
    if (!selectedPresetId) {
      closeDialog()
      return
    }
    const preset = NOTE_FONT_COLOR_PRESETS.find((entry) => entry.id === selectedPresetId)
    if (!preset) {
      closeDialog()
      return
    }
    applyTextColor(editor, resolveCssTokenColor(preset.token))
    onClose()
  }

  return (
    <div
      className={styles.colorDialogOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-font-color-dialog-heading"
      data-zone-interactive
    >
      <button
        type="button"
        className={styles.colorDialogBackdrop}
        onClick={closeDialog}
        aria-label={ts('common.close')}
      />
      <GlassLens radius={20} tint="overlay" className={styles.colorDialogPanel}>
        <div className={styles.colorDialogInner}>
          <div className={styles.colorDialogHeader}>
            <h2 id="note-font-color-dialog-heading" className={styles.colorDialogTitle}>
              {ts('mapArtifacts.noteFontColorDialogTitle')}
            </h2>
            {previewText.length > 0 ? (
              <>
                <p className={styles.colorDialogPreviewLabel}>{ts('mapArtifacts.noteFontColorPreview')}</p>
                <p className={styles.colorDialogPreview}>{previewText}</p>
              </>
            ) : null}
          </div>
          <div className={styles.colorSwatchGrid} role="listbox" aria-label={ts('mapArtifacts.noteFontColorDialogTitle')}>
            {NOTE_FONT_COLOR_PRESETS.map((preset) => {
              const color = resolveCssTokenColor(preset.token)
              const selected = selectedPresetId === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-label={ts(preset.labelKey)}
                  className={`${styles.colorSwatch} ${selected ? styles.colorSwatchSelected : ''}`}
                  onClick={() => setSelectedPresetId(preset.id)}
                >
                  <span
                    className={styles.colorSwatchInner}
                    style={{ backgroundColor: color }}
                  />
                </button>
              )
            })}
          </div>
          <div className={styles.colorDialogActions}>
            <Button variant="secondary" size="sm" onClick={closeDialog}>
              {ts('common.skip')}
            </Button>
            <Button variant="primary" size="sm" onClick={handleConfirm}>
              {ts('common.confirm')}
            </Button>
          </div>
        </div>
      </GlassLens>
    </div>
  )
}
