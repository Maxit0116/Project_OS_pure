import { useMemo } from 'react'
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
  const expandedTaskId = useAgentPoolStore((s) => s.expandedTaskId)
  const historyExpandedTaskId = useAgentPoolStore((s) => s.historyExpandedTaskId)
  const composeSubagents = useAgentPoolStore((s) => s.composeSubagents)

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
        overlay: agentPoolOverlayFromStore({
          removedTaskIds,
          reviewingTaskId,
          continuingTaskIds,
          historyByTaskId,
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
      removedTaskIds,
      reviewingTaskId,
      continuingTaskIds,
      historyByTaskId,
      heads,
      composeSubagents,
    ],
  )

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
      <div className={styles.list}>
        {tasks.map((task) => (
          <AgentPoolRow
            key={task.taskId}
            task={task}
            expanded={expandedTaskId === task.taskId}
            historyExpanded={historyExpandedTaskId === task.taskId}
            onToggleExpand={() => {
              const store = useAgentPoolStore.getState()
              store.setExpandedTaskId(
                store.expandedTaskId === task.taskId ? null : task.taskId,
              )
            }}
            onToggleHistory={() => {
              const store = useAgentPoolStore.getState()
              store.setHistoryExpandedTaskId(
                store.historyExpandedTaskId === task.taskId ? null : task.taskId,
              )
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
