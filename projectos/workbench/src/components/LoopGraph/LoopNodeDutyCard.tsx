import { useEffect, useRef } from 'react'
import type { IntentGraphNode, LoopInstance, LoopSpecNode } from '@contracts/index'
import { X } from 'lucide-react'
import { useI18n } from '../../i18n'
import LoopNodeInspector from './LoopNodeInspector'
import styles from './LoopNodeDutyCard.module.css'

interface Props {
  node: IntentGraphNode
  specNode?: LoopSpecNode | null
  activeInstance?: LoopInstance | null
  readOnly?: boolean
  /** Screen-space position for the card top-left (already clamped by parent). */
  left: number
  top: number
  onClose: () => void
  onChange: (patch: Partial<IntentGraphNode>) => void
}

export default function LoopNodeDutyCard({
  node,
  specNode,
  activeInstance,
  readOnly = false,
  left,
  top,
  onClose,
  onChange,
}: Props) {
  const { ts } = useI18n()
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    cardRef.current?.querySelector<HTMLElement>('button, input, textarea')?.focus()
  }, [node.id])

  return (
    <div
      ref={cardRef}
      className={styles.card}
      style={{ left, top }}
      role="dialog"
      aria-label={ts('chat.loopGraph.dutyCard')}
      data-zone-interactive
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.kicker}>{ts('chat.loopGraph.inspectorDuty')}</span>
          <span className={styles.title}>{node.title || ts('chat.loopGraph.untitledNode')}</span>
        </div>
        <button
          type="button"
          className={styles.close}
          aria-label={ts('chat.loopGraph.closeDutyCard')}
          title={ts('chat.loopGraph.closeDutyCard')}
          onClick={onClose}
        >
          <X size={14} aria-hidden />
        </button>
      </header>
      <div className={styles.body}>
        <LoopNodeInspector
          node={node}
          specNode={specNode}
          activeInstance={activeInstance}
          readOnly={readOnly}
          onChange={onChange}
          embedded
        />
      </div>
    </div>
  )
}
