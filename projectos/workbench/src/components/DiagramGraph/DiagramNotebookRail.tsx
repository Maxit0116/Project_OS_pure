import { useEffect, useRef, useState } from 'react'
import { NotebookPen, Pin, PinOff, Plus, Trash2 } from 'lucide-react'
import type { DiagramNoteBlock } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useDiagramGraphStore } from '../../state/diagramGraphStore'
import TextArea from '../ui/TextArea'
import TextInput from '../ui/TextInput'
import styles from './DiagramNotebookRail.module.css'

const EXPAND_DELAY_MS = 220
const COLLAPSE_DELAY_MS = 280
const AUTOSAVE_MS = 450

function newBlock(): DiagramNoteBlock {
  return {
    id: `note_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    title: '',
    body: '',
    updatedAt: new Date().toISOString(),
  }
}

export default function DiagramNotebookRail() {
  const { ts } = useI18n()
  const currentArtifactId = useDiagramGraphStore((s) => s.currentArtifactId)
  const currentHtml = useDiagramGraphStore((s) => s.currentHtml)
  const currentNotes = useDiagramGraphStore((s) => s.currentNotes)
  const notesSaving = useDiagramGraphStore((s) => s.notesSaving)
  const saveNotes = useDiagramGraphStore((s) => s.saveNotes)

  const enabled = Boolean(currentArtifactId && currentHtml)
  const hasNotes = Boolean(
    currentNotes?.blocks.some(
      (block) => block.title.trim().length > 0 || block.body.trim().length > 0,
    ),
  )

  const [pinned, setPinned] = useState(false)
  const [hoverOpen, setHoverOpen] = useState(false)
  const [draftBlocks, setDraftBlocks] = useState<DiagramNoteBlock[]>([])
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftRef = useRef(draftBlocks)
  const boundDiagramIdRef = useRef<string | null>(currentArtifactId)
  draftRef.current = draftBlocks

  const revealed = enabled && (pinned || hoverOpen)

  useEffect(() => {
    const previousId = boundDiagramIdRef.current
    if (saveTimer.current && previousId && previousId !== currentArtifactId) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      void saveNotes(draftRef.current, previousId)
    }
    boundDiagramIdRef.current = currentArtifactId
    setDraftBlocks(currentNotes?.blocks ?? [])
  }, [currentNotes, currentArtifactId, saveNotes])

  useEffect(() => {
    if (!enabled) {
      setPinned(false)
      setHoverOpen(false)
    }
  }, [enabled])

  useEffect(() => {
    return () => {
      if (expandTimer.current) clearTimeout(expandTimer.current)
      if (collapseTimer.current) clearTimeout(collapseTimer.current)
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  function clearExpandTimer() {
    if (expandTimer.current) {
      clearTimeout(expandTimer.current)
      expandTimer.current = null
    }
  }

  function clearCollapseTimer() {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current)
      collapseTimer.current = null
    }
  }

  function scheduleSave(next: DiagramNoteBlock[]) {
    if (!enabled) return
    const diagramId = boundDiagramIdRef.current
    if (!diagramId) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void saveNotes(next, diagramId)
    }, AUTOSAVE_MS)
  }

  function updateBlocks(next: DiagramNoteBlock[]) {
    setDraftBlocks(next)
    scheduleSave(next)
  }

  function onPointerEnter() {
    if (!enabled) return
    clearCollapseTimer()
    if (pinned || hoverOpen) return
    clearExpandTimer()
    expandTimer.current = setTimeout(() => setHoverOpen(true), EXPAND_DELAY_MS)
  }

  function onPointerLeave() {
    clearExpandTimer()
    if (pinned) return
    clearCollapseTimer()
    collapseTimer.current = setTimeout(() => setHoverOpen(false), COLLAPSE_DELAY_MS)
  }

  function togglePin() {
    if (!enabled) return
    setPinned((value) => {
      const next = !value
      if (next) setHoverOpen(true)
      return next
    })
  }

  return (
    <div
      className={[styles.slot, !enabled ? styles.slotDisabled : ''].filter(Boolean).join(' ')}
      data-diagram-notebook-rail=""
      data-enabled={enabled ? 'true' : 'false'}
      data-revealed={revealed ? 'true' : 'false'}
      data-pinned={pinned ? 'true' : 'false'}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className={styles.edgeHit} aria-hidden />
      <aside
        className={[
          styles.rail,
          revealed ? styles.railRevealed : '',
          !enabled ? styles.railDisabled : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={ts('chat.diagramGraph.notebook.title')}
      >
        <div className={styles.collapsedStrip}>
          <button
            type="button"
            className={[styles.pinButton, pinned ? styles.pinButtonActive : '']
              .filter(Boolean)
              .join(' ')}
            disabled={!enabled}
            aria-pressed={pinned}
            aria-label={
              pinned
                ? ts('chat.diagramGraph.notebook.unpin')
                : ts('chat.diagramGraph.notebook.pin')
            }
            title={
              enabled
                ? pinned
                  ? ts('chat.diagramGraph.notebook.unpin')
                  : ts('chat.diagramGraph.notebook.pin')
                : ts('chat.diagramGraph.notebook.disabled')
            }
            onClick={togglePin}
          >
            <NotebookPen size={14} aria-hidden />
          </button>
          <span
            className={[styles.dot, hasNotes ? styles.dotHasNotes : ''].filter(Boolean).join(' ')}
            aria-hidden
          />
        </div>

        <div className={styles.panel}>
          <div className={styles.header}>
            <h3 className={styles.headerTitle}>{ts('chat.diagramGraph.notebook.title')}</h3>
            {notesSaving ? (
              <span className={styles.saving}>{ts('chat.diagramGraph.notebook.saving')}</span>
            ) : null}
            <button
              type="button"
              className={[styles.pinButton, pinned ? styles.pinButtonActive : '']
                .filter(Boolean)
                .join(' ')}
              aria-pressed={pinned}
              aria-label={
                pinned
                  ? ts('chat.diagramGraph.notebook.unpin')
                  : ts('chat.diagramGraph.notebook.pin')
              }
              title={
                pinned
                  ? ts('chat.diagramGraph.notebook.unpin')
                  : ts('chat.diagramGraph.notebook.pin')
              }
              onClick={togglePin}
            >
              {pinned ? <PinOff size={14} aria-hidden /> : <Pin size={14} aria-hidden />}
            </button>
          </div>

          {!enabled ? (
            <p className={styles.disabledHint}>{ts('chat.diagramGraph.notebook.disabled')}</p>
          ) : (
            <>
              <div className={styles.body}>
                {draftBlocks.length === 0 ? (
                  <p className={styles.empty}>{ts('chat.diagramGraph.notebook.empty')}</p>
                ) : (
                  draftBlocks.map((block) => (
                    <article key={block.id} className={styles.block} data-note-block={block.id}>
                      <div className={styles.blockHead}>
                        <TextInput
                          size="sm"
                          fieldClassName={styles.titleField}
                          className={styles.titleInput}
                          value={block.title}
                          placeholder={ts('chat.diagramGraph.notebook.blockTitle')}
                          aria-label={ts('chat.diagramGraph.notebook.blockTitle')}
                          onChange={(event) => {
                            const title = event.target.value
                            updateBlocks(
                              draftRef.current.map((item) =>
                                item.id === block.id
                                  ? {
                                      ...item,
                                      title,
                                      updatedAt: new Date().toISOString(),
                                    }
                                  : item,
                              ),
                            )
                          }}
                        />
                        <button
                          type="button"
                          className={styles.removeBlock}
                          aria-label={ts('chat.diagramGraph.notebook.removeBlock')}
                          title={ts('chat.diagramGraph.notebook.removeBlock')}
                          onClick={() => {
                            updateBlocks(draftRef.current.filter((item) => item.id !== block.id))
                          }}
                        >
                          <Trash2 size={13} aria-hidden />
                        </button>
                      </div>
                      <TextArea
                        size="sm"
                        rows={4}
                        resize="none"
                        fieldClassName={styles.bodyField}
                        className={styles.bodyInput}
                        value={block.body}
                        placeholder={ts('chat.diagramGraph.notebook.blockBody')}
                        aria-label={ts('chat.diagramGraph.notebook.blockBody')}
                        onChange={(event) => {
                          const body = event.target.value
                          updateBlocks(
                            draftRef.current.map((item) =>
                              item.id === block.id
                                ? {
                                    ...item,
                                    body,
                                    updatedAt: new Date().toISOString(),
                                  }
                                : item,
                            ),
                          )
                        }}
                      />
                    </article>
                  ))
                )}
              </div>
              <div className={styles.footer}>
                <button
                  type="button"
                  className={styles.addButton}
                  aria-label={ts('chat.diagramGraph.notebook.addBlock')}
                  title={ts('chat.diagramGraph.notebook.addBlock')}
                  onClick={() => updateBlocks([...draftRef.current, newBlock()])}
                >
                  <Plus size={14} aria-hidden />
                </button>
                <span className={styles.footerHint}>
                  {ts('chat.diagramGraph.notebook.autosaveHint')}
                </span>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
