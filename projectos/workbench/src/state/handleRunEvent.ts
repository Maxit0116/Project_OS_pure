import type {
  AgentFlowStep,
  AgentActionEvent,
  AgentDelegationEvent,
  AgentRunEvent,
  ApplyResult,
  CurrentWorkState,
  HarnessRecord,
  ProjectGraph,
  ProjectOSApi,
  ProjectOSProject,
  SemanticTree,
  VerificationRunResult,
} from '@contracts/index'
import type { Locale } from '../i18n/types'
import type { ToastType } from '../components/ui/Toast'
import { getStoreMessage } from '../i18n/storeMessages'
import { sanitizeErrorMessage } from '../../../utils/sanitize-error-message'
import { truncateDiffReadySummary } from '../notifications/diffReadyNotification'
import type { CenterTab, ChatMessage, CodeSubTab } from './workbenchStore'
import { logRunEventToActivity } from './activityLogFromRunEvent'
import { useChatSessionStore } from './chatSessionStore'

export interface FlowCorrection {
  id: string
  stepId: string
  message: string
  timestamp: string
}

export type FlowStatus = 'idle' | 'running' | 'complete' | 'awaiting_review' | 'error'

export interface RunEventStoreSlice {
  client: ProjectOSApi
  project: ProjectOSProject | null
  activeRunId?: string | null
  harnessFixRunId: string | null
  harnessRecord: HarnessRecord | null
  locale: Locale
  flashKey: number
  centerTab: CenterTab
  codeSubTab: CodeSubTab
  flowSteps: AgentFlowStep[]
  flowActions: AgentActionEvent[]
  flowDelegationEvents?: AgentDelegationEvent[]
  flowCorrections: FlowCorrection[]
  flowStatus: FlowStatus
  refinementConfirmed: boolean
  selectedNodeId: string | null
  highlightedFilePaths: string[]
  diffReady: boolean
  messages: ChatMessage[]
  conversationCheckpoints?: ConversationCheckpointDraft[]
  applyResult?: ApplyResult | null
  verificationResult?: VerificationRunResult | null
}

export interface RunEventWritable extends RunEventStoreSlice {
  graph: ProjectGraph | null
  tree: SemanticTree | null
  currentWork?: CurrentWorkState | null
}

export interface RunEventActions {
  loadDiff: (runId?: string) => Promise<void>
  maybeNotifyAgentComplete: (item: {
    kind: 'ask' | 'diff'
    runId?: string
    fileCount?: number
    summary: string
    completedAt: number
  }) => void
  pushToast: (opts: { type: ToastType; message: string; autoDismiss?: number }) => void
}

export type RunEventSet = (
  partial: Partial<RunEventWritable> | ((state: RunEventStoreSlice) => Partial<RunEventWritable>),
) => void

export function createFlowCorrection(stepId: string, message: string): FlowCorrection {
  return {
    id: `corr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    stepId,
    message,
    timestamp: new Date().toISOString(),
  }
}

function upsertFlowStep(flowSteps: AgentFlowStep[], step: AgentFlowStep): AgentFlowStep[] {
  const existing = flowSteps.findIndex((x) => x.id === step.id)
  const next = [...flowSteps]
  if (existing >= 0) next[existing] = { ...step }
  else next.push({ ...step })
  return next
}

export function reduceRunEventState(
  state: RunEventStoreSlice,
  event: AgentRunEvent,
): Partial<RunEventWritable> {
  const patch: Partial<RunEventWritable> = {}

  if (isAgentActionEvent(event)) {
    patch.flowActions = state.flowActions.some((action) => action.eventId === event.eventId)
      ? state.flowActions
      : [...state.flowActions, event]
  }

  if (isAgentDelegationEvent(event)) {
    const existing = state.flowDelegationEvents ?? []
    patch.flowDelegationEvents = existing.some((item) => item.eventId === event.eventId)
      ? existing
      : [...existing, event]
  }

  if (event.type === 'run_started') {
    patch.flowStatus = 'running'
  }

  if (event.type === 'prompt_refined') {
    patch.refinementConfirmed = true
  }

  if (event.type === 'step_started' && event.step) {
    patch.flowSteps = upsertFlowStep(state.flowSteps, { ...event.step, status: 'running' })
    const relatedFiles = event.step.relatedFiles ?? []
    if (relatedFiles.length > 0) {
      patch.highlightedFilePaths = relatedFiles
    }
    const relatedNodeIds = event.step.relatedNodeIds ?? []
    if (relatedNodeIds.length > 0) {
      patch.selectedNodeId = relatedNodeIds[0] ?? null
      patch.flashKey = state.flashKey + 1
    }
  }

  if (event.type === 'step_completed' && event.step) {
    patch.flowSteps = upsertFlowStep(state.flowSteps, { ...event.step, status: 'complete' })
  }

  if (event.type === 'step_failed') {
    if (event.step) {
      patch.flowSteps = upsertFlowStep(state.flowSteps, { ...event.step, status: 'error' })
    }
    patch.flowStatus = 'error'
  }

  if (event.type === 'correction_added') {
    const payload = event.payload ?? {}
    const stepId = typeof payload.stepId === 'string' ? payload.stepId : ''
    const message = typeof payload.message === 'string' ? payload.message : ''
    if (stepId && message) {
      const alreadyRecorded = state.flowCorrections.some(
        (correction) => correction.id === event.eventId,
      )
      patch.flowCorrections = alreadyRecorded
        ? state.flowCorrections
        : [
            ...state.flowCorrections,
            {
              id: event.eventId,
              stepId,
              message,
              timestamp: event.timestamp,
            },
          ]
      patch.flowSteps = state.flowSteps.map((step) =>
        step.id === stepId ? { ...step, status: 'warning' as const } : step,
      )
    }
  }

  if (event.type === 'diff_ready') {
    patch.diffReady = true
    patch.flowStatus = 'awaiting_review'
  }

  if (event.type === 'apply_result') {
    patch.applyResult = {
      runId: event.runId,
      applied: event.payload.outcome === 'applied',
      filesChanged: event.payload.filesWritten,
      verificationStatus: 'not_run',
      outcome: event.payload.outcome,
      ...(event.payload.backupId ? { backupId: event.payload.backupId } : {}),
    }
  }

  if (event.type === 'verification_completed') {
    const status = event.payload?.status
    if (status === 'passed' || status === 'failed' || status === 'not_run') {
      patch.verificationResult = { runId: event.runId, status, results: [] }
      if (state.applyResult) {
        patch.applyResult = { ...state.applyResult, verificationStatus: status }
      }
      if (
        !state.harnessFixRunId &&
        state.applyResult?.applied &&
        state.applyResult.runId === event.runId
      ) {
        const messageId = `automatic_apply_${event.runId}`
        patch.centerTab = 'code'
        patch.codeSubTab = 'diff'
        patch.messages = state.messages.some((message) => message.id === messageId)
          ? state.messages
          : [
              ...state.messages,
              {
                id: messageId,
                role: 'assistant',
                content: getStoreMessage(state.locale, 'chat.automaticApplySummary', {
                  count: state.applyResult.filesChanged.length,
                  status,
                }),
                format: 'markdown',
                timestamp: event.timestamp,
              },
            ]
      }
    }
  }

  return patch
}

export function isAgentActionEvent(event: AgentRunEvent): event is AgentActionEvent {
  return event.type === 'context_assembled' ||
    event.type === 'context_attached' ||
    event.type === 'file_read' ||
    event.type === 'model_request' ||
    event.type === 'mcp_tool_call' ||
    event.type === 'tool_policy_decision' ||
    event.type === 'edit_plan_created' ||
    event.type === 'proposal_validation_result' ||
    event.type === 'batch_validation_result' ||
    event.type === 'decision_summary' ||
    event.type === 'diff_proposed' ||
    event.type === 'apply_result' ||
    event.type === 'verification_result' ||
    event.type === 'initialization_tranche_progress' ||
    event.type === 'memory_index_bound'
}

export function isAgentDelegationEvent(event: AgentRunEvent): event is AgentDelegationEvent {
  return event.type === 'plan_created' ||
    event.type === 'task_delegated' ||
    event.type === 'child_run_started' ||
    event.type === 'child_run_completed' ||
    event.type === 'child_run_outcome' ||
    event.type === 'plan_completed' ||
    event.type === 'plan_partially_completed'
}

export function applyRunEventsToState(
  state: RunEventStoreSlice,
  events: AgentRunEvent[],
): Partial<RunEventWritable> {
  let next: RunEventStoreSlice = state
  let patch: Partial<RunEventWritable> = {}
  for (const event of events) {
    const eventPatch = reduceRunEventState(next, event)
    next = { ...next, ...eventPatch }
    patch = { ...patch, ...eventPatch }
  }
  return patch
}

export interface ConversationCheckpointDraft {
  id: string
  messageId: string
  backupId: string
  runId: string
  createdAt: string
  filesChanged: string[]
}

/**
 * Conversation checkpoint for a successful apply that carries a backup.
 * Skips when the same run+backup is already recorded (manual apply path).
 */
export function checkpointPatchForAppliedResult(
  state: {
    locale: Locale
    messages: ChatMessage[]
    conversationCheckpoints?: readonly ConversationCheckpointDraft[]
  },
  event: Extract<AgentActionEvent, { type: 'apply_result' }>,
  ids?: { checkpointId?: string; messageId?: string; createdAt?: string },
): { conversationCheckpoints: ConversationCheckpointDraft[]; messages: ChatMessage[] } | undefined {
  if (event.payload.outcome !== 'applied' || !event.payload.backupId) return undefined
  const existing = state.conversationCheckpoints ?? []
  if (existing.some((item) => item.runId === event.runId && item.backupId === event.payload.backupId)) {
    return undefined
  }
  const checkpointId = ids?.checkpointId ?? `ckpt_${event.eventId}`
  const messageId = ids?.messageId ?? `ckpt_msg_${event.eventId}`
  const checkpoint: ConversationCheckpointDraft = {
    id: checkpointId,
    messageId,
    backupId: event.payload.backupId,
    runId: event.runId,
    createdAt: ids?.createdAt ?? event.timestamp,
    filesChanged: event.payload.filesWritten,
  }
  const alreadyMessaged = state.messages.some((message) => message.id === messageId)
  return {
    conversationCheckpoints: [...existing, checkpoint],
    messages: alreadyMessaged
      ? state.messages
      : [
          ...state.messages,
          {
            id: messageId,
            role: 'system',
            content: getStoreMessage(state.locale, 'chat.checkpointCreated', {
              count: event.payload.filesWritten.length,
            }),
            timestamp: checkpoint.createdAt,
            checkpointId,
          },
        ],
  }
}

export function handleRunEvent(
  event: AgentRunEvent,
  set: RunEventSet,
  get: () => RunEventStoreSlice & RunEventActions,
) {
  logRunEventToActivity(event)
  set((s) => ({ ...s, ...reduceRunEventState(s, event) }))
  if (event.type === 'run_started') {
    useChatSessionStore.getState().openAgentFlowForRun(event.runId)
  }

  if (event.type === 'step_failed') {
    const payload = event.payload ?? {}
    const message =
      event.step?.outputSummary ??
      (typeof payload.message === 'string' ? payload.message : undefined) ??
      getStoreMessage(get().locale, 'agentFlow.stepFailed')
    const sanitizedMessage = sanitizeErrorMessage(message)
    const systemMessageId = `failure_${event.eventId}`
    set((state) => ({
      messages: state.messages.some((item) => item.id === systemMessageId)
        ? state.messages
        : [
            ...state.messages,
            {
              id: systemMessageId,
              role: 'system',
              content: getStoreMessage(state.locale, 'chat.runFailure', {
                message: sanitizedMessage,
              }),
              timestamp: event.timestamp,
            },
          ],
    }))
    get().pushToast({ type: 'error', message: sanitizedMessage })
  }

  if (event.type === 'diff_ready') {
    void get().loadDiff(event.runId)
  }

  if (event.type === 'apply_result' && event.payload.outcome === 'applied') {
    const checkpoint = checkpointPatchForAppliedResult(get(), event)
    if (checkpoint) {
      set(checkpoint)
      useChatSessionStore.getState().schedulePersist()
    }
    const { client, project, pushToast, locale } = get()
    pushToast({
      type: 'success',
      message: getStoreMessage(locale, 'toast.applySuccess', {
        count: event.payload.filesWritten.length,
      }),
    })
    if (project) {
      void client.getCurrentWork(project.projectId).then((currentWork) => {
        const current = get()
        if (
          current.project?.projectId !== project.projectId ||
          (current.activeRunId !== undefined && current.activeRunId !== event.runId)
        ) return
        set({ currentWork })
      }).catch((error) => {
        console.error('[workbench] failed to refresh current work after automatic apply', error)
      })
    }
  }

  if (event.type === 'verification_completed') {
    const { harnessFixRunId, pushToast, locale } = get()
    if (harnessFixRunId && event.payload?.status === 'passed') {
      pushToast({ type: 'success', message: getStoreMessage(locale, 'toast.verificationPassed') })
    }
    if (!harnessFixRunId && event.payload?.status === 'failed') {
      pushToast({
        type: 'error',
        message: getStoreMessage(locale, 'diff.verification_failed'),
      })
    }
    const after = get() as RunEventStoreSlice & RunEventActions & {
      generatedDiff?: unknown
      activeRunId?: string | null
      codeSubTab?: string
      centerTab?: string
    }
    if (
      !harnessFixRunId &&
      after.centerTab === 'code' &&
      after.codeSubTab === 'diff' &&
      !after.generatedDiff &&
      after.activeRunId
    ) {
      void get().loadDiff(after.activeRunId)
    }
  }

  if (event.type === 'run_completed') {
    const { client, project, harnessFixRunId, harnessRecord, pushToast, locale, maybeNotifyAgentComplete } = get()
    if (!project) return

    const automaticApplyCompleted = get().flowActions.some(
      (action) => action.type === 'apply_result' && action.payload.outcome === 'applied',
    )
    void (async () => {
      const [graph, tree] = await Promise.all([
        client.getProjectGraph(project.projectId),
        client.getSemanticTree(project.projectId),
      ])
      const current = get()
      if (
        current.project?.projectId !== project.projectId ||
        (current.activeRunId !== undefined && current.activeRunId !== event.runId)
      ) return
      if (harnessFixRunId) {
        pushToast({ type: 'success', message: getStoreMessage(locale, 'toast.harnessFixComplete') })
      } else {
        pushToast({ type: 'info', message: getStoreMessage(locale, 'toast.runComplete') })
      }
      set({
        graph,
        tree,
        flowStatus: harnessFixRunId || automaticApplyCompleted
          ? 'complete'
          : get().flowStatus === 'error'
            ? 'error'
            : get().diffReady
              ? 'awaiting_review'
              : 'complete',
        harnessRecord: harnessFixRunId && harnessRecord
          ? {
              ...harnessRecord,
              verification: {
                status: 'demo_passed',
                command: 'npm run dev — login flow smoke',
                outputSummary: 'Login redirects to dashboard without loop.',
              },
            }
          : harnessRecord,
      })

      if (!harnessFixRunId && !get().diffReady) {
        const lastUserMessage = [...get().messages].reverse().find((msg) => msg.role === 'user')
        maybeNotifyAgentComplete({
          kind: 'diff',
          runId: event.runId,
          fileCount: 0,
          summary: truncateDiffReadySummary(lastUserMessage?.content ?? ''),
          completedAt: Date.now(),
        })
      }
    })()
  }
}
