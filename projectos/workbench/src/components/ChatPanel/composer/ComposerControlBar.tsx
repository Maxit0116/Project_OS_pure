import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import type { ThinkingDepth } from '@contracts/index'
import { modelProfileLabel } from '@contracts/index'
import { useWorkbenchStore, type ChatMode } from '../../../state/workbenchStore'
import { useI18n } from '../../../i18n'
import { GlassLens } from '../../Glass'
import Chip from '../../ui/Chip'
import { VoiceInputDock } from '../VoiceInputControls'
import {
  CHAT_MODE_VISUALS,
  CHAT_MODES,
} from './chatModeVisuals'
import ContextUsageRing from './ContextUsageRing'
import type { ContextUsageMetrics } from './contextUsageMetrics'
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
  usageMetrics: ContextUsageMetrics
  usageOpen: boolean
  onUsageToggle: () => void
}

export default function ComposerControlBar({
  chatMode,
  onChatModeChange,
  submitDisabled,
  stopVisible = false,
  onStop,
  voice,
  usageMetrics,
  usageOpen,
  onUsageToggle,
}: ComposerControlBarProps) {
  const settings = useWorkbenchStore((s) => s.settings)
  const selectedModelProfileId = useWorkbenchStore((s) => s.selectedModelProfileId)
  const selectChatModel = useWorkbenchStore((s) => s.selectChatModel)
  const setThinkingDepth = useWorkbenchStore((s) => s.setThinkingDepth)
  const setSettingsOpen = useWorkbenchStore((s) => s.setSettingsOpen)
  const { ts } = useI18n()

  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openMenu) return
    const handleClick = (event: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openMenu])

  const thinkingDepth = settings?.execution.thinkingDepth ?? 'medium'
  const modelProfiles = settings?.modelProfiles ?? []
  const selectedModel = modelProfiles.find((profile) => profile.id === selectedModelProfileId)
  const presentationMode = settings?.presentationMode ?? false
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

  const modelThinkingLabel = presentationMode
    ? ts('chat.demoModelName')
    : !hasModels
      ? ts('chat.configureModel')
      : selectedModel
        ? modelProfileLabel(selectedModel)
        : ts('chat.executionModel')

  const currentModeVisual = CHAT_MODE_VISUALS[chatMode]
  const CurrentModeIcon = currentModeVisual.icon

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
                      className={`${styles.menuItem} ${styles.modeMenuItem} ${isActive ? styles.modeMenuItemActive : ''}`}
                      onClick={() => {
                        onChatModeChange(mode)
                        setOpenMenu(null)
                      }}
                    >
                      <ModeIcon size={16} strokeWidth={2} className={styles.modeIcon} aria-hidden />
                      <span className={styles.modeLabel}>
                        {ts(`chat.${mode}Mode` as 'chat.askMode')}
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
        ) : !hasModels ? (
          <Chip className={styles.chipTruncate} onClick={() => setSettingsOpen(true)}>
            {modelThinkingLabel}
          </Chip>
        ) : (
          <div className={styles.menuWrap}>
            <Chip
              active={openMenu === 'modelThinking'}
              className={styles.chipTruncate}
              aria-expanded={openMenu === 'modelThinking'}
              aria-haspopup="listbox"
              onClick={() =>
                setOpenMenu((current) => (current === 'modelThinking' ? null : 'modelThinking'))}
            >
              <span className={styles.chipLabel}>{modelThinkingLabel}</span>
              <span className={styles.chipMeta}>· {thinkingLabel(thinkingDepth)}</span> ▾
            </Chip>
            {openMenu === 'modelThinking' && (
              <div className={styles.dropdownAnchor}>
                <GlassLens
                radius={16}
                tint="overlay"
                className={`${styles.dropdown} ${styles.dropdownWide} glass-overlay-enter`}
              >
                <div className={styles.sectionLabel}>{ts('composer.modelSection')}</div>
                {modelProfiles.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    className={`${styles.menuItem} ${profile.id === selectedModelProfileId ? styles.menuItemActive : ''}`}
                    onClick={() => {
                      void selectChatModel(profile.id)
                      setOpenMenu(null)
                    }}
                  >
                    {modelProfileLabel(profile)}
                  </button>
                ))}
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
        <ContextUsageRing
          metrics={usageMetrics}
          active={usageOpen}
          onClick={onUsageToggle}
          label={ts('context.usageRingLabel', { percent: usageMetrics.percentFull })}
        />
        <VoiceInputDock {...voice} inline />
        {stopVisible ? (
          <button
            type="button"
            className={styles.iconAction}
            onClick={() => onStop?.()}
            aria-label={ts('chat.stop')}
            title={ts('chat.stop')}
          >
            <Square size={14} fill="currentColor" aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            className={`${styles.iconAction} ${styles.sendAction}`}
            disabled={submitDisabled}
            aria-label={ts('common.send')}
            title={ts('common.send')}
          >
            <ArrowUp size={16} strokeWidth={2.5} aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}
