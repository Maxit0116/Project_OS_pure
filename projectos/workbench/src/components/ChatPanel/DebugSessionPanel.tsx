import { useEffect, useState } from 'react'
import type { BugAlignmentItem, DebugSession } from '@contracts/index'
import { useI18n } from '../../i18n'
import Button from '../ui/Button'
import HypothesisCard from '../DebugHarness/HypothesisCard'
import styles from './DebugSessionPanel.module.css'

interface Props {
  session: DebugSession
  fixInProgress: boolean
  onReproduced: () => void
  onConfirmFix: () => void
  onMarkFixed: () => void
  onConfirmBugAlignment: (
    bugs: Array<{ id: string; selected: boolean; comment?: string; rejected?: boolean }>,
  ) => void
  onMarkBugFixed: (bugId: string) => void
}

const PHASES = [
  'align',
  'hypothesize',
  'instrument',
  'reproduce',
  'analyze',
  'fix',
  'verify',
  'cleanup',
  'complete',
] as const

type BugDraft = {
  selected: boolean
  comment: string
  commentOpen: boolean
}

function initialBugDrafts(bugs: BugAlignmentItem[] | undefined): Record<string, BugDraft> {
  return Object.fromEntries(
    (bugs ?? []).map((bug) => [
      bug.id,
      {
        selected: bug.selected,
        comment: bug.comment ?? '',
        commentOpen: Boolean(bug.comment?.trim()),
      },
    ]),
  )
}

export default function DebugSessionPanel({
  session,
  fixInProgress,
  onReproduced,
  onConfirmFix,
  onMarkFixed,
  onConfirmBugAlignment,
  onMarkBugFixed,
}: Props) {
  const { ts } = useI18n()
  const phaseIndex = PHASES.indexOf(session.phase)
  const [bugDrafts, setBugDrafts] = useState(() => initialBugDrafts(session.bugs))

  useEffect(() => {
    setBugDrafts(initialBugDrafts(session.bugs))
  }, [session.sessionId, session.bugsAligned])

  const aligning = session.phase === 'align' || (session.bugsAligned === false && (session.bugs?.length ?? 0) > 1)
  const bugs = session.bugs ?? []

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3>{ts('debug.title')}</h3>
        <span className={styles.phase}>{ts(`debug.phase.${session.phase}`)}</span>
      </div>

      <div className={styles.progress}>
        {PHASES.map((phase, index) => (
          <span
            key={phase}
            className={`${styles.progressStep} ${index <= phaseIndex ? styles.progressActive : ''}`}
          >
            {ts(`debug.phase.${phase}`)}
          </span>
        ))}
      </div>

      {aligning && bugs.length > 0 ? (
        <section className={styles.section} data-testid="bug-alignment">
          <h4>{ts('debug.alignTitle')}</h4>
          <p className={styles.help}>{ts('debug.alignHelp')}</p>
          <ul className={styles.bugList}>
            {bugs.map((bug) => {
              const draft = bugDrafts[bug.id]
              return (
                <li key={bug.id} className={styles.bugRow}>
                  <label className={styles.bugCheck}>
                    <input
                      type="checkbox"
                      checked={draft?.selected ?? bug.selected}
                      disabled={fixInProgress}
                      onChange={(event) =>
                        setBugDrafts((current) => ({
                          ...current,
                          [bug.id]: {
                            selected: event.target.checked,
                            comment: current[bug.id]?.comment ?? '',
                            commentOpen: current[bug.id]?.commentOpen ?? false,
                          },
                        }))
                      }
                    />
                    <span>{bug.summary}</span>
                  </label>
                  <button
                    type="button"
                    className={styles.commentToggle}
                    disabled={fixInProgress}
                    onClick={() =>
                      setBugDrafts((current) => ({
                        ...current,
                        [bug.id]: {
                          selected: current[bug.id]?.selected ?? bug.selected,
                          comment: current[bug.id]?.comment ?? '',
                          commentOpen: !(current[bug.id]?.commentOpen ?? false),
                        },
                      }))
                    }
                  >
                    {ts('alignment.addComment')}
                  </button>
                  {draft?.commentOpen ? (
                    <textarea
                      className={styles.commentInput}
                      value={draft.comment}
                      disabled={fixInProgress}
                      placeholder={ts('debug.commentPlaceholder')}
                      rows={2}
                      onChange={(event) =>
                        setBugDrafts((current) => ({
                          ...current,
                          [bug.id]: {
                            selected: current[bug.id]?.selected ?? bug.selected,
                            comment: event.target.value,
                            commentOpen: true,
                          },
                        }))
                      }
                    />
                  ) : null}
                </li>
              )
            })}
          </ul>
          <div className={styles.actions}>
            <Button
              disabled={fixInProgress || !bugs.some((bug) => bugDrafts[bug.id]?.selected)}
              onClick={() =>
                onConfirmBugAlignment(
                  bugs.map((bug) => {
                    const draft = bugDrafts[bug.id]
                    const selected = draft?.selected ?? bug.selected
                    return {
                      id: bug.id,
                      selected,
                      rejected: !selected,
                      ...(draft?.comment.trim() ? { comment: draft.comment.trim() } : {}),
                    }
                  }),
                )
              }
            >
              {ts('debug.alignConfirm')}
            </Button>
          </div>
        </section>
      ) : (
        <>
          <section className={styles.section}>
            <h4>{ts('debug.bugDescription')}</h4>
            <p>{session.bugDescription}</p>
          </section>

          {bugs.length > 0 && (
            <section className={styles.section}>
              <h4>{ts('debug.alignTitle')}</h4>
              <ul className={styles.bugList}>
                {bugs.map((bug) => (
                  <li key={bug.id} className={styles.bugRow}>
                    <div className={styles.bugStatusRow}>
                      <span>{bug.summary}</span>
                      <span className={styles.bugStatus}>
                        {ts(`debug.bugStatus.${bug.status}` as 'debug.bugStatus.fixed')}
                      </span>
                    </div>
                    {bug.comment ? <p className={styles.help}>{bug.comment}</p> : null}
                    {session.phase === 'verify' &&
                    bug.selected &&
                    bug.status !== 'rejected' &&
                    bug.status !== 'fixed' ? (
                      <Button
                        variant="secondary"
                        disabled={fixInProgress}
                        onClick={() => onMarkBugFixed(bug.id)}
                      >
                        {ts('debug.markBugFixed')}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {session.reproSteps.length > 0 && (
            <section className={styles.section}>
              <h4>{ts('debug.reproSteps')}</h4>
              <ol>
                {session.reproSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
          )}

          {session.hypotheses.length > 0 && (
            <section className={styles.section}>
              <h4>{ts('debug.hypotheses')}</h4>
              {session.hypotheses.map((hypothesis) => (
                <HypothesisCard
                  key={hypothesis.id}
                  hypothesis={hypothesis}
                  isChosen={hypothesis.id === session.chosenRootCauseId}
                />
              ))}
            </section>
          )}

          {session.proposedFix && (
            <section className={styles.section}>
              <h4>{ts('debug.proposedFix')}</h4>
              <p>{session.proposedFix.summary}</p>
            </section>
          )}

          <div className={styles.actions}>
            {session.phase === 'hypothesize' && (
              <Button onClick={onReproduced}>{ts('debug.continueToReproduce')}</Button>
            )}
            {session.phase === 'reproduce' && (
              <Button onClick={onReproduced}>{ts('debug.reproduced')}</Button>
            )}
            {session.phase === 'fix' && (
              <Button onClick={onConfirmFix} disabled={fixInProgress}>
                {ts('debug.applyFix')}
              </Button>
            )}
            {session.phase === 'verify' && (
              <Button onClick={onMarkFixed}>{ts('debug.markFixed')}</Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
