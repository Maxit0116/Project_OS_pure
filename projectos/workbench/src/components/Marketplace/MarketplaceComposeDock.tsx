import { useRef, type KeyboardEvent } from 'react'
import { ArrowUp, Bot } from 'lucide-react'
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea'
import { useI18n } from '../../i18n'
import { useComposePromptVoice } from '../ChatPanel/composer/useComposePromptVoice'
import {
  VoiceInputDock,
  VoiceInputErrorBanner,
} from '../ChatPanel/VoiceInputControls'
import Button from '../ui/Button'
import Chip from '../ui/Chip'
import styles from './MarketplaceComposeDock.module.css'

export interface MarketplaceComposeDockProps {
  value: string
  disabled?: boolean
  matching?: boolean
  onChange: (value: string) => void
  onSubmit: () => void
}

/**
 * Installed-view agent compose dock — matches Diagram/Loop goal composer chrome
 * (elevated input card + footer send) without graph-specific sheets.
 */
export default function MarketplaceComposeDock({
  value,
  disabled = false,
  matching = false,
  onChange,
  onSubmit,
}: MarketplaceComposeDockProps) {
  const { ts, locale } = useI18n()
  const textareaRef = useAutoResizeTextarea(value, 140)
  const valueRef = useRef(value)
  valueRef.current = value
  const onSubmitRef = useRef(onSubmit)
  onSubmitRef.current = onSubmit
  const canSend = !disabled && !matching && Boolean(value.trim())

  const composeVoice = useComposePromptVoice({
    locale,
    disabled: disabled || matching,
    getText: () => valueRef.current,
    setText: onChange,
    onSubmit: (text) => {
      if (!text.trim() || disabled || matching) return
      onSubmitRef.current()
    },
  })

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Escape' &&
      (composeVoice.voice.isRecording || composeVoice.voice.isTranscribing)
    ) {
      event.preventDefault()
      composeVoice.cancelVoice()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'Space') {
      event.preventDefault()
      composeVoice.dockProps.onMicToggle()
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (canSend) {
        if (composeVoice.voice.isRecording || composeVoice.voice.isTranscribing) {
          composeVoice.stopVoice()
        }
        onSubmit()
      }
    }
  }

  return (
    <div className={styles.composer} data-marketplace-compose-dock="">
      <div className={styles.promptDock}>
        <p className={styles.hint}>{ts('chat.marketplace.composeDockHint')}</p>
        {composeVoice.voice.state.error ? (
          <VoiceInputErrorBanner
            errorKey={composeVoice.voice.state.error}
            onDismiss={composeVoice.voice.dismissError}
            labels={composeVoice.voiceLabels}
          />
        ) : null}
        <div className={styles.inputComposer}>
          <div className={styles.composerBody}>
            <textarea
              ref={textareaRef}
              className={styles.input}
              value={value}
              disabled={disabled || matching}
              placeholder={ts('chat.marketplace.composePlaceholder')}
              aria-label={ts('chat.marketplace.composeInput')}
              rows={2}
              onChange={(event) => {
                const next = event.target.value
                onChange(next)
                composeVoice.syncBaseFromExternalText(next)
              }}
              onKeyDown={onKeyDown}
            />
          </div>
          <div className={styles.footer}>
            <div className={styles.leftCluster}>
              <Chip asButton={false} className={styles.modeChip}>
                <Bot size={14} strokeWidth={2} aria-hidden />
                <span>{ts('chat.marketplace.composeModeChip')}</span>
              </Chip>
            </div>
            <div className={styles.rightCluster}>
              <VoiceInputDock {...composeVoice.dockProps} inline />
              <Button
                type="button"
                variant="primary"
                size="sm"
                className={styles.sendButton}
                disabled={!canSend}
                aria-label={
                  matching
                    ? ts('chat.marketplace.composeMatching')
                    : ts('chat.marketplace.composeSubmit')
                }
                title={
                  matching
                    ? ts('chat.marketplace.composeMatching')
                    : ts('chat.marketplace.composeSubmit')
                }
                onClick={() => {
                  if (composeVoice.voice.isRecording || composeVoice.voice.isTranscribing) {
                    composeVoice.stopVoice()
                  }
                  onSubmit()
                }}
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
