import { memo, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Layers2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { settleWorkGroupTitleEdit } from './workGroupTitleEdit'
import styles from './MapWorkGroupNode.module.css'

export interface MapWorkGroupNodeData {
  workGroupId: string
  title: string
  isSelected: boolean
  dimmed: boolean
  onTitleChange: (title: string) => void
}

function MapWorkGroupNode({ data }: NodeProps & { data: MapWorkGroupNodeData }) {
  const { ts } = useI18n()
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(data.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const editSessionRef = useRef({ settled: false })

  useEffect(() => {
    if (!isEditing) {
      setDraft(data.title)
    }
  }, [data.title, isEditing])

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  const commitTitle = () => {
    if (!settleWorkGroupTitleEdit(editSessionRef.current, draft, data.title, data.onTitleChange)) {
      return
    }
    setIsEditing(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === 'Enter') {
      commitTitle()
    }
    if (event.key === 'Escape') {
      editSessionRef.current.settled = true
      setDraft(data.title)
      setIsEditing(false)
    }
  }

  return (
    <div
      className={`${styles.workGroupRoot} ${data.isSelected ? styles.selected : ''} ${data.dimmed ? styles.dimmed : ''}`}
      data-zone-interactive
    >
      <Handle type="target" position={Position.Top} className={styles.handleHidden} />
      <Handle type="source" position={Position.Bottom} className={styles.handleHidden} />
      <div className={styles.frame}>
        <div
          className={`${styles.titleBar} workGroupDragHandle`}
          onDoubleClick={(event) => {
            event.stopPropagation()
            editSessionRef.current = { settled: false }
            setIsEditing(true)
          }}
        >
          <Layers2 size={14} strokeWidth={1.75} aria-hidden />
          {isEditing ? (
            <input
              ref={inputRef}
              className={`${styles.titleInput} nodrag nopan`}
              value={draft}
              aria-label={ts('map.workGroup.editTitle')}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={handleKeyDown}
              onPointerDown={(event) => event.stopPropagation()}
            />
          ) : (
            <span className={styles.titleText} title={data.title}>
              {data.title}
            </span>
          )}
        </div>
        <div className={`${styles.contentPad} workGroupDragHandle`} aria-hidden />
      </div>
    </div>
  )
}

export default memo(MapWorkGroupNode)
