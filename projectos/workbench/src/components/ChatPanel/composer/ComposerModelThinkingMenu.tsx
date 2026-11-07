import { useEffect, useRef, useState } from 'react'
import type { ExecutorOption, ModelProfile, ThinkingDepth } from '@contracts/index'
import { modelProfileLabel } from '@contracts/index'
import { useI18n } from '../../../i18n'
import { GlassLens } from '../../Glass'
import Chip from '../../ui/Chip'
import ModelPickerMenu from './ModelPickerMenu'
import styles from './ComposerControlBar.module.css'

const THINKING_DEPTHS: ThinkingDepth[] = ['off', 'low', 'medium', 'high']
const DEMO_THINKING_DEPTH: ThinkingDepth = 'medium'

export interface ComposerModelThinkingMenuProps {
  modelProfiles: ModelProfile[]
  selectedModelProfileId: string | null
  thinkingDepth: ThinkingDepth
  presentationMode?: boolean
  compact?: boolean
  disabled?: boolean
  /** May resolve to `false` when selection failed (menu stays open). */
  onSelectModel: (profileId: string) => void | boolean | Promise<void | boolean>
  modelSelectionPending?: boolean
  /** Registered agent runtimes; omitted or empty in a production build. */
  runtimes?: ExecutorOption[]
  selectedRuntimeId?: string | null
  onSelectRuntime?: (executorId: string | null) => void
  onSelectThinkingDepth: (depth: ThinkingDepth) => void
  /** When there are no model profiles — open Settings (Chat) or bridge (Overlay). */
  onConfigureModels?: () => void
  className?: string
}

export default function ComposerModelThinkingMenu({
  modelProfiles,
  selectedModelProfileId,
  thinkingDepth,
  presentationMode = false,
  compact = false,
  disabled = false,
  onSelectModel,
  modelSelectionPending = false,
  runtimes = [],
  selectedRuntimeId = null,
  onSelectRuntime,
  onSelectThinkingDepth,
  onConfigureModels,
  className,
}: ComposerModelThinkingMenuProps) {
  const { ts } = useI18n()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const selectedModel = modelProfiles.find(
    (profile) => profile.id === selectedModelProfileId,
  )
  const hasModels = modelProfiles.length > 0
  const hasRuntimes = runtimes.length > 0
  const activeRuntime = runtimes.find((option) => option.executorId === selectedRuntimeId)

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
    : activeRuntime
      ? activeRuntime.label
      : !hasModels
      ? ts('chat.configureModel')
      : selectedModel
        ? modelProfileLabel(selectedModel)
        : ts('chat.executionModel')

  if (presentationMode) {
    return (
      <Chip
        asButton={false}
        className={`${styles.chipReadOnly} ${styles.chipTruncate}${className ? ` ${className}` : ''}`}
      >
        {modelThinkingLabel}
        <span className={styles.chipMeta}>
          {' '}
          · {thinkingLabel(DEMO_THINKING_DEPTH)}
        </span>
      </Chip>
    )
  }

  if (!hasModels && !hasRuntimes) {
    return (
      <Chip
        className={`${styles.chipTruncate}${className ? ` ${className}` : ''}`}
        disabled={disabled || !onConfigureModels}
        onClick={() => onConfigureModels?.()}
      >
        {modelThinkingLabel}
      </Chip>
    )
  }

  return (
    <div
      className={`${styles.menuWrap}${className ? ` ${className}` : ''}`}
      ref={wrapRef}
    >
      <Chip
        active={open}
        className={styles.chipTruncate}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          setOpen((current) => !current)
        }}
      >
        <span className={styles.chipLabel}>{modelThinkingLabel}</span>
        {activeRuntime ? null : (
          <span className={styles.chipMeta}>
            · {thinkingLabel(thinkingDepth)}
          </span>
        )}{' '}
        {compact ? null : null}▾
      </Chip>
      {open ? (
        <div className={styles.dropdownAnchor}>
          <GlassLens
            radius={16}
            tint="overlay"
            className={`${styles.dropdown} ${styles.dropdownWide} glass-overlay-enter`}
          >
            <ModelPickerMenu
              profiles={modelProfiles}
              selectedId={selectedModelProfileId}
              pending={modelSelectionPending}
              runtimes={runtimes}
              selectedRuntimeId={selectedRuntimeId}
              onSelectRuntime={
                onSelectRuntime
                  ? (executorId) => {
                      onSelectRuntime(executorId)
                      if (executorId !== null) setOpen(false)
                    }
                  : undefined
              }
              onSelect={(id) => {
                void Promise.resolve(onSelectModel(id)).then((selected) => {
                  if (selected === false) return
                  onSelectRuntime?.(null)
                  setOpen(false)
                })
              }}
              onManage={() => {
                setOpen(false)
                onConfigureModels?.()
              }}
            />
            <div className={styles.sectionDivider} />
            <div className={styles.sectionLabel}>{ts('chat.thinkingDepth')}</div>
            {THINKING_DEPTHS.map((depth) => (
              <button
                key={depth}
                type="button"
                className={`${styles.menuItem} ${
                  depth === thinkingDepth ? styles.menuItemActive : ''
                }`}
                onClick={() => {
                  onSelectThinkingDepth(depth)
                  setOpen(false)
                }}
              >
                {thinkingLabel(depth)}
              </button>
            ))}
          </GlassLens>
        </div>
      ) : null}
    </div>
  )
}
