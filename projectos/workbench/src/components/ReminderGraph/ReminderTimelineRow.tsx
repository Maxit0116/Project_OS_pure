import type { MilestoneBinding, ReminderTimelineItem } from '@contracts/index'
import Button from '../ui/Button'
import styles from './ReminderGraphOverlay.module.css'
import {
  reminderToneHasRail,
  reminderToneUsesMilestoneAccent,
  resolveReminderVisualTone,
  type ReminderVisualTone,
} from './reminderVisualTone'

export function statusLabel(item: ReminderTimelineItem, ts: (key: string) => string): string {
  if (item.kind === 'milestone') {
    return ts(`chat.reminderGraph.milestoneStatus.${item.milestoneStatus ?? 'upcoming'}`)
  }
  if (item.kind === 'inbox') return ts('chat.reminderGraph.kind.inbox')
  return ts(`chat.reminderGraph.reminderStatus.${item.reminderStatus ?? 'parked'}`)
}

export function bindingLabel(binding: MilestoneBinding, ts: (key: string) => string): string {
  switch (binding.type) {
    case 'manual':
      return ts('chat.reminderGraph.bindingManual')
    case 'git_tag':
      return `git_tag · ${binding.tagPattern}`
    case 'feature_acceptance':
      return `feature · ${binding.featureId}`
    case 'loop_run':
      return `loop · ${binding.loopId} (${binding.requireStatus})`
    case 'checklist':
      return `checklist · ${binding.docPath}#${binding.headingAnchor}`
  }
}

export function hasExpandableDetail(item: ReminderTimelineItem): boolean {
  return Boolean(
    item.dependsOn?.length ||
      item.binding ||
      item.sourceRefs?.length ||
      item.kind === 'milestone' ||
      item.conflictNote,
  )
}

const CHIP_BY_TONE: Record<ReminderVisualTone, string | undefined> = {
  conflict: styles.chipConflict,
  due: styles.chipDue,
  ready: styles.chipReady,
  done: styles.chipDone,
  inbox: styles.chipInbox,
  neutral: undefined,
}

const ROW_TONE_CLASS: Record<ReminderVisualTone, string | undefined> = {
  conflict: styles.rowToneConflict,
  due: styles.rowToneDue,
  ready: styles.rowToneReady,
  done: styles.rowToneDone,
  inbox: styles.rowToneInbox,
  neutral: undefined,
}

const DOT_TONE_CLASS: Record<ReminderVisualTone, string | undefined> = {
  conflict: styles.rowDotConflict,
  due: styles.rowDotDue,
  ready: styles.rowDotReady,
  done: styles.rowDotDone,
  inbox: styles.rowDotInbox,
  neutral: undefined,
}

export function ReminderTimelineRow(props: {
  item: ReminderTimelineItem
  expanded: boolean
  dragging: boolean
  past?: boolean
  status: string
  titleById: Map<string, string>
  busy: boolean
  onToggle: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onDrop: () => void
  onCompleteMilestone: () => void
  onOpenSource: (path: string) => void
  ts: (key: string) => string
}) {
  const {
    item,
    expanded,
    dragging,
    past = false,
    status,
    titleById,
    busy,
    onToggle,
    onDragStart,
    onDragEnd,
    onDrop,
    onCompleteMilestone,
    onOpenSource,
    ts,
  } = props
  const canDrag = item.kind === 'reminder' || item.kind === 'inbox'
  const canExpand = hasExpandableDetail(item)
  const dependsLabels = (item.dependsOn ?? []).map((id) => titleById.get(id) ?? id)
  const tone = resolveReminderVisualTone(item)
  const toneClass = ROW_TONE_CLASS[tone]
  const chipClass = CHIP_BY_TONE[tone]
  const dotToneClass = DOT_TONE_CLASS[tone]
  const showRail = reminderToneHasRail(tone)
  const milestoneAccent =
    item.kind === 'milestone' && reminderToneUsesMilestoneAccent(tone)

  return (
    <div
      className={`${styles.row} ${expanded ? styles.rowExpanded : ''} ${
        item.kind === 'milestone' ? styles.rowMilestone : ''
      } ${dragging ? styles.rowDragging : ''} ${past ? styles.rowPast : ''} ${
        toneClass ?? ''
      } ${showRail ? styles.rowWithRail : ''}`}
      data-reminder-row={item.id}
      data-expanded={expanded ? 'true' : 'false'}
      data-tone={tone}
      onDragOver={(event) => {
        if (canDrag) event.preventDefault()
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDrop()
      }}
    >
      <span
        className={`${styles.rowDot} ${
          item.kind === 'milestone' ? styles.rowDotMilestone : ''
        } ${milestoneAccent ? styles.rowDotAccent : ''} ${dotToneClass ?? ''}`}
        aria-hidden
      />
      <button
        type="button"
        className={styles.rowHeader}
        aria-expanded={canExpand ? expanded : undefined}
        draggable={canDrag}
        onClick={onToggle}
        onDragStart={(event) => {
          if (!canDrag) {
            event.preventDefault()
            return
          }
          onDragStart()
        }}
        onDragEnd={onDragEnd}
      >
        <span className={styles.rowTitle}>{item.title}</span>
        <div className={styles.rowMeta}>
          <span className={`${styles.chip} ${chipClass ?? ''}`}>{status}</span>
          {item.targetDate ? <span className={styles.chip}>{item.targetDate}</span> : null}
          {item.userPinned ? (
            <span className={styles.chip}>{ts('chat.reminderGraph.pinned')}</span>
          ) : null}
        </div>
        {item.summary && !expanded ? (
          <p className={styles.rowSummary}>{item.summary}</p>
        ) : null}
      </button>

      {expanded && canExpand ? (
        <div className={styles.rowDetail} data-reminder-row-detail="">
          {item.summary ? (
            <div className={styles.detailSection}>
              <span className={styles.detailLabel}>{ts('chat.reminderGraph.summary')}</span>
              <p className={styles.detailBody}>{item.summary}</p>
            </div>
          ) : null}
          {dependsLabels.length ? (
            <div className={styles.detailSection}>
              <span className={styles.detailLabel}>{ts('chat.reminderGraph.dependsOn')}</span>
              <p className={styles.detailBody}>{dependsLabels.join(', ')}</p>
            </div>
          ) : null}
          {item.binding ? (
            <div className={styles.detailSection}>
              <span className={styles.detailLabel}>{ts('chat.reminderGraph.binding')}</span>
              <p className={styles.detailBody}>{bindingLabel(item.binding, ts)}</p>
            </div>
          ) : null}
          {item.sourceRefs?.length ? (
            <div className={styles.detailSection}>
              <span className={styles.detailLabel}>{ts('chat.reminderGraph.sources')}</span>
              <ul className={styles.sourceList}>
                {item.sourceRefs.map((ref) => (
                  <li key={`${ref.path}:${ref.heading ?? ''}`}>
                    <button
                      type="button"
                      className={styles.sourceLink}
                      onClick={(event) => {
                        event.stopPropagation()
                        onOpenSource(ref.path)
                      }}
                    >
                      {ref.path}
                      {ref.heading ? ` · ${ref.heading}` : ''}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {item.conflictNote ? (
            <div className={styles.detailSection}>
              <span className={styles.detailLabel}>
                {ts('chat.reminderGraph.reminderStatus.conflict')}
              </span>
              <p className={styles.detailBody}>{item.conflictNote}</p>
            </div>
          ) : null}
          {item.kind === 'milestone' ? (
            <div className={styles.detailActions}>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={(event) => {
                  event.stopPropagation()
                  onCompleteMilestone()
                }}
              >
                {item.milestoneStatus === 'passed'
                  ? ts('chat.reminderGraph.uncompleteMilestone')
                  : ts('chat.reminderGraph.completeMilestone')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
