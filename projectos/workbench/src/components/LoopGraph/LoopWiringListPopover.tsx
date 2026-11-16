import { Plus, Trash2, X } from 'lucide-react'
import type { LoopWiringListMember } from '@contracts/index'
import { useI18n } from '../../i18n'
import styles from './LoopWiringListPopover.module.css'

interface Props {
  kind: 'mcp' | 'skill'
  title: string
  members: LoopWiringListMember[]
  anchor: { x: number; y: number }
  onAdd: () => void
  onRemove: (memberId: string) => void
  onClose: () => void
}

export default function LoopWiringListPopover({
  kind,
  title,
  members,
  anchor,
  onAdd,
  onRemove,
  onClose,
}: Props) {
  const { ts } = useI18n()
  const left = Math.min(
    Math.max(12, anchor.x),
    typeof window !== 'undefined' ? window.innerWidth - 300 : anchor.x,
  )
  const top = Math.min(
    Math.max(12, anchor.y),
    typeof window !== 'undefined' ? window.innerHeight - 280 : anchor.y,
  )

  return (
    <div
      className={styles.popover}
      style={{ left, top }}
      data-zone-interactive
      role="dialog"
      aria-label={title}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label={ts('chat.loopGraph.wiringListClose')}
          onClick={onClose}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
      <div className={styles.list}>
        {members.length === 0 ? (
          <p className={styles.empty}>{ts('chat.loopGraph.wiringListEmpty')}</p>
        ) : (
          members.map((member) => (
            <div key={member.id} className={styles.row}>
              <span className={styles.rowName} title={member.title}>
                {member.title}
              </span>
              <button
                type="button"
                className={styles.iconBtn}
                aria-label={ts('chat.loopGraph.wiringListRemove')}
                onClick={() => onRemove(member.id)}
              >
                <Trash2 size={13} strokeWidth={1.75} />
              </button>
            </div>
          ))
        )}
      </div>
      <button type="button" className={styles.addBtn} onClick={onAdd}>
        <Plus size={14} strokeWidth={1.75} aria-hidden />
        {kind === 'mcp'
          ? ts('chat.loopGraph.wiringListAddMcp')
          : ts('chat.loopGraph.wiringListAddSkill')}
      </button>
    </div>
  )
}
