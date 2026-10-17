import type { CSSProperties } from 'react'
import { Send, X } from 'lucide-react'

interface Props {
  index: number
  color: string
  prompt: string
  disabled?: boolean
  submitting?: boolean
  style?: CSSProperties
  dimmed?: boolean
  onPromptChange: (value: string) => void
  onSubmit: () => void
  onFocus: () => void
  onDelete?: () => void
}

export function OverlayArrowPrompt({
  index,
  color,
  prompt,
  disabled,
  submitting,
  style,
  dimmed,
  onPromptChange,
  onSubmit,
  onFocus,
  onDelete,
}: Props) {
  return (
    <div
      className={`overlay-arrow-prompt${dimmed ? ' overlay-arrow-prompt-dimmed' : ''}`}
      style={style}
      onPointerDown={(event) => {
        event.stopPropagation()
        onFocus()
      }}
    >
      <span
        className="overlay-arrow-badge"
        style={{ background: color }}
        aria-hidden
      >
        {index}
      </span>
      <textarea
        className="overlay-arrow-prompt-input"
        rows={2}
        value={prompt}
        placeholder="Describe this callout…"
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            if (!disabled && prompt.trim()) onSubmit()
          }
        }}
      />
      <div className="overlay-arrow-prompt-actions">
        {onDelete ? (
          <button
            type="button"
            className="overlay-icon-btn"
            aria-label="Remove arrow"
            title="Remove"
            onClick={onDelete}
          >
            <X size={12} strokeWidth={2} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          className="overlay-send"
          disabled={disabled || submitting || !prompt.trim()}
          aria-label={submitting ? 'Sending' : 'Submit arrow'}
          title="Submit (⌘↵)"
          onClick={onSubmit}
        >
          <Send size={13} strokeWidth={2.25} aria-hidden />
        </button>
      </div>
    </div>
  )
}
