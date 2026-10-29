import type {
  AgentActionEvent,
  AgentDelegationEvent,
  AgentFlowStep,
  AgentRunEvent,
  PinComposerHubSubagentLink,
} from '@contracts/index'

export type AgentPoolTaskStatus =
  | 'running'
  | 'awaiting_user_done'
  | 'reviewing'
  | 'continuing'
  | 'complete'
  | 'error'

export type AgentPoolTaskSource = 'root' | 'delegation' | 'session' | 'compose'

export interface AgentPoolFlowStep {
  id: string
  label: string
  status: string
}

export interface AgentPoolHistoryEntry {
  id: string
  runId: string | null
  title: string
  currentAction: string
  completedAt: string
  flowSteps: AgentPoolFlowStep[]
}

export interface AgentPoolTask {
  taskId: string
  title: string
  modelLabel: string
  modelId: string | null
  status: AgentPoolTaskStatus
  currentAction: string
  runId: string | null
  chatSessionId: string | null
  source: AgentPoolTaskSource
  history: AgentPoolHistoryEntry[]
  requirementSummary: string
  acceptanceCriteria: string[]
  flowSteps: AgentPoolFlowStep[]
  loopSpecId: string | null
}

export interface DelegatedRunTraceLike {
  taskId: string
  filePath: string
  nodeId?: string
  events: AgentRunEvent[]
}

export interface WorkingSessionLike {
  id: string
  title: string
  status: string
}

export interface ComposeSubagentLike {
  slotId: string
  name: string
  brief?: string
  link?: PinComposerHubSubagentLink
}

export interface AgentPoolOverlayState {
  removedTaskIds: ReadonlySet<string>
  reviewingTaskIds: ReadonlySet<string>
  continuingTaskIds: ReadonlySet<string>
  historyByTaskId: Readonly<Record<string, AgentPoolHistoryEntry[]>>
}

export interface ProjectAgentPoolInput {
  activeRunId: string | null
  flowStatus: string
  steps: AgentFlowStep[]
  flowActions: AgentActionEvent[]
  flowDelegationEvents: AgentDelegationEvent[]
  delegatedRunTraces: Record<string, DelegatedRunTraceLike>
  modelLabel: string
  modelId: string | null
  chatSessionId: string | null
  overlay: AgentPoolOverlayState
  workingSessions?: WorkingSessionLike[]
  composeSubagents?: ComposeSubagentLike[]
}

function isActionEvent(event: AgentRunEvent): event is AgentActionEvent {
  return (
    event.type === 'context_assembled' ||
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
    event.type === 'memory_index_bound' ||
    event.type === 'initialization_tranche_progress'
  )
}

function collectRunSteps(events: AgentRunEvent[]): AgentFlowStep[] {
  const steps: AgentFlowStep[] = []
  for (const event of events) {
    if (
      (event.type === 'step_started' ||
        event.type === 'step_completed' ||
        event.type === 'step_failed') &&
      event.step
    ) {
      const status =
        event.type === 'step_failed'
          ? 'error'
          : event.type === 'step_completed'
            ? 'complete'
            : 'running'
      const next = { ...event.step, status } as AgentFlowStep
      const index = steps.findIndex((step) => step.id === next.id)
      if (index >= 0) steps[index] = next
      else steps.push(next)
    }
  }
  return steps
}

export function summarizeActionEvent(event: AgentActionEvent): string {
  switch (event.type) {
    case 'file_read':
      return `Reading ${event.payload.path}`
    case 'model_request':
      return `Model · ${event.payload.model}`
    case 'diff_proposed':
      return event.payload.files[0]
        ? `Proposed ${event.payload.files[0].operation} · ${event.payload.files[0].path}`
        : 'Proposed diff'
    case 'edit_plan_created':
      return event.payload.objective
    case 'mcp_tool_call':
      return `${event.payload.toolName} · ${event.payload.status}`
    case 'verification_result':
      return event.payload.command
        ? `Verify · ${event.payload.command}`
        : `Verify · ${event.payload.status}`
    case 'decision_summary':
      return event.payload.summary
    case 'apply_result':
      return `Apply · ${event.payload.outcome}`
    case 'context_assembled':
      return `Context · ${event.payload.files.length} files`
    case 'context_attached':
      return `Attached · ${event.payload.autoFiles.length} files`
    default:
      return event.type.replace(/_/g, ' ')
  }
}

export function extractAcceptanceCriteria(actions: AgentActionEvent[]): string[] {
  for (let i = actions.length - 1; i >= 0; i -= 1) {
    const event = actions[i]
    if (
      event?.type === 'edit_plan_created' &&
      (event.payload.acceptanceCriteria?.length ?? 0) > 0
    ) {
      return [...event.payload.acceptanceCriteria!]
    }
  }
  return []
}

export function extractRequirementSummary(
  actions: AgentActionEvent[],
  fallbackTitle: string,
): string {
  for (let i = actions.length - 1; i >= 0; i -= 1) {
    const event = actions[i]
    if (event?.type === 'edit_plan_created' && event.payload.objective.trim()) {
      return event.payload.objective.trim()
    }
    if (event?.type === 'decision_summary' && event.payload.summary.trim()) {
      return event.payload.summary.trim()
    }
  }
  return fallbackTitle
}

function latestActionLabel(
  actions: AgentActionEvent[],
  steps: AgentFlowStep[],
  fallback: string,
): string {
  if (actions.length > 0) {
    return summarizeActionEvent(actions[actions.length - 1]!)
  }
  const activeStep = [...steps].reverse().find((step) => step.status === 'running')
  if (activeStep) return activeStep.label
  const lastStep = steps[steps.length - 1]
  if (lastStep) return lastStep.label
  return fallback
}

function mapFlowStatus(status: string): AgentPoolTaskStatus {
  switch (status) {
    case 'running':
      return 'running'
    case 'awaiting_review':
      return 'awaiting_user_done'
    case 'complete':
      return 'complete'
    case 'error':
      return 'error'
    default:
      return 'running'
  }
}

function mapDelegatedStatus(
  events: AgentDelegationEvent[],
  childRunId: string,
): AgentPoolTaskStatus {
  const completed = events.find(
    (event) =>
      event.type === 'child_run_completed' && event.payload.childRunId === childRunId,
  )
  if (completed && completed.type === 'child_run_completed') {
    if (completed.payload.status === 'error') return 'error'
    if (completed.payload.status === 'awaiting_review') return 'awaiting_user_done'
    return 'complete'
  }
  const started = events.some(
    (event) =>
      event.type === 'child_run_started' && event.payload.childRunId === childRunId,
  )
  return started ? 'running' : 'running'
}

function toFlowSteps(steps: AgentFlowStep[]): AgentPoolFlowStep[] {
  return steps.map((step) => ({
    id: step.id,
    label: step.label,
    status: step.status,
  }))
}

function applyOverlay(
  task: AgentPoolTask,
  overlay: AgentPoolOverlayState,
): AgentPoolTask | null {
  if (overlay.removedTaskIds.has(task.taskId)) return null
  const history = overlay.historyByTaskId[task.taskId] ?? task.history
  let status = task.status
  if (overlay.reviewingTaskIds.has(task.taskId)) status = 'reviewing'
  else if (overlay.continuingTaskIds.has(task.taskId)) status = 'continuing'
  return { ...task, history, status }
}

function buildRootTask(input: ProjectAgentPoolInput): AgentPoolTask | null {
  const {
    activeRunId,
    flowStatus,
    steps,
    flowActions,
    modelLabel,
    modelId,
    chatSessionId,
  } = input
  if (!activeRunId && flowStatus === 'idle' && steps.length === 0 && flowActions.length === 0) {
    return null
  }
  const taskId = activeRunId ? `root:${activeRunId}` : 'root:active'
  const title = steps[0]?.label ?? 'Agent run'
  const acceptanceCriteria = extractAcceptanceCriteria(flowActions)
  return {
    taskId,
    title,
    modelLabel,
    modelId,
    status: mapFlowStatus(flowStatus),
    currentAction: latestActionLabel(flowActions, steps, flowStatus === 'running' ? 'Working…' : 'Idle'),
    runId: activeRunId,
    chatSessionId,
    source: 'root',
    history: [],
    requirementSummary: extractRequirementSummary(flowActions, title),
    acceptanceCriteria:
      acceptanceCriteria.length > 0
        ? acceptanceCriteria
        : [`Confirm ${title} meets the requirement`],
    flowSteps: toFlowSteps(steps),
    loopSpecId: null,
  }
}

function buildDelegationTasks(input: ProjectAgentPoolInput): AgentPoolTask[] {
  const delegated = input.flowDelegationEvents.filter(
    (event): event is Extract<AgentDelegationEvent, { type: 'task_delegated' }> =>
      event.type === 'task_delegated',
  )
  const seen = new Set<string>()
  const rows: AgentPoolTask[] = []
  for (const event of delegated) {
    const { taskId, childRunId } = event.payload
    if (seen.has(taskId)) continue
    seen.add(taskId)
    const title =
      'filePath' in event.payload && event.payload.filePath
        ? event.payload.filePath
        : event.payload.nodeId
    const trace = input.delegatedRunTraces[childRunId]
    const childEvents = trace?.events ?? []
    const childActions = childEvents.filter(isActionEvent)
    const childSteps = collectRunSteps(childEvents)
    const acceptanceCriteria = extractAcceptanceCriteria(childActions)
    rows.push({
      taskId,
      title,
      modelLabel: input.modelLabel,
      modelId: input.modelId,
      status: mapDelegatedStatus(input.flowDelegationEvents, childRunId),
      currentAction: latestActionLabel(childActions, childSteps, 'Delegated'),
      runId: childRunId,
      chatSessionId: input.chatSessionId,
      source: 'delegation',
      history: [],
      requirementSummary: extractRequirementSummary(childActions, title),
      acceptanceCriteria:
        acceptanceCriteria.length > 0
          ? acceptanceCriteria
          : [`Confirm ${title} meets the requirement`],
      flowSteps: toFlowSteps(childSteps),
      loopSpecId: null,
    })
  }
  return rows
}

function buildSessionTasks(
  sessions: WorkingSessionLike[] | undefined,
  activeSessionId: string | null,
  modelLabel: string,
  modelId: string | null,
): AgentPoolTask[] {
  if (!sessions?.length) return []
  return sessions
    .filter((session) => session.id !== activeSessionId)
    .filter((session) => session.status === 'running' || session.status === 'awaiting_review')
    .map((session) => ({
      taskId: `session:${session.id}`,
      title: session.title || 'Untitled session',
      modelLabel,
      modelId,
      status:
        session.status === 'awaiting_review'
          ? ('awaiting_user_done' as const)
          : ('running' as const),
      currentAction:
        session.status === 'awaiting_review' ? 'Needs review' : 'Working in another session',
      runId: null,
      chatSessionId: session.id,
      source: 'session' as const,
      history: [],
      requirementSummary: session.title || 'Session task',
      acceptanceCriteria: ['Confirm this session task meets the requirement'],
      flowSteps: [],
      loopSpecId: null,
    }))
}

function buildComposeTasks(
  composeSubagents: ComposeSubagentLike[] | undefined,
  modelLabel: string,
  modelId: string | null,
  chatSessionId: string | null,
): AgentPoolTask[] {
  if (!composeSubagents?.length) return []
  return composeSubagents
    .filter((slot) => {
      const status = slot.link?.status
      return status === 'queued' || status === 'running' || status === 'done' || status === 'error'
    })
    .map((slot) => {
      const status = slot.link?.status ?? 'ready'
      const poolStatus: AgentPoolTaskStatus =
        status === 'error'
          ? 'error'
          : status === 'done'
            ? 'awaiting_user_done'
            : 'running'
      return {
        taskId: `compose:${slot.slotId}`,
        title: slot.name,
        modelLabel,
        modelId,
        status: poolStatus,
        currentAction:
          slot.link?.summary?.trim() ||
          (status === 'queued'
            ? 'Queued'
            : status === 'running'
              ? 'Working…'
              : status === 'done'
                ? 'Done — ready for review'
                : status === 'error'
                  ? 'Failed'
                  : 'Ready'),
        runId: slot.link?.runId ?? null,
        chatSessionId,
        source: 'compose' as const,
        history: [],
        requirementSummary: slot.brief?.trim() || slot.name,
        acceptanceCriteria: [
          slot.brief?.trim()
            ? `Confirm: ${slot.brief.trim()}`
            : `Confirm ${slot.name} meets the requirement`,
        ],
        flowSteps: [],
        loopSpecId: null,
      }
    })
}

/** Project live run / session / compose state into Agent Pool rows. */
export function projectAgentPool(input: ProjectAgentPoolInput): AgentPoolTask[] {
  const delegationTasks = buildDelegationTasks(input)
  const root = buildRootTask(input)
  const live: AgentPoolTask[] = []
  if (root && delegationTasks.length === 0) {
    live.push(root)
  } else if (root && delegationTasks.length > 0) {
    // Keep root as the plan umbrella only when it still has useful progress signal.
    live.push(root, ...delegationTasks)
  } else {
    live.push(...delegationTasks)
  }

  live.push(
    ...buildSessionTasks(
      input.workingSessions,
      input.chatSessionId,
      input.modelLabel,
      input.modelId,
    ),
  )
  live.push(
    ...buildComposeTasks(
      input.composeSubagents,
      input.modelLabel,
      input.modelId,
      input.chatSessionId,
    ),
  )

  const merged: AgentPoolTask[] = []
  const seen = new Set<string>()
  for (const task of live) {
    if (seen.has(task.taskId)) continue
    seen.add(task.taskId)
    const next = applyOverlay(task, input.overlay)
    if (next) merged.push(next)
  }
  return merged
}

export function buildHistoryEntryFromTask(task: AgentPoolTask, now = new Date().toISOString()): AgentPoolHistoryEntry {
  return {
    id: `${task.taskId}:${now}`,
    runId: task.runId,
    title: task.title,
    currentAction: task.currentAction,
    completedAt: now,
    flowSteps: task.flowSteps,
  }
}
