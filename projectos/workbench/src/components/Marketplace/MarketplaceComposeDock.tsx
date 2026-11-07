import { ArrowUp, Bot } from 'lucide-react'
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea'
import { useI18n } from '../../i18n'
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
  const { ts } = useI18n()
  const textareaRef = useAutoResizeTextarea(value, 140)
  const canSend = !disabled && !matching && Boolean(value.trim())

  return (
    <div className={styles.composer} data-marketplace-compose-dock="">
      <div className={styles.promptDock}>
        <p className={styles.hint}>{ts('chat.marketplace.composeDockHint')}</p>
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
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  if (canSend) onSubmit()
                }
              }}
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
                onClick={onSubmit}
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
