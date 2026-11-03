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
  const poolOriginMs = tasks[0]?.originMs ?? Date.now()

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
    // Re-hydrate when lane identity / definition / active run changes — not on every span tick.
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

  return (
    <div className={styles.panel} aria-label={ts('agentFlow.pool.title')}>
      <p className={styles.hint}>{ts('agentFlow.pool.hint')}</p>
      <div className={styles.summary} aria-label={ts('agentFlow.pool.summaryAria')}>
        <span>{ts('agentFlow.pool.summaryTotal', { count: summary.total })}</span>
        <span>{ts('agentFlow.pool.summaryRunning', { count: summary.running })}</span>
        <span>{ts('agentFlow.pool.summaryAwaiting', { count: summary.awaiting })}</span>
        {summary.errors > 0 ? (
          <span data-tone="error">
            {ts('agentFlow.pool.summaryErrors', { count: summary.errors })}
          </span>
        ) : null}
        {activePoolRunId ? (
          <span className={styles.poolRun} title={activePoolRunId}>
            {ts('agentFlow.pool.poolRunLabel')}
          </span>
        ) : null}
      </div>
      <div className={styles.list}>
        {tasks.map((task) => (
          <AgentPoolRow
            key={task.taskId}
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
        ))}
      </div>
    </div>
  )
}
