import type { PromptAttachment } from '@contracts/index'
import { X } from 'lucide-react'
import styles from './AttachmentChips.module.css'

interface AttachmentChipsProps {
  attachments: PromptAttachment[]
  invokedSkillLabel?: string
  onRemove: (attachmentId: string) => void
  onClearSkill?: () => void
}

export default function AttachmentChips({
  attachments,
  invokedSkillLabel,
  onRemove,
  onClearSkill,
}: AttachmentChipsProps) {
  if (attachments.length === 0 && !invokedSkillLabel) return null
  return (
    <div className={styles.row}>
      {invokedSkillLabel ? (
        <span className={`${styles.chip} ${styles.skillChip}`}>
          <span className={styles.label}>/{invokedSkillLabel}</span>
          {onClearSkill ? (
            <button
              type="button"
              className={styles.remove}
              onClick={onClearSkill}
              aria-label="Remove skill"
            >
              <X size={12} />
            </button>
          ) : null}
        </span>
      ) : null}
      {attachments.map((attachment) => (
        <span key={attachment.id} className={styles.chip}>
          <span className={styles.prefix}>@</span>
          <span className={styles.label}>{attachment.label}</span>
          <button
            type="button"
            className={styles.remove}
            onClick={() => onRemove(attachment.id)}
            aria-label={`Remove ${attachment.label}`}
          >
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  )
}
