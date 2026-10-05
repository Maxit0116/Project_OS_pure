import { useRef } from 'react'
import MarkdownPreview from '../Markdown/MarkdownPreview'
import styles from './DiffFileView.module.css'

interface Props {
  label: string
  content: string
  emptyLabel: string
  scrollRef?: React.RefObject<HTMLDivElement>
  onScroll?: (scrollTop: number) => void
}

export default function DiffMarkdownPreviewColumn({
  label,
  content,
  emptyLabel,
  scrollRef,
  onScroll,
}: Props) {
  const localRef = useRef<HTMLDivElement>(null)
  const bodyRef = scrollRef ?? localRef
  const isEmpty = content.trim().length === 0

  return (
    <div className={styles.column}>
      <div className={styles.colLabel}>{label}</div>
      <div
        ref={bodyRef}
        className={styles.previewBody}
        onScroll={(event) => onScroll?.(event.currentTarget.scrollTop)}
      >
        {isEmpty ? (
          <p className={styles.previewEmpty}>{emptyLabel}</p>
        ) : (
          <MarkdownPreview content={content} />
        )}
      </div>
    </div>
  )
}
