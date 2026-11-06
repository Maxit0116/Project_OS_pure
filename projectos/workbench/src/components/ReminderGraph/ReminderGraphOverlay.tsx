import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, RefreshCw, X } from 'lucide-react'
import { sessionGraphShieldCssInsets, type ReminderTimelineItem } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useBottomDockStore } from '../../state/bottomDockStore'
import { useChatSessionStore } from '../../state/chatSessionStore'
import {
  filterReminderItems,
  useReminderGraphStore,
  type ReminderFilter,
} from '../../state/reminderGraphStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { GraphOverlayFrame } from '../GraphOverlay/GraphOverlayFrame'
import Button from '../ui/Button'
import ReminderGoalComposer from './ReminderGoalComposer'
import { ReminderTimelineRow, statusLabel } from './ReminderTimelineRow'
import styles from './ReminderGraphOverlay.module.css'

const FILTERS: ReminderFilter[] = [
  'all',
  'milestones',
  'reminders',
  'overdue',
  'conflicts',
  'inbox',
]

function isPastItem(item: ReminderTimelineItem): boolean {
  if (item.kind === 'milestone' && item.milestoneStatus === 'passed') return true
  if (item.kind === 'reminder' && item.reminderStatus === 'done') return true
  return false
}

export default function ReminderGraphOverlay() {
  const open = useChatSessionStore((s) => s.reminderGraphOpen)
  const setReminderGraphOpen = useChatSessionStore((s) => s.setReminderGraphOpen)
  const leftPanelOpen = useWorkbenchStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkbenchStore((s) => s.rightPanelOpen)
  const panelResizing = useWorkbenchStore((s) => s.panelResizing)
  const project = useWorkbenchStore((s) => s.project)
  const selectFile = useWorkbenchStore((s) => s.selectFile)
  const terminalOpen = useBottomDockStore((s) => s.open)
  const { ts } = useI18n()

  const document = useReminderGraphStore((s) => s.document)
  const selectedId = useReminderGraphStore((s) => s.selectedId)
  const filter = useReminderGraphStore((s) => s.filter)
  const busy = useReminderGraphStore((s) => s.busy)
  const syncing = useReminderGraphStore((s) => s.syncing)
  const error = useReminderGraphStore((s) => s.error)
  const confirmOpen = useReminderGraphStore((s) => s.confirmOpen)
  const dragPreview = useReminderGraphStore((s) => s.dragPreview)
  const loadForWorkspace = useReminderGraphStore((s) => s.loadForWorkspace)
  const syncNow = useReminderGraphStore((s) => s.syncNow)
  const clear = useReminderGraphStore((s) => s.clear)
  const setFilter = useReminderGraphStore((s) => s.setFilter)
  const selectItem = useReminderGraphStore((s) => s.selectItem)
  const beginReorderConfirm = useReminderGraphStore((s) => s.beginReorderConfirm)
  const cancelReorderConfirm = useReminderGraphStore((s) => s.cancelReorderConfirm)
  const confirmReorder = useReminderGraphStore((s) => s.confirmReorder)
  const completeMilestone = useReminderGraphStore((s) => s.completeMilestone)

  const [draggingId, setDraggingId] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !project) return
    void loadForWorkspace()
  }, [open, project, loadForWorkspace])

  useEffect(() => {
    clear()
  }, [project?.projectId, clear])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReminderGraphOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setReminderGraphOpen])

  const items = useMemo(
    () => filterReminderItems(document?.items ?? [], filter),
    [document?.items, filter],
  )

  const titleById = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of document?.items ?? []) map.set(item.id, item.title)
    return map
  }, [document?.items])

  const past = items.filter(isPastItem)
  const future = items.filter((item) => !isPastItem(item))
  if (!open) return null

  const shield = sessionGraphShieldCssInsets({
    leftOpen: leftPanelOpen,
    rightOpen: rightPanelOpen,
    terminalOpen,
  })

  const statusLabelText = syncing
    ? ts('chat.reminderGraph.statusSyncing')
    : busy
      ? ts('chat.reminderGraph.statusBusy')
      : document?.lastSyncedAt
        ? ts('chat.reminderGraph.statusReady')
        : ts('chat.reminderGraph.statusIdle')

  const onDropOnItem = (target: ReminderTimelineItem) => {
    if (!draggingId || draggingId === target.id) {
      setDraggingId(null)
      return
    }
    const source = document?.items.find((item) => item.id === draggingId)
    if (!source || source.kind === 'milestone') {
      setDraggingId(null)
      return
    }
    beginReorderConfirm(source.id, target.phaseIndex, target.manualOrder + 1)
    setDraggingId(null)
  }

  const onToggleRow = (itemId: string) => {
    selectItem(selectedId === itemId ? null : itemId)
  }

  const onDragStartRow = (itemId: string) => {
    setDraggingId(itemId)
    if (selectedId) selectItem(null)
  }

  const renderRow = (item: ReminderTimelineItem, pastRow: boolean) => (
    <ReminderTimelineRow
      key={item.id}
      item={item}
      expanded={item.id === selectedId && item.id !== draggingId}
      dragging={item.id === draggingId}
      past={pastRow}
      status={statusLabel(item, ts)}
      titleById={titleById}
      busy={busy}
      onToggle={() => onToggleRow(item.id)}
      onDragStart={() => onDragStartRow(item.id)}
      onDragEnd={() => setDraggingId(null)}
      onDrop={() => onDropOnItem(item)}
      onCompleteMilestone={() =>
        void completeMilestone(item.id, item.milestoneStatus !== 'passed')
      }
      onOpenSource={(path) => void selectFile(path)}
      ts={ts}
    />
  )

  const filterToneClass = (entry: ReminderFilter): string => {
    if (entry === 'overdue') return styles.filterChipOverdue
    if (entry === 'conflicts') return styles.filterChipConflicts
    if (entry === 'inbox') return styles.filterChipInbox
    return ''
  }

  return (
    <GraphOverlayFrame
      shield={shield}
      resizing={panelResizing}
      label={ts('chat.reminderGraph.title')}
    >
      <div className={styles.root} data-reminder-graph-overlay="">
        <div className={styles.header}>
          <CalendarClock size={16} aria-hidden />
          <h2 className={styles.title}>{ts('chat.reminderGraph.title')}</h2>
          <span className={styles.statusChip}>{statusLabelText}</span>
          <div className={styles.headerSpacer} />
          <button
            type="button"
            className={styles.syncButton}
            aria-label={ts('chat.reminderGraph.sync')}
            title={ts('chat.reminderGraph.sync')}
            disabled={syncing || busy}
            onClick={() => void syncNow()}
          >
            <RefreshCw size={16} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.closeButton}
            aria-label={ts('chat.reminderGraph.close')}
            title={ts('chat.reminderGraph.close')}
            onClick={() => setReminderGraphOpen(false)}
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className={styles.filters} role="group" aria-label={ts('chat.reminderGraph.filters')}>
          {FILTERS.map((entry) => (
            <button
              key={entry}
              type="button"
              className={`${styles.filterChip} ${filterToneClass(entry)} ${
                filter === entry ? styles.filterChipActive : ''
              }`}
              aria-pressed={filter === entry}
              onClick={() => setFilter(entry)}
            >
              {ts(`chat.reminderGraph.filter.${entry}`)}
            </button>
          ))}
        </div>

        <div className={styles.body}>
          <div className={styles.main}>
            <div className={styles.timeline}>
              {error ? <div className={styles.error}>{error}</div> : null}
              {!document && busy ? (
                <div className={styles.loading}>{ts('chat.reminderGraph.loading')}</div>
              ) : items.length === 0 ? (
                <div className={styles.empty}>{ts('chat.reminderGraph.empty')}</div>
              ) : (
                <div className={styles.track}>
                  {past.map((item) => renderRow(item, true))}

                  <div className={styles.nowLine} aria-label={ts('chat.reminderGraph.now')}>
                    <span className={styles.nowDot} />
                    <span className={styles.nowLabel}>{ts('chat.reminderGraph.now')}</span>
                    <span className={styles.nowRule} />
                  </div>

                  {future.map((item) => renderRow(item, false))}
                </div>
              )}
            </div>
            <ReminderGoalComposer />
          </div>
        </div>

        {confirmOpen && dragPreview ? (
          <div className={styles.modalShield} role="presentation">
            <div
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="reminder-reorder-title"
            >
              <h3 id="reminder-reorder-title" className={styles.modalTitle}>
                {ts('chat.reminderGraph.confirmTitle')}
              </h3>
              <p className={styles.modalBody}>
                {ts('chat.reminderGraph.confirmBody', {
                  phase: String(dragPreview.phaseIndex),
                  order: String(dragPreview.manualOrder),
                })}
              </p>
              <div className={styles.modalActions}>
                <Button type="button" size="sm" variant="secondary" onClick={cancelReorderConfirm}>
                  {ts('chat.reminderGraph.confirmCancel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  disabled={busy}
                  onClick={() => void confirmReorder()}
                >
                  {ts('chat.reminderGraph.confirmApply')}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </GraphOverlayFrame>
  )
}
