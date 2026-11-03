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

/** Span kinds for the pool mini-waterfall (Kobra-style shared clock). */
export type AgentPoolSpanKind = 'agent' | 'step' | 'model' | 'tool' | 'action'

export type AgentPoolSpanStatus = 'running' | 'complete' | 'error'

/**
 * One bar on the row timeline. Running spans omit `endMs` and grow to panel `now`.
 * Times are milliseconds relative to the task's `originMs`.
 */
export interface AgentPoolSpan {
  id: string
  parentId?: string
  kind: AgentPoolSpanKind
  label: string
  status: AgentPoolSpanStatus
  startMs: number
  endMs?: number
}

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
  spans: AgentPoolSpan[]
  originMs: number
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
  /** Live mini-waterfall spans for this task identity. */
  spans: AgentPoolSpan[]
  /** Epoch ms for span relative clock (shared with panel `now`). */
  originMs: number
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

const SYNTHETIC_STEP_MS = 1000
const POINT_ACTION_MS = 80
/** Minimum axis length so a brand-new run still shows a readable track. */
export const AGENT_POOL_MIN_RANGE_MS = 2_000

/** Sticky wall origins for tasks that have no event timestamps yet. */
const syntheticOriginByTaskId = new Map<string, number>()

function stableSyntheticOrigin(taskId: string): number {
  const existing = syntheticOriginByTaskId.get(taskId)
  if (existing != null) return existing
  const next = Date.now()
  syntheticOriginByTaskId.set(taskId, next)
  return next
}

/** Test helper — clear sticky synthetic origins between cases. */
export function resetAgentPoolSyntheticOrigins(): void {
  syntheticOriginByTaskId.clear()
}

function parseEventMs(timestamp: string): number | null {
  const value = Date.parse(timestamp)
  return Number.isFinite(value) ? value : null
}

function isLivePoolStatus(status: AgentPoolTaskStatus): boolean {
  return status === 'running' || status === 'continuing'
}

function mapStepToSpanStatus(status: string): AgentPoolSpanStatus {
  if (status === 'error') return 'error'
  if (status === 'complete' || status === 'skipped' || status === 'warning') return 'complete'
  return 'running'
}

function actionDurationMs(event: AgentActionEvent): number | null {
  if (event.type === 'model_request' || event.type === 'mcp_tool_call') {
    const duration = event.payload.durationMs
    return typeof duration === 'number' && Number.isFinite(duration) ? duration : null
  }
  return null
}

function actionSpanKind(event: AgentActionEvent): AgentPoolSpanKind {
  if (event.type === 'model_request') return 'model'
  if (event.type === 'mcp_tool_call') return 'tool'
  return 'action'
}

function actionSpanStatus(event: AgentActionEvent): AgentPoolSpanStatus {
  if (event.type === 'model_request') {
    return event.payload.status === 'failed' ? 'error' : 'complete'
  }
  if (event.type === 'mcp_tool_call') {
    return event.payload.status === 'failed' || event.payload.status === 'rejected'
      ? 'error'
      : 'complete'
  }
  if (event.type === 'file_read') {
    return event.payload.status === 'failed' ? 'error' : 'complete'
  }
  if (event.type === 'verification_result') {
    return event.payload.status === 'failed' ? 'error' : 'complete'
  }
  if (event.type === 'apply_result') {
    return event.payload.outcome === 'rejected' ||
      event.payload.outcome === 'recovery_required'
      ? 'error'
      : 'complete'
  }
  return 'complete'
}

function agentSpanStatus(taskStatus: AgentPoolTaskStatus): AgentPoolSpanStatus {
  if (taskStatus === 'error') return 'error'
  if (isLivePoolStatus(taskStatus)) return 'running'
  return 'complete'
}

function sealRunningSpans(spans: AgentPoolSpan[], endMs: number): AgentPoolSpan[] {
  return spans.map((span) =>
    span.endMs == null
      ? {
          ...span,
          endMs,
          status: span.status === 'running' ? 'complete' : span.status,
        }
      : span,
  )
}

/**
 * Project steps + action events onto a shared relative clock.
 * Running leaf/agent spans omit `endMs` so the UI can grow them to `now`.
 */
export function projectAgentPoolSpans(input: {
  title: string
  status: AgentPoolTaskStatus
  steps: AgentFlowStep[]
  actions: AgentActionEvent[]
  currentAction: string
  /** Task identity — stabilizes synthetic origins across re-projections. */
  taskId?: string
  /** Optional absolute origin; defaults to earliest action timestamp or sticky now. */
  originMs?: number
}): { spans: AgentPoolSpan[]; originMs: number } {
  const { title, status, steps, actions, currentAction } = input
  const actionTimes = actions
    .map((event) => parseEventMs(event.timestamp))
    .filter((value): value is number => value != null)
  const originMs =
    input.originMs ??
    (actionTimes.length > 0
      ? Math.min(...actionTimes)
      : input.taskId
        ? stableSyntheticOrigin(input.taskId)
        : Date.now())
  const live = isLivePoolStatus(status)
  const agentId = 'span:agent'
  const childSpans: AgentPoolSpan[] = []

  if (actions.length > 0) {
    for (const event of actions) {
      const at = parseEventMs(event.timestamp)
      if (at == null) continue
      const atRel = Math.max(0, at - originMs)
      const duration = actionDurationMs(event) ?? POINT_ACTION_MS
      // Keep a visible bar when the first event lands exactly on the origin.
      const endMs = Math.max(atRel, duration)
      const startMs = Math.max(0, endMs - duration)
      childSpans.push({
        id: `span:action:${event.eventId}`,
        parentId: agentId,
        kind: actionSpanKind(event),
        label: summarizeActionEvent(event),
        status: actionSpanStatus(event),
        startMs,
        endMs,
      })
    }
    if (live) {
      const lastEnd = childSpans.reduce(
        (max, span) => Math.max(max, span.endMs ?? span.startMs),
        0,
      )
      childSpans.push({
        id: 'span:active',
        parentId: agentId,
        kind: 'step',
        label: currentAction || 'Working…',
        status: 'running',
        startMs: lastEnd,
      })
    }
  } else if (steps.length > 0) {
    let cursor = 0
    for (const step of steps) {
      const spanStatus = mapStepToSpanStatus(step.status)
      const done = spanStatus !== 'running'
      childSpans.push({
        id: `span:step:${step.id}`,
        parentId: agentId,
        kind: 'step',
        label: step.label,
        status: spanStatus,
        startMs: cursor,
        endMs: done ? cursor + SYNTHETIC_STEP_MS : undefined,
      })
      if (done) cursor += SYNTHETIC_STEP_MS
    }
  } else if (live) {
    childSpans.push({
      id: 'span:active',
      parentId: agentId,
      kind: 'step',
      label: currentAction || 'Working…',
      status: 'running',
      startMs: 0,
    })
  }

  const covered = childSpans.reduce(
    (max, span) => Math.max(max, span.endMs ?? span.startMs),
    0,
  )
  const spans: AgentPoolSpan[] = [
    {
      id: agentId,
      kind: 'agent',
      label: title,
      status: agentSpanStatus(status),
      startMs: 0,
      endMs: live ? undefined : Math.max(covered, POINT_ACTION_MS),
    },
    ...childSpans,
  ]
  return { spans, originMs }
}

/** Axis length for layout: at least min range, and at least the furthest tip / now. */
export function agentPoolAxisRangeMs(
  spans: AgentPoolSpan[],
  relativeNowMs: number,
  minRangeMs = AGENT_POOL_MIN_RANGE_MS,
): number {
  let max = relativeNowMs
  for (const span of spans) {
    max = Math.max(max, span.startMs, span.endMs ?? relativeNowMs)
  }
  return Math.max(minRangeMs, max)
}

export function taskNeedsLiveClock(task: Pick<AgentPoolTask, 'status' | 'spans'>): boolean {
  if (isLivePoolStatus(task.status)) return true
  return task.spans.some((span) => span.endMs == null)
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
  const status = mapFlowStatus(flowStatus)
  const currentAction = latestActionLabel(
    flowActions,
    steps,
    flowStatus === 'running' ? 'Working…' : 'Idle',
  )
  const { spans, originMs } = projectAgentPoolSpans({
    title,
    status,
    steps,
    actions: flowActions,
    currentAction,
    taskId,
  })
  return {
    taskId,
    title,
    modelLabel,
    modelId,
    status,
    currentAction,
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
    spans,
    originMs,
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
    const status = mapDelegatedStatus(input.flowDelegationEvents, childRunId)
    const currentAction = latestActionLabel(childActions, childSteps, 'Delegated')
    const { spans, originMs } = projectAgentPoolSpans({
      title,
      status,
      steps: childSteps,
      actions: childActions,
      currentAction,
      taskId,
    })
    rows.push({
      taskId,
      title,
      modelLabel: input.modelLabel,
      modelId: input.modelId,
      status,
      currentAction,
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
      spans,
      originMs,
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
    .map((session) => {
      const status: AgentPoolTaskStatus =
        session.status === 'awaiting_review' ? 'awaiting_user_done' : 'running'
      const title = session.title || 'Untitled session'
      const currentAction =
        session.status === 'awaiting_review' ? 'Needs review' : 'Working in another session'
      const taskId = `session:${session.id}`
      const { spans, originMs } = projectAgentPoolSpans({
        title,
        status,
        steps: [],
        actions: [],
        currentAction,
        taskId,
      })
      return {
        taskId,
        title,
        modelLabel,
        modelId,
        status,
        currentAction,
        runId: null,
        chatSessionId: session.id,
        source: 'session' as const,
        history: [],
        requirementSummary: session.title || 'Session task',
        acceptanceCriteria: ['Confirm this session task meets the requirement'],
        flowSteps: [],
        spans,
        originMs,
        loopSpecId: null,
      }
    })
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
      const currentAction =
        slot.link?.summary?.trim() ||
        (status === 'queued'
          ? 'Queued'
          : status === 'running'
            ? 'Working…'
            : status === 'done'
              ? 'Done — ready for review'
              : status === 'error'
                ? 'Failed'
                : 'Ready')
      const taskId = `compose:${slot.slotId}`
      const { spans, originMs } = projectAgentPoolSpans({
        title: slot.name,
        status: poolStatus,
        steps: [],
        actions: [],
        currentAction,
        taskId,
      })
      return {
        taskId,
        title: slot.name,
        modelLabel,
        modelId,
        status: poolStatus,
        currentAction,
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
        spans,
        originMs,
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
  const completedAtMs = Date.parse(now)
  const relativeEnd = Number.isFinite(completedAtMs)
    ? Math.max(0, completedAtMs - task.originMs)
    : agentPoolAxisRangeMs(task.spans, 0)
  return {
    id: `${task.taskId}:${now}`,
    runId: task.runId,
    title: task.title,
    currentAction: task.currentAction,
    completedAt: now,
    flowSteps: task.flowSteps,
    spans: sealRunningSpans(task.spans, relativeEnd),
    originMs: task.originMs,
  }
}
