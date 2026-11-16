import { Check } from 'lucide-react'
import {
  dutyProgressCounts,
  hasDutyAssignment,
  LOOP_WORK_GROUP_MEMBER_VISIBLE_DUTIES,
  type IntentGraphNode,
  type LoopDutyItem,
  type LoopDutyItemStatus,
  type LoopDutyProgressItem,
  type LoopSpecNode,
} from '@contracts/index'
import { useI18n } from '../../i18n'
import styles from './LoopNodeDutyChecklist.module.css'

/** Canvas chips (standalone + work-group) share the work-group visible-duty cap. */
const CANVAS_MAX_ITEMS = LOOP_WORK_GROUP_MEMBER_VISIBLE_DUTIES

interface Props {
  node: IntentGraphNode
  /** Spec acceptance / duty when running. */
  specNode?: LoopSpecNode | null
  /** Runtime overlay from nodeRecords.dutyItems (agent dynamic edits). */
  runtimeItems?: LoopDutyItem[] | undefined
  progress?: LoopDutyProgressItem[] | undefined
  /** Compact canvas body vs inspector list. */
  compact?: boolean
  interactive?: boolean
  /** Allow adding a task during run / HITL. */
  allowAdd?: boolean
  onToggle?: (itemId: string, next: LoopDutyItemStatus) => void
  onAdd?: (text: string) => void
  className?: string
}

function resolveDisplayItems(
  node: IntentGraphNode,
  specNode?: LoopSpecNode | null,
  runtimeItems?: LoopDutyItem[] | undefined,
): LoopDutyItem[] {
  if (runtimeItems && runtimeItems.length > 0) return runtimeItems
  if (node.dutyItems && node.dutyItems.length > 0) return node.dutyItems
  if (specNode?.acceptance?.length) {
    return specNode.acceptance.map((item) => ({
      id: item.id,
      text: item.description,
      kind: item.kind,
      required: true,
    }))
  }
  return []
}

function progressStatus(
  itemId: string,
  progress: LoopDutyProgressItem[] | undefined,
): LoopDutyItemStatus {
  const row = progress?.find(
    (item) =>
      item.id === itemId ||
      item.id === itemId.replace(/^acc_/, '') ||
      `acc_${item.id}` === itemId,
  )
  return row?.status ?? 'pending'
}

export default function LoopNodeDutyChecklist({
  node,
  specNode = null,
  runtimeItems,
  progress,
  compact = true,
  interactive = false,
  allowAdd = false,
  onToggle,
  onAdd,
  className = '',
}: Props) {
  const { ts } = useI18n()
  const assigned =
    hasDutyAssignment(node) ||
    (node.dutyItems?.length ?? 0) > 0 ||
    (runtimeItems?.length ?? 0) > 0
  const items = resolveDisplayItems(node, specNode, runtimeItems)

  if (!assigned && !items.length) {
    const hint = node.prompt.trim()
    if (hint) {
      return (
        <p
          className={`${styles.hint} ${className}`.trim()}
          data-loop-duty-hint=""
          title={hint}
        >
          {hint}
        </p>
      )
    }
    return (
      <p className={`${styles.empty} ${className}`.trim()}>
        {ts('chat.loopGraph.dutyEmpty')}
      </p>
    )
  }

  if (assigned && items.length === 0) {
    return (
      <p className={`${styles.empty} ${className}`.trim()}>
        {ts('chat.loopGraph.dutyEmpty')}
      </p>
    )
  }

  const visible = compact ? items.slice(0, CANVAS_MAX_ITEMS) : items
  const hidden = compact ? Math.max(0, items.length - visible.length) : 0
  const counts = dutyProgressCounts(items, progress)

  return (
    <div className={`${styles.checklist} ${className}`.trim()} data-loop-duty-list="">
      {visible.map((item) => {
        const status = progressStatus(item.id, progress)
        const done = status === 'done' || status === 'skipped'
        const blocked = status === 'blocked'
        const body = (
          <>
            <span
              className={`${styles.box} ${done ? styles.boxDone : ''} ${
                blocked ? styles.boxBlocked : ''
              }`.trim()}
              aria-hidden
            >
              {done ? <Check size={9} strokeWidth={2.5} /> : null}
            </span>
            <span className={`${styles.text} ${done ? styles.textDone : ''}`.trim()}>
              {item.text}
            </span>
          </>
        )
        if (interactive && onToggle) {
          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.item} ${styles.itemInteractive}`}
              aria-pressed={done}
              onClick={(event) => {
                event.stopPropagation()
                onToggle(item.id, done ? 'pending' : 'done')
              }}
            >
              {body}
            </button>
          )
        }
        return (
          <div key={item.id} className={styles.item}>
            {body}
          </div>
        )
      })}
      {hidden > 0 ? (
        <p className={styles.more}>{ts('chat.loopGraph.dutyMore', { count: hidden })}</p>
      ) : null}
      {progress && counts.total > 0 ? (
        <p className={styles.progress}>
          {ts('chat.loopGraph.dutyProgress', {
            done: counts.done,
            total: counts.total,
          })}
        </p>
      ) : null}
      {allowAdd && onAdd ? (
        <button
          type="button"
          className={styles.addBtn}
          onClick={(event) => {
            event.stopPropagation()
            const text = window.prompt(ts('chat.loopGraph.dutyAddPrompt'))
            if (text?.trim()) onAdd(text.trim())
          }}
        >
          {ts('chat.loopGraph.dutyAdd')}
        </button>
      ) : null}
    </div>
  )
}
