import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { SessionSweepPlanWithLlm } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useSessionSweepStore } from '../../state/sessionSweepStore'
import SessionTranscriptAccordion from './SessionTranscriptAccordion'
import styles from './SessionGraphCenterSheet.module.css'

interface Props {
  plan: SessionSweepPlanWithLlm
  onLocate: (sessionId: string) => void
}

export default function SessionSweepReviewSheet({ plan, onLocate }: Props) {
  const { ts } = useI18n()
  const closeCenterSheet = useSessionSweepStore((s) => s.closeCenterSheet)
  const confirmSweep = useSessionSweepStore((s) => s.confirmSweep)
  const dismissSweepKeepingAll = useSessionSweepStore((s) => s.dismissSweepKeepingAll)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const next: Record<string, boolean> = {}
    for (const candidate of plan.candidates) {
      next[candidate.sessionId] = candidate.defaultChecked !== false
    }
    setChecked(next)
    setExpandedSessionId(null)
  }, [plan])

  const checkedIds = useMemo(
    () => plan.candidates.filter((item) => checked[item.sessionId]).map((item) => item.sessionId),
    [checked, plan.candidates],
  )
  const keptCount = plan.candidates.length - checkedIds.length

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCenterSheet()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeCenterSheet])

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
        aria-label={ts('chat.sessionGraph.sweep.title')}
      >
        <header className={styles.header}>
          <div className={styles.headerText}>
            <h2 className={styles.title}>{ts('chat.sessionGraph.sweep.title')}</h2>
            <p className={styles.subtitle}>{ts('chat.sessionGraph.sweep.subtitle')}</p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            aria-label={ts('chat.sessionGraph.sweep.close')}
            onClick={() => closeCenterSheet()}
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={() => {
              const next: Record<string, boolean> = {}
              for (const candidate of plan.candidates) next[candidate.sessionId] = true
              setChecked(next)
            }}
          >
            {ts('chat.sessionGraph.sweep.selectAll')}
          </button>
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={() => {
              const next: Record<string, boolean> = {}
              for (const candidate of plan.candidates) next[candidate.sessionId] = false
              setChecked(next)
            }}
          >
            {ts('chat.sessionGraph.sweep.selectNone')}
          </button>
          <span className={styles.toolbarMeta}>
            {ts('chat.sessionGraph.sweep.selectionSummary', {
              deleteCount: checkedIds.length,
              keepCount: keptCount,
            })}
          </span>
        </div>

        {plan.candidates.length === 0 ? (
          <div className={styles.empty}>{ts('chat.sessionGraph.sweep.empty')}</div>
        ) : (
          <ul className={styles.list}>
            {plan.candidates.map((candidate) => {
              const expanded = expandedSessionId === candidate.sessionId
              return (
                <li
                  key={candidate.sessionId}
                  className={styles.row}
                  style={{ gridTemplateColumns: '20px 1fr' }}
                >
                  <input
                    className={styles.rowCheckbox}
                    type="checkbox"
                    checked={Boolean(checked[candidate.sessionId])}
                    onChange={(event) =>
                      setChecked((current) => ({
                        ...current,
                        [candidate.sessionId]: event.target.checked,
                      }))
                    }
                    aria-label={candidate.title}
                  />
                  <div className={styles.rowBody}>
                    <SessionTranscriptAccordion
                      sessionId={candidate.sessionId}
                      fallbackTitle={candidate.title}
                      expanded={expanded}
                      onToggle={() =>
                        setExpandedSessionId((current) =>
                          current === candidate.sessionId ? null : candidate.sessionId,
                        )
                      }
                      meta={
                        <>
                          <span className={`${styles.chip} ${styles.chipAction}`}>
                            {ts(`chat.sessionGraph.sweep.action.${candidate.action}`)}
                          </span>
                          {candidate.llmSource === 'llm' ? (
                            <span className={styles.chip}>
                              {ts('chat.sessionGraph.affinity.llmConfirmed')}
                            </span>
                          ) : null}
                          {candidate.reasons.map((reason) => (
                            <span key={reason} className={styles.chip}>
                              {ts(`chat.sessionGraph.sweep.reason.${reason}`)}
                            </span>
                          ))}
                          {candidate.llmRationale ? (
                            <span className={styles.chip} title={candidate.llmRationale}>
                              {candidate.llmRationale}
                            </span>
                          ) : null}
                        </>
                      }
                      aside={
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() => onLocate(candidate.sessionId)}
                        >
                          {ts('chat.sessionGraph.sweep.locate')}
                        </button>
                      }
                    />
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
            onClick={() => dismissSweepKeepingAll()}
          >
            {ts('chat.sessionGraph.sweep.keepAll')}
          </button>
          <button
            type="button"
            className={styles.dangerButton}
            disabled={busy || checkedIds.length === 0}
            onClick={() => {
              const confirmed = window.confirm(
                ts('chat.sessionGraph.sweep.confirmPrompt', { count: checkedIds.length }),
              )
              if (!confirmed) return
              setBusy(true)
              void confirmSweep(checkedIds).finally(() => setBusy(false))
            }}
          >
            {ts('chat.sessionGraph.sweep.confirmDelete')}
          </button>
        </footer>
      </div>
    </div>
  )
}
