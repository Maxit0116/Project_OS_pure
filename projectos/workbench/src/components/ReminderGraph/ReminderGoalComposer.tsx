import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronUp, MessageSquare, Pencil } from 'lucide-react'
import type { ReminderComposerMode } from '@contracts/index'
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea'
import { useI18n } from '../../i18n'
import { useReminderGraphStore } from '../../state/reminderGraphStore'
import AgentActivityIndicator from '../ui/AgentActivityIndicator'
import Button from '../ui/Button'
import Chip from '../ui/Chip'
import styles from './ReminderGoalComposer.module.css'

const COMPOSER_MODES: ReminderComposerMode[] = ['ask', 'edit']

const MODE_ICON = {
  ask: MessageSquare,
  edit: Pencil,
} as const

export default function ReminderGoalComposer() {
  const { ts } = useI18n()
  const document = useReminderGraphStore((s) => s.document)
  const selectedId = useReminderGraphStore((s) => s.selectedId)
  const composerDraft = useReminderGraphStore((s) => s.composerDraft)
  const composerSheet = useReminderGraphStore((s) => s.composerSheet)
  const askReply = useReminderGraphStore((s) => s.askReply)
  const busy = useReminderGraphStore((s) => s.busy)
  const syncing = useReminderGraphStore((s) => s.syncing)
  const error = useReminderGraphStore((s) => s.error)
  const setComposerDraft = useReminderGraphStore((s) => s.setComposerDraft)
  const toggleComposerSheet = useReminderGraphStore((s) => s.toggleComposerSheet)
  const setComposerMode = useReminderGraphStore((s) => s.setComposerMode)
  const sendAuthoringTurn = useReminderGraphStore((s) => s.sendAuthoringTurn)
  const acceptEditOffer = useReminderGraphStore((s) => s.acceptEditOffer)
  const dismissEditOffer = useReminderGraphStore((s) => s.dismissEditOffer)
  const textareaRef = useAutoResizeTextarea(composerDraft, 200)

  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const modeMenuRef = useRef<HTMLDivElement>(null)

  const mode: ReminderComposerMode = document?.composerMode ?? 'ask'
  const offer = document?.pendingEditOffer ?? null
  const selected = document?.items.find((item) => item.id === selectedId) ?? null
  const working = busy || syncing
  const submitDisabled = working || !composerDraft.trim()

  const recentChangelog = useMemo(
    () => (document?.lastSyncChangelog ?? []).slice(0, 5),
    [document?.lastSyncChangelog],
  )

  const activityOpen = composerSheet === 'activity'
  const contextOpen = composerSheet === 'context'

  useEffect(() => {
    if (!modeMenuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!modeMenuRef.current?.contains(event.target as Node)) {
        setModeMenuOpen(false)
      }
    }
    window.document.addEventListener('mousedown', onPointerDown)
    return () => window.document.removeEventListener('mousedown', onPointerDown)
  }, [modeMenuOpen])

  if (!document) return null

  const ModeIcon = MODE_ICON[mode]
  const modeLabel =
    mode === 'ask' ? ts('chat.reminderGraph.mode.ask') : ts('chat.reminderGraph.mode.edit')

  const onSend = () => {
    if (submitDisabled) return
    void sendAuthoringTurn()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (!submitDisabled) onSend()
    }
  }

  const activityLabel = syncing
    ? ts('chat.reminderGraph.statusSyncing')
    : busy
      ? ts('chat.reminderGraph.statusBusy')
      : error
        ? error
        : askReply
          ? ts('chat.reminderGraph.authoringReplyReady')
          : ts('chat.reminderGraph.authoringIdle')

  return (
    <div className={styles.composer} data-reminder-goal-composer="">
      <div className={styles.bookmarkStack}>
        <div
          className={styles.bookmarkTabs}
          role="tablist"
          aria-label={ts('chat.reminderGraph.composerSheets')}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activityOpen}
            className={`${styles.bookmarkTab} ${activityOpen ? styles.bookmarkTabActive : ''} ${
              working || offer ? styles.bookmarkTabBusy : ''
            } ${offer && !activityOpen ? styles.bookmarkTabAttention : ''}`}
            onClick={() => toggleComposerSheet('activity')}
          >
            <ChevronUp
              size={11}
              aria-hidden
              className={activityOpen ? styles.bookmarkChevronOpen : undefined}
            />
            {ts('chat.reminderGraph.activitySheet')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={contextOpen}
            className={`${styles.bookmarkTab} ${contextOpen ? styles.bookmarkTabActive : ''}`}
            onClick={() => toggleComposerSheet('context')}
          >
            <ChevronUp
              size={11}
              aria-hidden
              className={contextOpen ? styles.bookmarkChevronOpen : undefined}
            />
            {ts('chat.reminderGraph.contextSheet')}
          </button>
        </div>

        {activityOpen ? (
          <div className={styles.sheetPanel} role="tabpanel" data-reminder-sheet="activity">
            {working || error || askReply ? (
              <div className={styles.flowCurrent}>
                <AgentActivityIndicator
                  state={working ? 'working' : 'composing'}
                  label={activityLabel}
                />
              </div>
            ) : (
              <p className={styles.contextEmpty}>{ts('chat.reminderGraph.authoringIdle')}</p>
            )}
            {askReply && !working ? (
              <p className={styles.contextSection}>{askReply}</p>
            ) : null}
            {recentChangelog.length > 0 ? (
              <ul className={styles.flowSteps}>
                {recentChangelog.map((entry) => (
                  <li key={`${entry.at}-${entry.message}`} className={styles.flowStep}>
                    {entry.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {contextOpen ? (
          <div className={styles.sheetPanel} role="tabpanel" data-reminder-sheet="context">
            {!selected ? (
              <p className={styles.contextEmpty}>{ts('chat.reminderGraph.contextEmpty')}</p>
            ) : (
              <div className={styles.contextBlock}>
                <h3 className={styles.contextTitle}>{selected.title}</h3>
                <p className={styles.contextMeta}>
                  {ts(`chat.reminderGraph.kind.${selected.kind}`)}
                  {selected.reminderStatus
                    ? ` · ${ts(`chat.reminderGraph.reminderStatus.${selected.reminderStatus}`)}`
                    : null}
                  {selected.milestoneStatus
                    ? ` · ${ts(`chat.reminderGraph.milestoneStatus.${selected.milestoneStatus}`)}`
                    : null}
                </p>
                {selected.summary ? (
                  <p className={styles.contextSection}>{selected.summary}</p>
                ) : null}
                <p className={styles.contextSection}>{ts('chat.reminderGraph.contextInlineHint')}</p>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {offer ? (
        <div className={styles.offerCard} data-reminder-edit-offer="">
          <p>{offer.reason}</p>
          <div className={styles.offerActions}>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
              disabled={working}
              onClick={() => void acceptEditOffer()}
            >
              {ts('chat.reminderGraph.offerAccept')}
            </button>
            <button
              type="button"
              className={styles.actionButton}
              disabled={working}
              onClick={() => void dismissEditOffer()}
            >
              {ts('chat.reminderGraph.offerDismiss')}
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.promptDock}>
        <div className={styles.inputComposer}>
          <div className={styles.composerBody}>
            <textarea
              ref={textareaRef}
              className={styles.input}
              value={composerDraft}
              disabled={working}
              placeholder={
                mode === 'ask'
                  ? ts('chat.reminderGraph.askPlaceholder')
                  : ts('chat.reminderGraph.editPlaceholder')
              }
              aria-label={ts('chat.reminderGraph.composerInput')}
              onChange={(event) => setComposerDraft(event.target.value)}
              onKeyDown={onKeyDown}
              rows={3}
            />
          </div>
          <div className={styles.footer}>
            <div className={styles.leftCluster}>
              <div className={styles.menuWrap} ref={modeMenuRef}>
                <Chip
                  active={modeMenuOpen}
                  className={styles.modeChip}
                  aria-expanded={modeMenuOpen}
                  aria-haspopup="listbox"
                  aria-label={ts('chat.reminderGraph.modes')}
                  disabled={working}
                  onClick={() => setModeMenuOpen((open) => !open)}
                >
                  <ModeIcon size={14} strokeWidth={2} aria-hidden />
                  <span>{modeLabel}</span>
                  <span aria-hidden>▾</span>
                </Chip>
                {modeMenuOpen ? (
                  <div className={styles.dropdownAnchor} role="listbox">
                    {COMPOSER_MODES.map((option) => {
                      const OptionIcon = MODE_ICON[option]
                      const active = option === mode
                      return (
                        <button
                          key={option}
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={`${styles.menuItem} ${active ? styles.menuItemActive : ''}`}
                          onClick={() => {
                            void setComposerMode(option)
                            setModeMenuOpen(false)
                          }}
                        >
                          <OptionIcon size={15} strokeWidth={2} aria-hidden />
                          {ts(`chat.reminderGraph.mode.${option}`)}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            </div>
            <div className={styles.rightCluster}>
              <Button type="button" size="sm" disabled={submitDisabled} onClick={onSend}>
                {ts('chat.reminderGraph.send')}
              </Button>
            </div>
          </div>
        </div>
        {document.lastSyncedAt ? (
          <span className={styles.metaHint}>
            {ts('chat.reminderGraph.lastSynced', {
              at: document.lastSyncedAt.slice(0, 19).replace('T', ' '),
            })}
          </span>
        ) : null}
      </div>
    </div>
  )
}
