import { useEffect, useMemo, useState } from 'react'
import type { AgentRunEvent } from '@contracts/index'
import { ChevronDown, ChevronRight, Layers } from 'lucide-react'
import { createWorkbenchClient } from '../../../data/workbenchClient'
import { useI18n } from '../../../i18n'
import Button from '../../ui/Button'
import { useAgentPoolStore } from './agentPoolStore'
import AgentPoolHistoryStrip from './AgentPoolHistoryStrip'
import AgentPoolJumpMenu from './AgentPoolJumpMenu'
import AgentPoolMiniWaterfall from './AgentPoolMiniWaterfall'
import AgentPoolModelIcon from './AgentPoolModelIcon'
import AgentPoolRowExpand from './AgentPoolRowExpand'
import {
  projectAgentPoolSpans,
  type AgentPoolHistoryEntry,
  type AgentPoolTask,
} from './projectAgentPool'
import {
  aggregateAgentPoolRunKpi,
  type AgentPoolTraceProjection,
} from './projectAgentPoolTrace'
import { formatElapsed, laneElapsedMs } from './poolTiming'
import styles from './AgentPoolRow.module.css'

type HydratedHistory = AgentPoolHistoryEntry & {
  trace: AgentPoolTraceProjection
}

interface Props {
  task: AgentPoolTask
  nowMs: number
  poolOriginMs: number
  expanded: boolean
  historyExpanded: boolean
  onToggleExpand: () => void
  onToggleHistory: () => void
  onDone: () => void
}

function isLiveStatus(status: AgentPoolTask['status']): boolean {
  return (
    status === 'running' ||
    status === 'continuing' ||
    status === 'awaiting_user_done' ||
    status === 'reviewing'
  )
}

function projectEntryFromEvents(
  entry: AgentPoolHistoryEntry,
  events: AgentRunEvent[],
): HydratedHistory {
  const { spans, originMs, trace } = projectAgentPoolSpans({
    title: entry.title,
    status: 'complete',
    steps: [],
    actions: [],
    events,
    currentAction: entry.currentAction || entry.title,
    taskId: entry.id,
    agentRunId: entry.runId ?? entry.id,
    originMs: entry.originMs,
  })
  return {
    ...entry,
    spans,
    originMs,
    majorActions: trace.majorActions,
    traceSpans: trace.spans,
    trace,
    flowSteps:
      entry.flowSteps.length > 0
        ? entry.flowSteps
        : trace.majorActions.map((major) => ({
            id: major.actionId,
            label: major.name,
            status: major.status === 'failed' ? 'error' : major.status,
          })),
  }
}

function traceFromHistoryEntry(
  entry: AgentPoolHistoryEntry | HydratedHistory,
): AgentPoolTraceProjection | null {
  if ('trace' in entry && entry.trace) return entry.trace
  if (!entry.majorActions?.length && !entry.traceSpans?.length) return null
  const majorActions = entry.majorActions ?? []
  const spans = entry.traceSpans ?? []
  const relativeNow = Math.max(
    0,
    ...majorActions.map((major) => major.endMs ?? major.startMs),
    ...spans.map((span) => span.endMs ?? span.startMs),
  )
  return {
    majorActions,
    spans,
    compactBars: majorActions.map((major) => ({
      id: major.actionId,
      kind: 'major' as const,
      label: major.name,
      status:
        major.status === 'failed' || major.status === 'cancelled'
          ? ('error' as const)
          : major.status === 'running'
            ? ('running' as const)
            : ('complete' as const),
      startMs: major.startMs,
      endMs: major.endMs,
      timingQuality: major.timingQuality,
      level: 1 as const,
      attempt: major.attempt,
    })),
    kpi: aggregateAgentPoolRunKpi({ majorActions, spans }, relativeNow),
  }
}

export default function AgentPoolRow({
  task,
  nowMs,
  poolOriginMs,
  expanded,
  historyExpanded,
  onToggleExpand,
  onToggleHistory,
  onDone,
}: Props) {
  const { ts } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [hydratedById, setHydratedById] = useState<Record<string, HydratedHistory>>({})
  const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null)

  const history = useMemo(
    () =>
      task.history.map((entry) => hydratedById[entry.id] ?? entry),
    [task.history, hydratedById],
  )
  const selectedHistory =
    history.find((entry) => entry.id === selectedHistoryId) ?? null

  const stackCount = history.length
  const showDone = task.status !== 'reviewing'
  const displaySpans =
    selectedHistory && selectedHistory.spans.length > 0
      ? selectedHistory.spans
      : task.spans
  const displayOriginMs = selectedHistory?.originMs ?? poolOriginMs
  const displaySteps = selectedHistory?.flowSteps ?? task.flowSteps
  const displayAction = selectedHistory?.currentAction ?? task.currentAction
  const historyTrace = selectedHistory
    ? traceFromHistoryEntry(selectedHistory)
    : null
  const displayTask: AgentPoolTask = selectedHistory
    ? {
        ...task,
        majorActions: selectedHistory.majorActions ?? [],
        traceSpans: selectedHistory.traceSpans ?? [],
        spans: displaySpans,
        originMs: displayOriginMs,
        currentAction: displayAction,
        flowSteps: displaySteps,
        trace: historyTrace,
        runKpi: historyTrace?.kpi ?? task.runKpi,
      }
    : { ...task, originMs: displayOriginMs }

  const elapsedMs = laneElapsedMs({
    originMs: displayOriginMs,
    nowMs,
    spans: displaySpans,
    live: selectedHistory ? false : isLiveStatus(task.status),
  })

  useEffect(() => {
    if (!selectedHistoryId) return
    const entry = history.find((item) => item.id === selectedHistoryId)
    if (!entry?.runId || entry.spans.length > 0) return
    if (hydratedById[entry.id]?.spans.length) return

    let cancelled = false
    const showLoading = window.setTimeout(() => {
      if (!cancelled) setLoadingHistoryId(entry.id)
    }, 300)

    void (async () => {
      try {
        const client = createWorkbenchClient()
        if (!client.getAgentRunEventSnapshot) return
        const snapshot = await client.getAgentRunEventSnapshot(entry.runId!)
        if (cancelled || snapshot.events.length === 0) return
        const rich = projectEntryFromEvents(entry, snapshot.events as AgentRunEvent[])
        setHydratedById((prev) => ({ ...prev, [entry.id]: rich }))
      } catch {
        // Keep thin index card — snapshot may be unavailable offline.
      } finally {
        window.clearTimeout(showLoading)
        if (!cancelled) setLoadingHistoryId(null)
      }
    })()

    return () => {
      cancelled = true
      window.clearTimeout(showLoading)
    }
  }, [selectedHistoryId, history, hydratedById])

  return (
    <article
      className={styles.row}
      data-task-id={task.taskId}
      data-definition-id={task.definitionId}
      data-status={task.status}
      data-source={task.source}
      data-mode={selectedHistory ? 'history' : 'live'}
    >
      <div className={styles.main}>
        {stackCount > 0 ? (
          <button
            type="button"
            className={styles.stackBtn}
            aria-label={ts('agentFlow.pool.stackAria', { count: stackCount })}
            aria-expanded={historyExpanded}
            onClick={onToggleHistory}
          >
            <Layers size={14} aria-hidden />
            <span className={styles.stackCount}>{stackCount}</span>
            <span className={styles.stackLayers} aria-hidden data-depth={Math.min(stackCount, 3)} />
          </button>
        ) : (
          <span className={styles.stackSpacer} aria-hidden />
        )}

        <AgentPoolModelIcon label={task.modelLabel} modelId={task.modelId} />

        <div className={styles.agentBtnWrap}>
          <button
            type="button"
            className={styles.agentBtn}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className={styles.agentTitle}>{task.title}</span>
            <span className={styles.agentMetaRow}>
              <span
                className={styles.statusBadge}
                data-status={task.status}
                data-pulse={
                  task.status === 'running' || task.status === 'continuing'
                    ? 'true'
                    : undefined
                }
              >
                {ts(`agentFlow.pool.status.${task.status}` as 'agentFlow.pool.status.running')}
              </span>
              {task.acceptance === 'accepted' ? (
                <span className={styles.acceptanceTag}>
                  {ts('agentFlow.pool.acceptanceAccepted')}
                </span>
              ) : null}
              {task.acceptance === 'rejected' ? (
                <span className={styles.acceptanceTag}>
                  {ts('agentFlow.pool.acceptanceRejected')}
                </span>
              ) : null}
            </span>
          </button>
          <AgentPoolJumpMenu
            task={task}
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
          />
        </div>

        <div className={styles.lifeLine}>
          <div className={styles.lifeTop}>
            <span
              key={displayAction}
              className={styles.shortName}
              title={displayAction}
            >
              {displayAction}
            </span>
            <AgentPoolMiniWaterfall
              spans={displaySpans}
              originMs={displayOriginMs}
              nowMs={nowMs}
              compact
              ariaLabel={ts('agentFlow.pool.miniWaterfall')}
            />
            <span className={styles.elapsed} title={ts('agentFlow.pool.elapsedLabel')}>
              {ts('agentFlow.pool.elapsed', { time: formatElapsed(elapsedMs) })}
            </span>
          </div>
        </div>

        <button
          type="button"
          className={styles.expandBtn}
          aria-expanded={expanded}
          aria-label={ts('agentFlow.pool.expandFlow')}
          onClick={onToggleExpand}
        >
          <span className={styles.expandChevron} data-open={expanded ? 'true' : undefined}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </button>

        {showDone ? (
          <Button
            size="sm"
            variant={
              task.status === 'awaiting_user_done' || task.status === 'complete'
                ? 'primary'
                : 'secondary'
            }
            onClick={onDone}
          >
            {ts('agentFlow.pool.done')}
          </Button>
        ) : (
          <span className={styles.reviewingBadge}>{ts('agentFlow.pool.reviewing')}</span>
        )}
      </div>

      {historyExpanded && stackCount > 0 ? (
        <AgentPoolHistoryStrip
          task={{ ...task, history }}
          selectedHistoryId={selectedHistoryId}
          loadingHistoryId={loadingHistoryId}
          onSelectHistory={(entry: AgentPoolHistoryEntry) => {
            setSelectedHistoryId(entry.id)
            useAgentPoolStore.getState().setExpandedTaskId(task.taskId)
          }}
          onSelectCurrent={() => setSelectedHistoryId(null)}
        />
      ) : null}

      <div className={styles.expandShell} data-open={expanded ? 'true' : undefined}>
        <div className={styles.expandInner}>
          {expanded ? (
            <AgentPoolRowExpand
              task={displayTask}
              steps={displaySteps}
              spans={displaySpans}
              originMs={displayOriginMs}
              nowMs={nowMs}
              currentAction={displayAction}
            />
          ) : null}
        </div>
      </div>
    </article>
  )
}
