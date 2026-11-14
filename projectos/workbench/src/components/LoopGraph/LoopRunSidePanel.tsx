import { useMemo, useState } from 'react'
import type { LoopInstance, LoopInstanceArtifact } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useLoopGraphStore } from '../../state/loopGraphStore'
import styles from './LoopRunSidePanel.module.css'

type HistoryRow = {
  id: string
  status: string
  specVersion: string
  startedAt: string
  completedAt?: string
  round: number
  errorMessage?: string
}

type Props = {
  instance: LoopInstance
  history?: HistoryRow[]
}

function decisionSummary(artifact: LoopInstanceArtifact): string {
  const data = artifact.data as {
    choice?: string
    summary?: string
    mode?: string
    answers?: Array<{ answer: string }>
  }
  if (typeof data.choice === 'string' && data.choice.trim()) return data.choice
  if (typeof data.summary === 'string' && data.summary.trim()) return data.summary
  const first = data.answers?.[0]?.answer
  if (first) return first
  return data.mode ?? artifact.kind
}

/** Prefer latest passed test + latest change_set near top so they aren't only below the fold. */
function rankArtifacts(items: LoopInstanceArtifact[]): LoopInstanceArtifact[] {
  const scored = items.map((item, index) => {
    const data = item.data as { status?: string }
    let score = index
    if (item.kind === 'test_report' && data.status === 'passed') score += 10_000
    else if (item.kind === 'change_set') score += 5_000
    else if (item.kind === 'test_report' && data.status === 'failed') score += 1_000
    return { item, score, index }
  })
  return scored
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .map((row) => row.item)
}

export default function LoopRunSidePanel({ instance, history = [] }: Props) {
  const { ts } = useI18n()
  const restoreFromCheckpoint = useLoopGraphStore((s) => s.restoreFromCheckpoint)
  const deriveDraftFromRun = useLoopGraphStore((s) => s.deriveDraftFromRun)
  const artifacts = instance.artifacts ?? []
  const decisions = artifacts.filter((item) => item.kind === 'human_decision')
  const evidenceLike = useMemo(
    () => rankArtifacts(artifacts.filter((item) => item.kind !== 'human_decision')),
    [artifacts],
  )
  const records = instance.nodeRecords ?? []
  const freshness = instance.freshness?.status ?? 'unknown'
  const budget = instance.budgetUsage
  const hasCheckpoint = Boolean(instance.checkpoint)
  const [expandedDiffId, setExpandedDiffId] = useState<string | null>(null)

  return (
    <div className={styles.panel} data-loop-run-side-panel="">
      <div className={styles.meta}>
        {ts('chat.loopGraph.instanceStatus')}: {instance.status} · round {instance.round}
        {instance.launch?.kind ? ` · ${instance.launch.kind}` : ''}
      </div>

      <section className={styles.section}>
        <h4 className={styles.heading}>{ts('chat.loopGraph.runReliability')}</h4>
        <ul className={styles.list}>
          <li className={styles.row}>
            <span
              className={`${styles.dot} ${
                freshness === 'stale'
                  ? styles.tone_blocked
                  : freshness === 'fresh'
                    ? styles.tone_succeeded
                    : ''
              }`}
              aria-hidden
            />
            <span className={styles.rowId}>{ts('chat.loopGraph.runFreshness')}</span>
            <span className={styles.rowStatus}>{freshness}</span>
          </li>
          <li className={styles.row}>
            <span className={styles.dot} aria-hidden />
            <span className={styles.rowId}>{ts('chat.loopGraph.runBudget')}</span>
            <span className={styles.rowStatus}>
              {budget?.wallClockMs != null ? `${Math.round(budget.wallClockMs / 1000)}s` : '—'}
              {budget?.retries != null ? ` · r${budget.retries}` : ''}
            </span>
          </li>
        </ul>
        {hasCheckpoint ? (
          <button
            type="button"
            className={styles.action}
            onClick={() => void restoreFromCheckpoint(instance.id)}
          >
            {ts('chat.loopGraph.restoreCheckpoint')}
          </button>
        ) : null}
      </section>

      {(instance.workGroupRecords?.length ?? 0) > 0 ? (
        <section className={styles.section} data-loop-run-work-groups="">
          <h4 className={styles.heading}>{ts('chat.loopGraph.workGroup.runStates')}</h4>
          <ul className={styles.list}>
            {(instance.workGroupRecords ?? []).map((group) => (
              <li key={group.workGroupId} className={styles.row}>
                <span
                  className={`${styles.dot} ${styles[`tone_${group.status}`] ?? ''}`}
                  aria-hidden
                />
                <span className={styles.rowId}>
                  {group.workGroupId}
                  <span className={styles.rowStatus}>
                    {' '}
                    · {group.memberNodeIds.length} · c{group.agentCalls ?? 0}
                  </span>
                </span>
                <span className={styles.rowStatus}>{group.status}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.section}>
        <h4 className={styles.heading}>{ts('chat.loopGraph.runNodeStates')}</h4>
        {records.length === 0 ? (
          <p className={styles.empty}>{ts('chat.loopGraph.runNodeStatesEmpty')}</p>
        ) : (
          <ul className={styles.list}>
            {records.map((record) => (
              <li key={record.nodeId} className={styles.row}>
                <span
                  className={`${styles.dot} ${styles[`tone_${record.status}`] ?? ''}`}
                  aria-hidden
                />
                <span className={styles.rowId}>{record.nodeId}</span>
                <span className={styles.rowStatus}>{record.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h4 className={styles.heading}>{ts('chat.loopGraph.runDecisions')}</h4>
        {decisions.length === 0 ? (
          <p className={styles.empty}>{ts('chat.loopGraph.runDecisionsEmpty')}</p>
        ) : (
          <ul className={styles.list}>
            {decisions
              .slice()
              .reverse()
              .map((item) => (
                <li key={item.id} className={styles.row}>
                  <span className={styles.rowId}>{item.nodeId}</span>
                  <span className={styles.rowStatus}>{decisionSummary(item)}</span>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className={styles.section} data-loop-run-artifacts="">
        <h4 className={styles.heading}>{ts('chat.loopGraph.runArtifacts')}</h4>
        {evidenceLike.length === 0 ? (
          <p className={styles.empty}>{ts('chat.loopGraph.runArtifactsEmpty')}</p>
        ) : (
          <ul className={styles.artifactsScroll} data-loop-artifacts-scroll="">
            {evidenceLike.slice(0, 16).map((item) => {
              const data = item.data as Record<string, unknown>
              const isChange = item.kind === 'change_set'
              const isTest = item.kind === 'test_report'
              const files = Array.isArray(data.files)
                ? (data.files as string[])
                : []
              const summary =
                typeof data.summary === 'string' ? data.summary : null
              const digest =
                typeof data.contentDigest === 'string'
                  ? data.contentDigest
                  : typeof data.validatedCodeDigest === 'string'
                    ? data.validatedCodeDigest
                    : null
              const status =
                typeof data.status === 'string' ? data.status : null
              const command =
                typeof data.command === 'string' ? data.command : null
              const exitCode =
                typeof data.exitCode === 'number' || data.exitCode === null
                  ? (data.exitCode as number | null)
                  : undefined
              const unifiedDiff =
                typeof data.unifiedDiff === 'string' ? data.unifiedDiff : null
              const expanded = expandedDiffId === item.id
              return (
                <li
                  key={item.id}
                  className={styles.artifactCard}
                  data-loop-run-artifact=""
                  data-loop-artifact-kind={item.kind}
                  data-loop-artifact-id={item.id}
                  data-loop-artifact-status={status ?? undefined}
                >
                  <div className={styles.row}>
                    <span className={styles.rowId}>{item.nodeId}</span>
                    <span className={styles.rowStatus}>{item.kind}</span>
                  </div>
                  {isChange ? (
                    <div
                      className={styles.artifactBody}
                      data-loop-artifact-changeset=""
                    >
                      {summary ? <p className={styles.artifactLine}>{summary}</p> : null}
                      {files.length ? (
                        <p className={styles.artifactLine}>
                          files: {files.slice(0, 8).join(', ')}
                        </p>
                      ) : null}
                      {digest ? (
                        <p className={styles.artifactMono}>digest: {digest.slice(0, 16)}…</p>
                      ) : null}
                      {unifiedDiff ? (
                        <>
                          <button
                            type="button"
                            className={styles.linkish}
                            data-loop-artifact-diff-toggle=""
                            onClick={() =>
                              setExpandedDiffId((id) => (id === item.id ? null : item.id))
                            }
                          >
                            {expanded
                              ? ts('chat.loopGraph.runHideDiff')
                              : ts('chat.loopGraph.runShowDiff')}
                          </button>
                          {expanded ? (
                            <pre
                              className={styles.diffBlock}
                              data-loop-artifact-unified-diff=""
                            >
                              {unifiedDiff.slice(0, 8_000)}
                            </pre>
                          ) : (
                            <pre
                              className={styles.diffPreview}
                              data-loop-artifact-diff-preview=""
                            >
                              {unifiedDiff.split('\n').slice(0, 8).join('\n')}
                            </pre>
                          )}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {isTest ? (
                    <div
                      className={styles.artifactBody}
                      data-loop-artifact-test-report=""
                    >
                      {status ? (
                        <p className={styles.artifactLine}>status: {status}</p>
                      ) : null}
                      {command ? (
                        <p className={styles.artifactMono}>cmd: {command}</p>
                      ) : null}
                      {exitCode !== undefined ? (
                        <p
                          className={styles.artifactMono}
                          data-loop-artifact-exit-code=""
                        >
                          exit: {exitCode === null ? 'null' : String(exitCode)}
                        </p>
                      ) : null}
                      {digest ? (
                        <p className={styles.artifactMono}>
                          validated: {digest.slice(0, 16)}…
                        </p>
                      ) : null}
                      {status === 'failed' ? (
                        <p
                          className={styles.artifactLine}
                          data-loop-artifact-test-failed-hint=""
                        >
                          {ts('chat.loopGraph.runTestFailedHint')}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h4 className={styles.heading}>{ts('chat.loopGraph.runHistory')}</h4>
        {history.length === 0 ? (
          <p className={styles.empty}>{ts('chat.loopGraph.runHistoryEmpty')}</p>
        ) : (
          <ul className={styles.list}>
            {history.slice(0, 8).map((row) => (
              <li key={row.id} className={styles.historyRow}>
                <div className={styles.row}>
                  <span className={styles.dot} aria-hidden />
                  <span className={styles.rowId}>{row.id.slice(0, 12)}</span>
                  <span className={styles.rowStatus}>{row.status}</span>
                </div>
                <button
                  type="button"
                  className={styles.action}
                  onClick={() => void deriveDraftFromRun(row.id)}
                >
                  {ts('chat.loopGraph.deriveDraft')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h4 className={styles.heading}>{ts('chat.loopGraph.runEvents')}</h4>
        <ul className={styles.list}>
          {instance.events
            .slice(-10)
            .reverse()
            .map((event) => (
              <li key={event.id} className={styles.event}>
                {event.at.slice(11, 19)} · {event.type}
                {event.message ? ` — ${event.message}` : ''}
              </li>
            ))}
        </ul>
      </section>
    </div>
  )
}
