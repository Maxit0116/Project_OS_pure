import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { SessionTidyActionKind, SessionTidyPlan } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useSessionSweepStore } from '../../state/sessionSweepStore'
import SessionTranscriptAccordion from './SessionTranscriptAccordion'
import styles from './SessionGraphCenterSheet.module.css'

interface Props {
  plan: SessionTidyPlan
  onLocate: (sessionId: string) => void
}

interface ClusterDraft {
  accepted: boolean
  actions: Record<string, SessionTidyActionKind>
}

export default function SessionTidyReviewSheet({ plan, onLocate }: Props) {
  const { ts } = useI18n()
  const closeCenterSheet = useSessionSweepStore((s) => s.closeCenterSheet)
  const confirmTidy = useSessionSweepStore((s) => s.confirmTidy)
  const dismissTidyKeepingAll = useSessionSweepStore((s) => s.dismissTidyKeepingAll)
  const allowAbsorb = useSessionSweepStore((s) => s.preferences.allowAbsorb)
  const [drafts, setDrafts] = useState<Record<string, ClusterDraft>>({})
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const next: Record<string, ClusterDraft> = {}
    for (const cluster of plan.clusters) {
      const actions: Record<string, SessionTidyActionKind> = {}
      for (const member of cluster.members) {
        if (member.role !== 'satellite') continue
        actions[member.sessionId] =
          !allowAbsorb && member.suggestedAction === 'absorb'
            ? 'attach'
            : member.suggestedAction
      }
      next[cluster.id] = { accepted: true, actions }
    }
    setDrafts(next)
    setExpandedSessionId(null)
  }, [plan, allowAbsorb])

  const acceptedCount = useMemo(
    () => plan.clusters.filter((cluster) => drafts[cluster.id]?.accepted).length,
    [drafts, plan.clusters],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCenterSheet()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeCenterSheet])

  const actionOptions: SessionTidyActionKind[] = allowAbsorb
    ? ['attach', 'rehome', 'absorb']
    : ['attach', 'rehome']

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeCenterSheet()
      }}
    >
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={ts('chat.sessionGraph.tidy.title')}
      >
        <header className={styles.header}>
          <div className={styles.headerText}>
            <h2 className={styles.title}>{ts('chat.sessionGraph.tidy.title')}</h2>
            <p className={styles.subtitle}>{ts('chat.sessionGraph.tidy.subtitle')}</p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            aria-label={ts('chat.sessionGraph.tidy.close')}
            onClick={() => closeCenterSheet()}
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className={styles.toolbar}>
          <span className={styles.toolbarMeta}>
            {ts('chat.sessionGraph.tidy.selectionSummary', {
              acceptCount: acceptedCount,
              skipCount: plan.clusters.length - acceptedCount,
            })}
          </span>
        </div>

        {plan.clusters.length === 0 ? (
          <div className={styles.empty}>{ts('chat.sessionGraph.tidy.empty')}</div>
        ) : (
          <ul className={styles.list}>
            {plan.clusters.map((cluster) => {
              const draft = drafts[cluster.id]
              const accepted = draft?.accepted ?? true
              const anchor = cluster.members.find((member) => member.role === 'anchor')
              const satellites = cluster.members.filter((member) => member.role === 'satellite')
              return (
                <li
                  key={cluster.id}
                  className={styles.row}
                  style={{ gridTemplateColumns: '20px 1fr' }}
                >
                  <input
                    className={styles.rowCheckbox}
                    type="checkbox"
                    checked={accepted}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [cluster.id]: {
                          accepted: event.target.checked,
                          actions: current[cluster.id]?.actions ?? {},
                        },
                      }))
                    }
                    aria-label={cluster.label}
                  />
                  <div className={styles.rowBody}>
                    <div className={styles.rowTitle}>{cluster.label}</div>
                    {anchor ? (
                      <SessionTranscriptAccordion
                        sessionId={anchor.sessionId}
                        fallbackTitle={anchor.title}
                        expanded={expandedSessionId === anchor.sessionId}
                        onToggle={() =>
                          setExpandedSessionId((current) =>
                            current === anchor.sessionId ? null : anchor.sessionId,
                          )
                        }
                        meta={
                          <span className={`${styles.chip} ${styles.chipAction}`}>
                            {ts('chat.sessionGraph.tidy.anchor')}
                          </span>
                        }
                        aside={
                          <button
                            type="button"
                            className={styles.linkButton}
                            onClick={() => onLocate(anchor.sessionId)}
                          >
                            {ts('chat.sessionGraph.tidy.locate')}
                          </button>
                        }
                      />
                    ) : null}
                    {satellites.map((member) => (
                      <SessionTranscriptAccordion
                        key={member.sessionId}
                        sessionId={member.sessionId}
                        fallbackTitle={member.title}
                        expanded={expandedSessionId === member.sessionId}
                        onToggle={() =>
                          setExpandedSessionId((current) =>
                            current === member.sessionId ? null : member.sessionId,
                          )
                        }
                        meta={
                          <>
                            {member.reasons.map((reason) => (
                              <span key={reason} className={styles.chip}>
                                {ts(`chat.sessionGraph.tidy.reason.${reason}`)}
                              </span>
                            ))}
                          </>
                        }
                        aside={
                          <>
                            <button
                              type="button"
                              className={styles.linkButton}
                              onClick={() => onLocate(member.sessionId)}
                            >
                              {ts('chat.sessionGraph.tidy.locate')}
                            </button>
                            <select
                              className={styles.toolbarButton}
                              disabled={!accepted}
                              value={
                                draft?.actions[member.sessionId] ?? member.suggestedAction
                              }
                              onChange={(event) => {
                                const value = event.target.value as SessionTidyActionKind
                                setDrafts((current) => ({
                                  ...current,
                                  [cluster.id]: {
                                    accepted: current[cluster.id]?.accepted ?? true,
                                    actions: {
                                      ...(current[cluster.id]?.actions ?? {}),
                                      [member.sessionId]: value,
                                    },
                                  },
                                }))
                              }}
                              aria-label={ts('chat.sessionGraph.tidy.actionLabel')}
                            >
                              {actionOptions.map((action) => (
                                <option key={action} value={action}>
                                  {ts(`chat.sessionGraph.tidy.action.${action}`)}
                                </option>
                              ))}
                            </select>
                          </>
                        }
                      />
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={busy}
            onClick={() => dismissTidyKeepingAll()}
          >
            {ts('chat.sessionGraph.tidy.skipAll')}
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={busy || acceptedCount === 0}
            onClick={() => {
              const hasAbsorb = plan.clusters.some((cluster) => {
                if (!drafts[cluster.id]?.accepted) return false
                return cluster.members.some((member) => {
                  if (member.role !== 'satellite') return false
                  const action = drafts[cluster.id]?.actions[member.sessionId]
                  return action === 'absorb'
                })
              })
              if (hasAbsorb) {
                const ok = window.confirm(ts('chat.sessionGraph.tidy.absorbConfirm'))
                if (!ok) return
              }
              setBusy(true)
              void confirmTidy(
                plan.clusters.map((cluster) => ({
                  clusterId: cluster.id,
                  accepted: Boolean(drafts[cluster.id]?.accepted),
                  actions: drafts[cluster.id]?.actions ?? {},
                })),
              ).finally(() => setBusy(false))
            }}
          >
            {ts('chat.sessionGraph.tidy.confirm')}
          </button>
        </footer>
      </div>
    </div>
  )
}
