import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ComposerDraft } from '@contracts/index'
import { useAutoResizeTextarea } from '../../../hooks/useAutoResizeTextarea'
import { useI18n } from '../../../i18n'
import type { ChatMode } from '../../../state/workbenchStore'
import AttachmentChips from './AttachmentChips'
import ComposerControlBar from './ComposerControlBar'
import ComposerTriggerMenu from './ComposerTriggerMenu'
import {
  appendAttachment,
  detectComposerTrigger,
  draftHasContent,
  removeAttachment,
  removeTriggerToken,
  setComposerText,
} from './composerTokens'
import styles from './PromptComposer.module.css'
import {
  attachmentFromMenuItem,
  useComposerContextItems,
} from './useComposerContextItems'

interface VoiceProps {
  isRecording: boolean
  isTranscribing: boolean
  busyLabel?: string
  labels: {
    start: string
    stop: string
    recording: string
  }
  micDisabled?: boolean
  isSupported: boolean
  onMicToggle: () => void
}

interface PromptComposerProps {
  draft: ComposerDraft
  onDraftChange: (draft: ComposerDraft) => void
  onModeSelect?: (mode: ChatMode) => void
  onChatModeChange: (mode: ChatMode) => void
  disabled?: boolean
  placeholder: string
  chatMode: ChatMode
  submitDisabled: boolean
  voice: VoiceProps
  onKeyDownExtra?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
}

export default function PromptComposer({
  draft,
  onDraftChange,
  onModeSelect,
  onChatModeChange,
  disabled = false,
  placeholder,
  chatMode,
  submitDisabled,
  voice,
  onKeyDownExtra,
}: PromptComposerProps) {
  const { ts } = useI18n()
  const textareaRef = useAutoResizeTextarea(draft.text, 240, chatMode)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [trigger, setTrigger] = useState<ReturnType<typeof detectComposerTrigger>>(null)
  const composerRef = useRef<HTMLDivElement>(null)

  const menuItems = useComposerContextItems({
    triggerKind: trigger?.kind ?? null,
    query: trigger?.query ?? '',
  })

  const invokedSkillLabel = useMemo(() => {
    if (!draft.invokedSkillId) return undefined
    const match = menuItems.find((item) => item.id === `skill:${draft.invokedSkillId}`)
    return match?.label.replace(/^\//u, '') ?? draft.invokedSkillId
  }, [draft.invokedSkillId, menuItems])

  useEffect(() => {
    setActiveIndex(0)
  }, [menuItems.length, trigger?.query])

  const syncTrigger = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const next = detectComposerTrigger(textarea.value, textarea.selectionStart)
    setTrigger(next)
    setMenuOpen(Boolean(next))
  }, [textareaRef])

  const handleSelect = (item: (typeof menuItems)[number]) => {
    const result = attachmentFromMenuItem(item)
    let nextDraft = trigger
      ? { ...draft, text: removeTriggerToken(draft.text, trigger) }
      : draft
    if (result.mode && onModeSelect) {
      onModeSelect(result.mode)
    }
    if (result.invokedSkillId) {
      nextDraft = { ...nextDraft, invokedSkillId: result.invokedSkillId }
    }
    if (result.attachment) {
      nextDraft = appendAttachment(nextDraft, result.attachment)
    }
    onDraftChange(nextDraft)
    setMenuOpen(false)
    setTrigger(null)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen && menuItems.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((index) => (index + 1) % menuItems.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((index) => (index - 1 + menuItems.length) % menuItems.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        const item = menuItems[activeIndex]
        if (item && !item.disabled) handleSelect(item)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMenuOpen(false)
        setTrigger(null)
        return
      }
    }
    onKeyDownExtra?.(event)
  }

  return (
    <div className={styles.stack}>
      <div ref={composerRef} className={styles.inputComposer}>
        <AttachmentChips
          attachments={draft.attachments}
          invokedSkillLabel={invokedSkillLabel}
          onRemove={(attachmentId) =>
            onDraftChange(removeAttachment(draft, attachmentId))}
          onClearSkill={() => onDraftChange({ ...draft, invokedSkillId: undefined })}
        />
        <div className={styles.composerBody}>
          <ComposerTriggerMenu
            open={menuOpen}
            items={menuItems}
            activeIndex={activeIndex}
            onSelect={handleSelect}
            onClose={() => {
              setMenuOpen(false)
              setTrigger(null)
            }}
            emptyLabel={ts('composer.empty')}
          />
          <textarea
            ref={textareaRef}
            className={styles.input}
            value={draft.text}
            onChange={(event) => {
              const next = setComposerText(draft, event.target.value)
              onDraftChange(next)
              requestAnimationFrame(syncTrigger)
            }}
            onKeyDown={handleKeyDown}
            onKeyUp={syncTrigger}
            onClick={syncTrigger}
            placeholder={placeholder}
            rows={1}
            disabled={disabled}
          />
        </div>
        <ComposerControlBar
          chatMode={chatMode}
          onChatModeChange={onChatModeChange}
          submitDisabled={submitDisabled}
          voice={voice}
        />
      </div>
    </div>
  )
}

export { draftHasContent }
