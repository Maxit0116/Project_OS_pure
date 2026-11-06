import { useEffect, useMemo } from 'react'
import { modelProfileLabel } from '@contracts/index'
import { Layers } from 'lucide-react'
import { useI18n } from '../../../i18n'
import { useChatSessionStore } from '../../../state/chatSessionStore'
import { useWorkbenchStore } from '../../../state/workbenchStore'
import EmptyState from '../../ui/EmptyState'
import {
  agentPoolOverlayFromStore,
  useAgentPoolStore,
} from './agentPoolStore'
import AgentPoolRow from './AgentPoolRow'
import { projectAgentPool } from './projectAgentPool'
import { useAgentPoolNow } from './useAgentPoolNow'
import styles from './AgentPoolPanel.module.css'

export default function AgentPoolPanel() {
  const { ts } = useI18n()
  const activeRunId = useWorkbenchStore((s) => s.activeRunId)
  const flowStatus = useWorkbenchStore((s) => s.flowStatus)
  const steps = useWorkbenchStore((s) => s.flowSteps)
  const flowActions = useWorkbenchStore((s) => s.flowActions)
  const flowDelegationEvents = useWorkbenchStore((s) => s.flowDelegationEvents)
  const delegatedRunTraces = useWorkbenchStore((s) => s.delegatedRunTraces)
  const settings = useWorkbenchStore((s) => s.settings)
  const selectedModelProfileId = useWorkbenchStore((s) => s.selectedModelProfileId)
  const chatSessionId = useChatSessionStore((s) => s.activeSessionId)
  const heads = useChatSessionStore((s) => s.heads)

  const removedTaskIds = useAgentPoolStore((s) => s.removedTaskIds)
  const reviewingTaskId = useAgentPoolStore((s) => s.reviewingTaskId)
  const continuingTaskIds = useAgentPoolStore((s) => s.continuingTaskIds)
  const historyByTaskId = useAgentPoolStore((s) => s.historyByTaskId)
  const acceptanceByTaskId = useAgentPoolStore((s) => s.acceptanceByTaskId)
  const expandedTaskIds = useAgentPoolStore((s) => s.expandedTaskIds)
  const historyExpandedTaskIds = useAgentPoolStore((s) => s.historyExpandedTaskIds)
  const composeSubagents = useAgentPoolStore((s) => s.composeSubagents)
  const activePoolRunId = useAgentPoolStore((s) => s.activePoolRunId)
  const ensureDiskPoolRun = useAgentPoolStore((s) => s.ensureDiskPoolRun)
  const hydrateTaskHistoryFromDisk = useAgentPoolStore(
    (s) => s.hydrateTaskHistoryFromDisk,
  )

  useEffect(() => {
    void ensureDiskPoolRun({
      rootRunId: activeRunId,
      sessionId: chatSessionId,
      definitionId: chatSessionId
        ? `def_root_${chatSessionId}`
        : 'def_root_workspace',
      title: 'Agent run',
    })
  }, [activeRunId, chatSessionId, ensureDiskPoolRun])

  const selectedModel = settings?.modelProfiles.find(
    (profile) => profile.id === selectedModelProfileId,
  )
  const modelLabel = selectedModel
    ? modelProfileLabel(selectedModel)
    : ts('chat.executionModel')

  const tasks = useMemo(
    () =>
      projectAgentPool({
        activeRunId,
        flowStatus,
        steps,
        flowActions,
        flowDelegationEvents,
        delegatedRunTraces,
        modelLabel,
        modelId: selectedModelProfileId,
        chatSessionId,
        poolRunId: activePoolRunId,
        overlay: agentPoolOverlayFromStore({
          removedTaskIds,
          reviewingTaskId,
          continuingTaskIds,
          historyByTaskId,
          acceptanceByTaskId,
        }),
        workingSessions: heads.map((head) => ({
          id: head.id,
          title: head.title,
          status: head.status,
        })),
        composeSubagents,
      }),
    [
      activeRunId,
      flowStatus,
      steps,
      flowActions,
      flowDelegationEvents,
      delegatedRunTraces,
      modelLabel,
      selectedModelProfileId,
      chatSessionId,
      activePoolRunId,
      removedTaskIds,
      reviewingTaskId,
      continuingTaskIds,
      historyByTaskId,
      acceptanceByTaskId,
      heads,
      composeSubagents,
    ],
  )

  const nowMs = useAgentPoolNow(tasks)
  const poolOriginMs = useMemo(() => {
    const origins = tasks
      .map((task) => task.originMs)
      .filter((value): value is number => Number.isFinite(value))
    return origins.length > 0 ? Math.min(...origins) : Date.now()
  }, [tasks])

  const historyHydrationKey = useMemo(
    () =>
      tasks
        .map((task) => `${task.taskId}|${task.definitionId}|${task.runId ?? ''}`)
        .sort()
        .join(';'),
    [tasks],
  )

  useEffect(() => {
    for (const task of tasks) {
      if (!task.definitionId) continue
      void hydrateTaskHistoryFromDisk({
        taskId: task.taskId,
        definitionId: task.definitionId,
        activeRunId: task.runId,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by historyHydrationKey
  }, [historyHydrationKey, hydrateTaskHistoryFromDisk])

  const summary = useMemo(() => {
    let running = 0
    let awaiting = 0
    let errors = 0
    for (const task of tasks) {
      if (task.status === 'running' || task.status === 'continuing') running += 1
      if (task.status === 'awaiting_user_done') awaiting += 1
      if (task.status === 'error') errors += 1
    }
    return { total: tasks.length, running, awaiting, errors }
  }, [tasks])

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<Layers size={16} />}
        title={ts('agentFlow.pool.emptyTitle')}
        description={ts('agentFlow.pool.emptyDesc')}
      />
    )
  }

  const isLive = summary.running > 0

  return (
    <div className={styles.panel} aria-label={ts('agentFlow.pool.title')}>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <h2 className={styles.title}>{ts('agentFlow.pool.title')}</h2>
          {isLive ? (
            <span className={styles.liveBadge} title={ts('agentFlow.pool.liveExecution')}>
              <span className={styles.liveDot} aria-hidden />
              {ts('agentFlow.pool.live')}
            </span>
          ) : null}
        </div>
      </div>
      <p className={styles.hint}>{ts('agentFlow.pool.hint')}</p>
      <div
        className={styles.summary}
        aria-label={ts('agentFlow.pool.summaryAria')}
        title={activePoolRunId ?? undefined}
      >
        <span className={styles.summaryChip}>
          <span className={styles.summaryValue}>{summary.total}</span>
          {ts('agentFlow.pool.summaryTotalLabel')}
        </span>
        <span className={styles.summaryChip} data-tone={isLive ? 'live' : undefined}>
          <span className={styles.summaryValue}>{summary.running}</span>
          {ts('agentFlow.pool.summaryRunningLabel')}
        </span>
        <span className={styles.summaryChip}>
          <span className={styles.summaryValue}>{summary.awaiting}</span>
          {ts('agentFlow.pool.summaryAwaitingLabel')}
        </span>
        {summary.errors > 0 ? (
          <span className={styles.summaryChip} data-tone="error">
            <span className={styles.summaryValue}>{summary.errors}</span>
            {ts('agentFlow.pool.summaryErrorsLabel')}
          </span>
        ) : null}
      </div>
      <div className={styles.list}>
        {tasks.map((task, index) => (
          <div
            key={task.taskId}
            className={styles.laneEnter}
            style={{
              animationDelay: `${Math.min(index, 7) * 30}ms`,
            }}
          >
            <AgentPoolRow
              task={task}
              nowMs={nowMs}
              poolOriginMs={poolOriginMs}
              expanded={expandedTaskIds.includes(task.taskId)}
              historyExpanded={historyExpandedTaskIds.includes(task.taskId)}
              onToggleExpand={() => {
                useAgentPoolStore.getState().toggleExpandedTaskId(task.taskId)
              }}
              onToggleHistory={() => {
                useAgentPoolStore.getState().toggleHistoryExpandedTaskId(task.taskId)
              }}
              onDone={() => {
                useAgentPoolStore.getState().startReview(task)
                useWorkbenchStore.setState({ rightPanelTab: 'chat', rightPanelOpen: true })
                if (task.chatSessionId) {
                  const sessions = useChatSessionStore.getState()
                  if (sessions.activeSessionId !== task.chatSessionId) {
                    void sessions.switchSession(task.chatSessionId)
                  }
                }
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
