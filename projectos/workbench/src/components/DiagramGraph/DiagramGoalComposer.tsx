import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { DiagramVisualTypeHint } from '@contracts/index'
import { ArrowUp, ChevronUp, Layers } from 'lucide-react'
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea'
import { useI18n } from '../../i18n'
import { useDiagramGraphStore } from '../../state/diagramGraphStore'
import AgentActivityIndicator from '../ui/AgentActivityIndicator'
import Button from '../ui/Button'
import Chip from '../ui/Chip'
import styles from './DiagramGoalComposer.module.css'

const TYPE_HINTS: DiagramVisualTypeHint[] = [
  'auto',
  'architecture',
  'sequence',
  'flowchart',
  'data-flow',
  'state',
  'ui-wireframe',
]

export default function DiagramGoalComposer() {
  const { ts } = useI18n()
  const composerDraft = useDiagramGraphStore((s) => s.composerDraft)
  const typeHint = useDiagramGraphStore((s) => s.typeHint)
  const surfaceMode = useDiagramGraphStore((s) => s.surfaceMode)
  const composerSheet = useDiagramGraphStore((s) => s.composerSheet)
  const busy = useDiagramGraphStore((s) => s.busy)
  const ensuring = useDiagramGraphStore((s) => s.ensuring)
  const styleChosen = useDiagramGraphStore((s) => s.styleChosen)
  const error = useDiagramGraphStore((s) => s.error)
  const artifacts = useDiagramGraphStore((s) => s.artifacts)
  const currentArtifactId = useDiagramGraphStore((s) => s.currentArtifactId)
  const setComposerDraft = useDiagramGraphStore((s) => s.setComposerDraft)
  const setTypeHint = useDiagramGraphStore((s) => s.setTypeHint)
  const toggleComposerSheet = useDiagramGraphStore((s) => s.toggleComposerSheet)
  const generate = useDiagramGraphStore((s) => s.generate)
  const requestRegenerate = useDiagramGraphStore((s) => s.requestRegenerate)
  const textareaRef = useAutoResizeTextarea(composerDraft, 200)
  const [typeMenuOpen, setTypeMenuOpen] = useState(false)
  const typeMenuRef = useRef<HTMLDivElement>(null)

  const current = artifacts.find((item) => item.id === currentArtifactId) ?? null
  const activityOpen = composerSheet === 'activity'
  const detailsOpen = composerSheet === 'details'
  const working = busy || ensuring
  const wireframeMode = surfaceMode === 'wireframe' || typeHint === 'ui-wireframe'
  const styleGate = wireframeMode ? true : styleChosen
  const disabled = working || !styleGate || !composerDraft.trim()

  useEffect(() => {
    if (!typeMenuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!typeMenuRef.current?.contains(event.target as Node)) {
        setTypeMenuOpen(false)
      }
    }
    window.document.addEventListener('mousedown', onPointerDown)
    return () => window.document.removeEventListener('mousedown', onPointerDown)
  }, [typeMenuOpen])

  const onSend = () => {
    if (disabled) return
    void generate('overlay')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSend()
    }
  }

  return (
    <div className={styles.composer} data-diagram-goal-composer="">
      <div className={styles.bookmarkStack}>
        <div
          className={styles.bookmarkTabs}
          role="tablist"
          aria-label={ts('chat.diagramGraph.composerSheets')}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activityOpen}
            className={`${styles.bookmarkTab} ${activityOpen ? styles.bookmarkTabActive : ''} ${
              working ? styles.bookmarkTabBusy : ''
            }`}
            onClick={() => toggleComposerSheet('activity')}
          >
            <ChevronUp
              size={11}
              aria-hidden
              className={activityOpen ? styles.bookmarkChevronOpen : undefined}
            />
            {ts('chat.diagramGraph.activitySheet')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={detailsOpen}
            className={`${styles.bookmarkTab} ${detailsOpen ? styles.bookmarkTabActive : ''}`}
            onClick={() => toggleComposerSheet('details')}
          >
            <ChevronUp
              size={11}
              aria-hidden
              className={detailsOpen ? styles.bookmarkChevronOpen : undefined}
            />
            {ts('chat.diagramGraph.detailsSheet')}
          </button>
        </div>

        {activityOpen ? (
          <div className={styles.sheetPanel} role="tabpanel" data-diagram-sheet="activity">
            {working || error ? (
              <div className={styles.flowCurrent}>
                <AgentActivityIndicator
                  state={working ? 'working' : 'composing'}
                  label={
                    ensuring
                      ? ts('chat.diagramGraph.statusInstalling')
                      : busy
                        ? ts('chat.diagramGraph.generating')
                        : (error ?? ts('chat.diagramGraph.authoringIdle'))
                  }
                />
              </div>
            ) : (
              <p className={styles.contextEmpty}>{ts('chat.diagramGraph.authoringIdle')}</p>
            )}
          </div>
        ) : null}

        {detailsOpen ? (
          <div className={styles.sheetPanel} role="tabpanel" data-diagram-sheet="details">
            {!current ? (
              <p className={styles.contextEmpty}>{ts('chat.diagramGraph.detailsEmpty')}</p>
            ) : (
              <div className={styles.contextBlock}>
                <h3 className={styles.contextTitle}>{current.title}</h3>
                <p className={styles.contextMeta}>{current.visualType}</p>
                <p className={styles.contextSection}>
                  <strong>{ts('chat.diagramGraph.detailsPrompt')}</strong>: {current.prompt}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={working}
                  onClick={() => requestRegenerate()}
                >
                  {ts('chat.diagramGraph.regenerate')}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className={styles.promptDock}>
        <div className={styles.inputComposer}>
          <div className={styles.composerBody}>
            <textarea
              ref={textareaRef}
              className={styles.input}
              value={composerDraft}
              disabled={working || !styleGate}
              placeholder={
                wireframeMode
                  ? ts('chat.wireframePack.composerPlaceholder')
                  : ts('chat.diagramGraph.composerPlaceholder')
              }
              aria-label={
                wireframeMode
                  ? ts('chat.wireframePack.composerInput')
                  : ts('chat.diagramGraph.composerInput')
              }
              onChange={(event) => setComposerDraft(event.target.value)}
              onKeyDown={onKeyDown}
              rows={3}
            />
          </div>
          <div className={styles.footer}>
            <div className={styles.leftCluster}>
              <div className={styles.menuWrap} ref={typeMenuRef}>
                <Chip
                  active={typeMenuOpen}
                  className={styles.modeChip}
                  aria-expanded={typeMenuOpen}
                  aria-haspopup="listbox"
                  aria-label={ts('chat.diagramGraph.typeHints')}
                  disabled={working}
                  onClick={() => setTypeMenuOpen((open) => !open)}
                >
                  <Layers size={14} strokeWidth={2} aria-hidden />
                  <span>{ts(`chat.diagramGraph.type.${typeHint}`)}</span>
                  <span aria-hidden>▾</span>
                </Chip>
                {typeMenuOpen ? (
                  <div className={styles.dropdownAnchor} role="listbox">
                    {TYPE_HINTS.map((option) => {
                      const active = option === typeHint
                      return (
                        <button
                          key={option}
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={`${styles.menuItem} ${active ? styles.menuItemActive : ''}`}
                          onClick={() => {
                            setTypeHint(option)
                            setTypeMenuOpen(false)
                          }}
                        >
                          {ts(`chat.diagramGraph.type.${option}`)}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            </div>
            <div className={styles.rightCluster}>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className={styles.sendButton}
                disabled={disabled}
                aria-label={ts('chat.diagramGraph.send')}
                onClick={onSend}
              >
                <ArrowUp size={16} aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
