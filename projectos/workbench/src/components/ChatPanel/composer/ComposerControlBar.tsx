import { useEffect, useRef, useState } from 'react'
import type { ThinkingDepth } from '@contracts/index'
import { modelProfileLabel } from '@contracts/index'
import { useWorkbenchStore, type ChatMode } from '../../../state/workbenchStore'
import { useI18n } from '../../../i18n'
import { GlassLens } from '../../Glass'
import Button from '../../ui/Button'
import Chip from '../../ui/Chip'
import { VoiceInputDock } from '../VoiceInputControls'
import {
  CHAT_MODE_VISUALS,
  CHAT_MODES,
  chatModeHelpKey,
} from './chatModeVisuals'
import ModelPickerMenu from './ModelPickerMenu'
import styles from './ComposerControlBar.module.css'

const THINKING_DEPTHS: ThinkingDepth[] = ['off', 'low', 'medium', 'high']
const DEMO_THINKING_DEPTH: ThinkingDepth = 'medium'

type OpenMenu = 'agentMode' | 'modelThinking' | null

interface VoiceInputDockProps {
  isRecording: boolean
  isTranscribing: boolean
  busyLabel?: string
  inline?: boolean
  labels: {
    start: string
    stop: string
    recording: string
  }
  micDisabled?: boolean
  isSupported: boolean
  onMicToggle: () => void
}

interface ComposerControlBarProps {
  chatMode: ChatMode
  onChatModeChange: (mode: ChatMode) => void
  submitDisabled: boolean
  /** When true, show Stop instead of (or beside) Send. */
  stopVisible?: boolean
  onStop?: () => void
  voice: VoiceInputDockProps
}

export default function ComposerControlBar({
  chatMode,
  onChatModeChange,
  submitDisabled,
  stopVisible = false,
  onStop,
  voice,
}: ComposerControlBarProps) {
  const settings = useWorkbenchStore((s) => s.settings)
  const modelSelectionPending = useWorkbenchStore((s) => s.modelSelectionPending)
  const selectedModelProfileId = useWorkbenchStore((s) => s.selectedModelProfileId)
  const selectChatModel = useWorkbenchStore((s) => s.selectChatModel)
  const executorOptions = useWorkbenchStore((s) => s.executorOptions)
  const selectedRuntimeId = useWorkbenchStore((s) => s.selectedRuntimeId)
  const loadExecutorOptions = useWorkbenchStore((s) => s.loadExecutorOptions)
  const selectRuntimeExecutor = useWorkbenchStore((s) => s.selectRuntimeExecutor)
  const projectId = useWorkbenchStore((s) => s.project?.projectId)
  const setThinkingDepth = useWorkbenchStore((s) => s.setThinkingDepth)
  const setSettingsOpen = useWorkbenchStore((s) => s.setSettingsOpen)
  const { ts } = useI18n()

  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)

  useEffect(() => {
    void loadExecutorOptions()
  }, [projectId, loadExecutorOptions])
  const barRef = useRef<HTMLDivElement>(null)
  const modelTriggerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!openMenu) return
    const handleClick = (event: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpenMenu(null)
      modelTriggerRef.current?.closest('button')?.focus()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [openMenu])

  const thinkingDepth = settings?.execution.thinkingDepth ?? 'medium'
  const modelProfiles = settings?.modelProfiles ?? []
  const selectedModel = modelProfiles.find((profile) => profile.id === selectedModelProfileId)
  const presentationMode = Boolean(settings?.presentationMode || settings?.execution.mode === 'fixture')
  const hasModels = modelProfiles.length > 0

  const thinkingLabel = (depth: ThinkingDepth) => {
    switch (depth) {
      case 'off':
        return ts('chat.thinkingOff')
      case 'low':
        return ts('chat.thinkingLow')
      case 'medium':
        return ts('chat.thinkingMedium')
      case 'high':
        return ts('chat.thinkingHigh')
    }
  }

  const activeRuntime = chatMode === 'change'
    ? executorOptions.find((option) => option.executorId === selectedRuntimeId)
    : undefined
  const hasRuntimes = executorOptions.length > 0
  const modelThinkingLabel = presentationMode
    ? ts('chat.demoModelName')
    : activeRuntime
      ? activeRuntime.label
      : !hasModels
        ? ts('chat.configureModel')
        : selectedModel
          ? modelProfileLabel(selectedModel)
          : ts('chat.executionModel')

  const currentModeVisual = CHAT_MODE_VISUALS[chatMode]
  const CurrentModeIcon = currentModeVisual.icon
  const capabilityLabel = currentModeVisual.canEdit
    ? ts('chat.modeCanEdit')
    : ts('chat.modeReadOnly')

  return (
    <div className={styles.footer} ref={barRef}>
      <div className={styles.leftCluster}>
        <div className={styles.menuWrap}>
          <Chip
            active={openMenu === 'agentMode'}
            className={`${styles.chipTruncate} ${styles.chipMode} ${styles[currentModeVisual.toneClass]}`}
            aria-expanded={openMenu === 'agentMode'}
            aria-haspopup="listbox"
            onClick={() =>
              setOpenMenu((current) => (current === 'agentMode' ? null : 'agentMode'))}
          >
            <CurrentModeIcon size={14} strokeWidth={2} className={styles.chipModeIcon} aria-hidden />
            <span className={styles.chipModeLabel}>
              {ts(`chat.${chatMode}Mode` as 'chat.askMode')}
            </span>
            <span className={styles.chipCapability} aria-hidden>
              {capabilityLabel}
            </span>
            <span aria-hidden>▾</span>
          </Chip>
          {openMenu === 'agentMode' && (
            <div className={styles.dropdownAnchor}>
              <GlassLens
                radius={16}
                tint="overlay"
                className={`${styles.dropdown} ${styles.dropdownModes} glass-overlay-enter`}
              >
                {CHAT_MODES.map((mode) => {
                  const visual = CHAT_MODE_VISUALS[mode]
                  const ModeIcon = visual.icon
                  const isActive = mode === chatMode
                  return (
                    <button
                      key={mode}
                      type="button"
                      className={`${styles.menuItem} ${styles.modeMenuItem} ${styles[visual.toneClass]} ${isActive ? styles.modeMenuItemActive : ''}`}
                      onClick={() => {
                        onChatModeChange(mode)
                        setOpenMenu(null)
                      }}
                    >
                      <ModeIcon size={16} strokeWidth={2} className={styles.modeIcon} aria-hidden />
                      <span className={styles.modeMenuCopy}>
                        <span className={styles.modeLabel}>
                          {ts(`chat.${mode}Mode` as 'chat.askMode')}
                        </span>
                        <span className={styles.modeHelp}>
                          {ts(chatModeHelpKey(mode))}
                        </span>
                        <span className={styles.modeCapability}>
                          {visual.canEdit ? ts('chat.modeCanEdit') : ts('chat.modeReadOnly')}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </GlassLens>
            </div>
          )}
        </div>

        {presentationMode ? (
          <Chip asButton={false} className={`${styles.chipReadOnly} ${styles.chipTruncate}`}>
            {modelThinkingLabel}
            <span className={styles.chipMeta}> · {thinkingLabel(DEMO_THINKING_DEPTH)}</span>
          </Chip>
        ) : !hasModels && !hasRuntimes ? (
          <Chip className={styles.chipTruncate} onClick={() => setSettingsOpen(true)}>
            {modelThinkingLabel}
          </Chip>
        ) : (
          <div className={styles.menuWrap}>
            <Chip
              active={openMenu === 'modelThinking'}
              className={styles.chipTruncate}
              aria-expanded={openMenu === 'modelThinking'}
              aria-haspopup="dialog"
              aria-label={ts('composer.modelPickerLabel')}
              onClick={() =>
                setOpenMenu((current) => (current === 'modelThinking' ? null : 'modelThinking'))}
            >
              <span ref={modelTriggerRef} className={styles.chipLabel}>{modelThinkingLabel}</span>
              {!activeRuntime && <span className={styles.chipMeta}>· {thinkingLabel(thinkingDepth)}</span>} ▾
            </Chip>
            {openMenu === 'modelThinking' && (
              <div className={styles.dropdownAnchor} role="dialog" aria-label={ts('composer.modelPickerLabel')}>
                <GlassLens
                radius={16}
                tint="overlay"
                className={`${styles.dropdown} ${styles.dropdownWide} glass-overlay-enter`}
              >
                <ModelPickerMenu
                  profiles={modelProfiles}
                  selectedId={selectedModelProfileId}
                  pending={modelSelectionPending}
                  runtimes={executorOptions}
                  selectedRuntimeId={selectedRuntimeId}
                  onSelectRuntime={(executorId) => {
                    selectRuntimeExecutor(executorId)
                    if (executorId !== null) {
                      setOpenMenu(null)
                      modelTriggerRef.current?.closest('button')?.focus()
                    }
                  }}
                  onSelect={(id) => {
                    void selectChatModel(id).then((selected) => {
                      if (selected) {
                        selectRuntimeExecutor(null)
                        setOpenMenu(null)
                        modelTriggerRef.current?.closest('button')?.focus()
                      }
                    })
                  }}
                  onManage={() => { setOpenMenu(null); setSettingsOpen(true) }}
                />
                <div className={styles.sectionDivider} />
                <div className={styles.sectionLabel}>{ts('chat.thinkingDepth')}</div>
                {THINKING_DEPTHS.map((depth) => (
                  <button
                    key={depth}
                    type="button"
                    className={`${styles.menuItem} ${depth === thinkingDepth ? styles.menuItemActive : ''}`}
                    onClick={() => {
                      void setThinkingDepth(depth)
                      setOpenMenu(null)
                    }}
                  >
                    {thinkingLabel(depth)}
                  </button>
                ))}
              </GlassLens>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={styles.rightCluster}>
        <VoiceInputDock {...voice} inline />
        {stopVisible ? (
          <Button type="button" size="sm" variant="secondary" onClick={() => onStop?.()}>
            {ts('chat.stop')}
          </Button>
        ) : (
          <Button type="submit" size="sm" disabled={submitDisabled || modelSelectionPending}>
            {ts('common.send')}
          </Button>
        )}
      </div>
    </div>
  )
}
