import { useEffect, useRef, useState } from 'react'
import { Lightbulb, MessageCircle } from 'lucide-react'
import type { AgentDefinition, AskSubMode, SpatialPinMode } from '@contracts/index'
import { useI18n } from '../../../i18n'
import { GlassLens } from '../../Glass'
import Chip from '../../ui/Chip'
import AgentPicker from '../../AgentWorkforce/AgentPicker'
import {
  CHAT_MODE_VISUALS,
  CYCLE_CHAT_MODES,
  type ChatModeVisual,
} from './chatModeVisuals'
import styles from './ComposerControlBar.module.css'

export type ComposerModeSwitchMode = SpatialPinMode | 'anchored'

type ModeFlyout = 'ask' | 'agent' | null

export interface ComposerModeSwitchProps {
  mode: ComposerModeSwitchMode
  askSubMode?: AskSubMode
  agentDefinitionId?: string | null
  agentDisplayName?: string | null
  /** When true, chip shows Create Agent label (Chat only). */
  createAgentActive?: boolean
  /** Modes listed in the primary menu. Defaults to Ask/Plan/Agent/Debug. */
  modes?: readonly ComposerModeSwitchMode[]
  /** Show Anchored in the menu (Chat). Ignored if `modes` is provided. */
  includeAnchored?: boolean
  /** Agent flyout: Create Agent row. Default false for capture surfaces. */
  showCreateAgent?: boolean
  /** Agent flyout: Export pack action. */
  showExportAgent?: boolean
  agents: AgentDefinition[]
  agentsLoading?: boolean
  /** Called when the agent flyout opens so the host can load workforce agents. */
  onAgentFlyoutOpen?: () => void
  onModeChange: (mode: ComposerModeSwitchMode) => void
  onAskSubModeChange: (subMode: AskSubMode) => void
  onSelectGeneralAgent: () => void
  onSelectAgent: (definitionId: string, displayName: string | null) => void
  onCreateAgent?: () => void
  onExportAgent?: (definitionId: string) => void
  /** Compact chip for overlay / capture footers. */
  compact?: boolean
  className?: string
  chipClassName?: string
  disabled?: boolean
}

const DEFAULT_CAPTURE_MODES: readonly ComposerModeSwitchMode[] = CYCLE_CHAT_MODES

function visualFor(mode: ComposerModeSwitchMode): ChatModeVisual {
  return CHAT_MODE_VISUALS[mode]
}

export default function ComposerModeSwitch({
  mode,
  askSubMode = 'chat',
  agentDefinitionId = null,
  agentDisplayName = null,
  createAgentActive = false,
  modes,
  includeAnchored = false,
  showCreateAgent = false,
  showExportAgent = false,
  agents,
  agentsLoading = false,
  onAgentFlyoutOpen,
  onModeChange,
  onAskSubModeChange,
  onSelectGeneralAgent,
  onSelectAgent,
  onCreateAgent,
  onExportAgent,
  compact = false,
  className,
  chipClassName,
  disabled = false,
}: ComposerModeSwitchProps) {
  const { ts } = useI18n()
  const [open, setOpen] = useState(false)
  const [modeFlyout, setModeFlyout] = useState<ModeFlyout>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const menuModes =
    modes ??
    (includeAnchored
      ? (['ask', 'plan', 'change', 'debug', 'anchored'] as const)
      : DEFAULT_CAPTURE_MODES)

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false)
        setModeFlyout(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    if (modeFlyout === 'agent') onAgentFlyoutOpen?.()
  }, [modeFlyout, onAgentFlyoutOpen])

  const currentVisual = visualFor(mode)
  const CurrentModeIcon = currentVisual.icon

  const modeChipLabel = (() => {
    if (createAgentActive) return ts('workforce.createAgentMode')
    if (mode === 'change' && agentDefinitionId && agentDisplayName) {
      return ts('workforce.agentChipSuffix', { name: agentDisplayName })
    }
    if (mode === 'change' && agentDefinitionId) {
      return ts('workforce.agentChipSuffix', {
        name: agentDefinitionId.slice(0, 8),
      })
    }
    if (mode === 'ask' && askSubMode === 'first_principles') {
      return ts('chat.askFirstPrinciplesChip')
    }
    return ts(`chat.${mode}Mode` as 'chat.askMode')
  })()

  const selectAskSubMode = (subMode: AskSubMode) => {
    onAskSubModeChange(subMode)
    onModeChange('ask')
    setOpen(false)
    setModeFlyout(null)
  }

  return (
    <div
      className={`${styles.menuWrap}${className ? ` ${className}` : ''}`}
      ref={wrapRef}
    >
      <Chip
        active={open}
        className={`${styles.chipTruncate} ${styles.chipMode} ${styles[currentVisual.toneClass]}${
          chipClassName ? ` ${chipClassName}` : ''
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          setOpen((current) => !current)
          setModeFlyout(null)
        }}
      >
        <CurrentModeIcon
          size={compact ? 13 : 14}
          strokeWidth={2}
          className={styles.chipModeIcon}
          aria-hidden
        />
        <span className={styles.chipModeLabel}>{modeChipLabel}</span>
        <span aria-hidden>▾</span>
      </Chip>
      {open ? (
        <div className={styles.dropdownAnchor}>
          <div
            className={styles.modeMenuRow}
            onMouseLeave={() => setModeFlyout(null)}
          >
            <GlassLens
              radius={16}
              tint="overlay"
              className={`${styles.dropdown} ${styles.dropdownModes} glass-overlay-enter`}
            >
              {menuModes.map((item) => {
                const visual = visualFor(item)
                const ModeIcon = visual.icon
                const isActive = item === mode && !createAgentActive
                const isAgentRow = item === 'change'
                const isAskRow = item === 'ask'
                const hasFlyout = isAgentRow || isAskRow
                return (
                  <button
                    key={item}
                    type="button"
                    className={`${styles.menuItem} ${styles.modeMenuItem} ${
                      isActive ? styles.modeMenuItemActive : ''
                    }`}
                    onClick={() => {
                      if (isAgentRow) {
                        setModeFlyout('agent')
                        return
                      }
                      if (isAskRow) {
                        setModeFlyout('ask')
                        return
                      }
                      onModeChange(item)
                      setOpen(false)
                      setModeFlyout(null)
                    }}
                    onMouseEnter={() => {
                      if (isAgentRow) setModeFlyout('agent')
                      else if (isAskRow) setModeFlyout('ask')
                      else setModeFlyout(null)
                    }}
                  >
                    <ModeIcon
                      size={16}
                      strokeWidth={2}
                      className={styles.modeIcon}
                      aria-hidden
                    />
                    <span className={styles.modeLabel}>
                      {ts(`chat.${item}Mode` as 'chat.askMode')}
                    </span>
                    {hasFlyout ? (
                      <span className={styles.submenuChevron}>›</span>
                    ) : null}
                  </button>
                )
              })}
            </GlassLens>
            {modeFlyout === 'ask' ? (
              <div
                className={styles.agentFlyoutHost}
                onMouseEnter={() => setModeFlyout('ask')}
              >
                <GlassLens
                  radius={16}
                  tint="overlay"
                  className={`${styles.dropdown} ${styles.askFlyout} glass-overlay-enter`}
                >
                  <div
                    className={styles.askSubPicker}
                    role="listbox"
                    aria-label={ts('firstPrinciples.subModeLabel')}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={mode === 'ask' && askSubMode === 'chat'}
                      className={`${styles.askSubItem} ${
                        mode === 'ask' && askSubMode === 'chat'
                          ? styles.askSubItemActive
                          : ''
                      }`}
                      onClick={() => selectAskSubMode('chat')}
                    >
                      <MessageCircle
                        size={14}
                        className={styles.askSubIcon}
                        aria-hidden
                      />
                      <span className={styles.askSubBody}>
                        <span className={styles.askSubTitle}>
                          {ts('chat.askSubMode.chat')}
                        </span>
                        <span className={styles.askSubMeta}>
                          {ts('chat.askModeHelp')}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      role="option"
                      aria-selected={
                        mode === 'ask' && askSubMode === 'first_principles'
                      }
                      className={`${styles.askSubItem} ${
                        mode === 'ask' && askSubMode === 'first_principles'
                          ? styles.askSubItemActive
                          : ''
                      }`}
                      onClick={() => selectAskSubMode('first_principles')}
                    >
                      <Lightbulb
                        size={14}
                        className={styles.askSubIcon}
                        aria-hidden
                      />
                      <span className={styles.askSubBody}>
                        <span className={styles.askSubTitle}>
                          {ts('chat.askSubMode.firstPrinciples')}
                        </span>
                        <span className={styles.askSubMeta}>
                          {ts('chat.firstPrinciplesModeHelp')}
                        </span>
                      </span>
                    </button>
                  </div>
                </GlassLens>
              </div>
            ) : null}
            {modeFlyout === 'agent' ? (
              <div
                className={styles.agentFlyoutHost}
                onMouseEnter={() => setModeFlyout('agent')}
              >
                <GlassLens
                  radius={16}
                  tint="overlay"
                  className={`${styles.dropdown} ${styles.agentFlyout} glass-overlay-enter`}
                >
                  <AgentPicker
                    agents={agents}
                    selectedDefinitionId={agentDefinitionId}
                    loading={agentsLoading}
                    compact
                    showCreate={showCreateAgent && Boolean(onCreateAgent)}
                    onSelectGeneral={() => {
                      onSelectGeneralAgent()
                      onModeChange('change')
                      setOpen(false)
                      setModeFlyout(null)
                    }}
                    onSelectAgent={(definitionId) => {
                      const match = agents.find(
                        (a) => a.definitionId === definitionId,
                      )
                      onSelectAgent(
                        definitionId,
                        match?.config.displayName ?? null,
                      )
                      onModeChange('change')
                      setOpen(false)
                      setModeFlyout(null)
                    }}
                    onCreateAgent={
                      showCreateAgent && onCreateAgent
                        ? () => {
                            onCreateAgent()
                            setOpen(false)
                            setModeFlyout(null)
                          }
                        : undefined
                    }
                    onExportAgent={
                      showExportAgent && onExportAgent
                        ? (definitionId) => {
                            onExportAgent(definitionId)
                          }
                        : undefined
                    }
                  />
                </GlassLens>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
