import type {
  AgentActionEvent,
  AgentDelegationEvent,
  AgentFlowStep,
  AgentRunEvent,
  PinComposerHubSubagentLink,
  TraceMajorAction,
  TraceSpanView,
  TraceTimingQuality,
} from '@contracts/index'
import {
  projectAgentPoolTrace,
  resolvePoolOriginMs,
  stableDefinitionId,
  summarizeTraceAction,
  type AgentPoolTraceBar,
  type AgentPoolTraceProjection,
} from './projectAgentPoolTrace'

export type AgentPoolTaskStatus =
  | 'running'
  | 'awaiting_user_done'
  | 'reviewing'
  | 'continuing'
  | 'complete'
  | 'error'

export type AgentPoolTaskSource = 'root' | 'delegation' | 'session' | 'compose'

/** Span kinds for the pool mini-waterfall (Kobra-style shared clock). */
export type AgentPoolSpanKind =
  | 'agent'
  | 'step'
  | 'model'
  | 'tool'
  | 'action'
  | 'major'
  | 'file'
  | 'apply'
  | 'verify'
  | 'wait'
  | 'other'

export type AgentPoolSpanStatus = 'running' | 'complete' | 'error'

/**
 * One bar on the row timeline. Running spans omit `endMs` and grow to panel `now`.
 * Times are milliseconds relative to the shared Pool `originMs` / `poolOriginMs`.
 */
export interface AgentPoolSpan {
  id: string
  parentId?: string
  kind: AgentPoolSpanKind
  label: string
  status: AgentPoolSpanStatus
  startMs: number
  endMs?: number
  timingQuality?: TraceTimingQuality
  level?: 1 | 2 | 3
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
  majorActions?: TraceMajorAction[]
  traceSpans?: TraceSpanView[]
  acceptance?: 'accepted' | 'rejected' | 'pending' | 'none'
}

export interface AgentPoolTask {
  taskId: string
  /** Stable AgentDefinition id (not mutable display config). */
  definitionId: string
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
  /** Compact / expanded bars (Major Actions by default). */
  spans: AgentPoolSpan[]
  majorActions: TraceMajorAction[]
  traceSpans: TraceSpanView[]
  trace: AgentPoolTraceProjection | null
  /** Shared PoolRun time origin (epoch ms). */
  originMs: number
  poolRunId: string | null
  loopSpecId: string | null
  acceptance: 'accepted' | 'rejected' | 'pending' | 'none'
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
  acceptanceByTaskId?: Readonly<Record<string, AgentPoolTask['acceptance']>>
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
  /** Independent PoolRun id from store; created outside projection. */
  poolRunId?: string | null
  /** Shared axis origin; when omitted, derived from earliest evidence. */
  poolOriginMs?: number
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
  return summarizeTraceAction(event)
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
  return 'running'
}

function toFlowSteps(steps: AgentFlowStep[]): AgentPoolFlowStep[] {
  return steps.map((step) => ({
    id: step.id,
    label: step.label,
    status: step.status,
  }))
}

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

function barToSpan(bar: AgentPoolTraceBar): AgentPoolSpan {
  return {
    id: bar.id,
    parentId: bar.parentId,
    kind: bar.kind === 'major' ? 'major' : (bar.kind as AgentPoolSpanKind),
    label: bar.label,
    status: bar.status,
    startMs: bar.startMs,
    endMs: bar.endMs,
    timingQuality: bar.timingQuality,
    level: bar.level,
  }
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
 * Project steps + action events onto the shared Pool clock.
 * Default bars are Major Actions (L1), not every low-level span.
 */
export function projectAgentPoolSpans(input: {
  title: string
  status: AgentPoolTaskStatus
  steps: AgentFlowStep[]
  actions: AgentActionEvent[]
  currentAction: string
  taskId?: string
  originMs?: number
  agentRunId?: string
  events?: AgentRunEvent[]
}): { spans: AgentPoolSpan[]; originMs: number; trace: AgentPoolTraceProjection } {
  const actionTimes = input.actions
    .map((event) => parseEventMs(event.timestamp))
    .filter((value): value is number => value != null)
  const originMs =
    input.originMs ??
    (actionTimes.length > 0
      ? Math.min(...actionTimes)
      : input.taskId
        ? stableSyntheticOrigin(input.taskId)
        : Date.now())
  const live = isLivePoolStatus(input.status)
  const agentRunId = input.agentRunId ?? input.taskId ?? 'run:unknown'
  const trace = projectAgentPoolTrace({
    agentRunId,
    steps: input.steps,
    actions: input.actions,
    events: input.events,
    poolOriginMs: originMs,
    live,
  })

  const compact = trace.compactBars.map(barToSpan)
  const agentBar: AgentPoolSpan = {
    id: 'span:agent',
    kind: 'agent',
    label: input.title,
    status: input.status === 'error' ? 'error' : live ? 'running' : 'complete',
    startMs: 0,
    endMs: live
      ? undefined
      : Math.max(
          POINT_FALLBACK,
          ...compact.map((span) => span.endMs ?? span.startMs),
        ),
    timingQuality: 'derived',
    level: 1,
  }

  const spans =
    compact.length > 0
      ? [agentBar, ...compact]
      : live
        ? [
            agentBar,
            {
              id: 'span:active',
              parentId: agentBar.id,
              kind: 'step' as const,
              label: input.currentAction || 'Working…',
              status: 'running' as const,
              startMs: 0,
              timingQuality: 'incomplete' as const,
              level: 1 as const,
            },
          ]
        : [agentBar]

  return { spans, originMs, trace }
}

const POINT_FALLBACK = 80

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
  const acceptance = overlay.acceptanceByTaskId?.[task.taskId] ?? task.acceptance
  return { ...task, history, status, acceptance }
}

function earliestAbs(actions: AgentActionEvent[], events?: AgentRunEvent[]): number | null {
  const times: number[] = []
  for (const event of actions) {
    const at = parseEventMs(event.timestamp)
    if (at != null) times.push(at)
  }
  for (const event of events ?? []) {
    const at = parseEventMs(event.timestamp)
    if (at != null) times.push(at)
  }
  return times.length > 0 ? Math.min(...times) : null
}

function buildRootTask(
  input: ProjectAgentPoolInput,
  poolOriginMs: number,
  poolRunId: string | null,
): AgentPoolTask | null {
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
  const { spans, originMs, trace } = projectAgentPoolSpans({
    title,
    status,
    steps,
    actions: flowActions,
    currentAction,
    taskId,
    originMs: poolOriginMs,
    agentRunId: activeRunId ?? taskId,
  })
  return {
    taskId,
    definitionId: stableDefinitionId({
      source: 'root',
      taskId,
      chatSessionId,
    }),
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
    majorActions: trace.majorActions,
    traceSpans: trace.spans,
    trace,
    originMs,
    poolRunId,
    loopSpecId: null,
    acceptance: status === 'awaiting_user_done' || status === 'complete' ? 'pending' : 'none',
  }
}

function buildDelegationTasks(
  input: ProjectAgentPoolInput,
  poolOriginMs: number,
  poolRunId: string | null,
): AgentPoolTask[] {
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
    const traceEvents = input.delegatedRunTraces[childRunId]
    const childEvents = traceEvents?.events ?? []
    const childActions = childEvents.filter(isActionEvent)
    const childSteps = collectRunSteps(childEvents)
    const acceptanceCriteria = extractAcceptanceCriteria(childActions)
    const status = mapDelegatedStatus(input.flowDelegationEvents, childRunId)
    const currentAction = latestActionLabel(childActions, childSteps, 'Delegated')
    const { spans, originMs, trace } = projectAgentPoolSpans({
      title,
      status,
      steps: childSteps,
      actions: childActions,
      currentAction,
      taskId,
      originMs: poolOriginMs,
      agentRunId: childRunId,
      events: childEvents,
    })
    rows.push({
      taskId,
      definitionId: stableDefinitionId({ source: 'delegation', taskId }),
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
      majorActions: trace.majorActions,
      traceSpans: trace.spans,
      trace,
      originMs,
      poolRunId,
      loopSpecId: null,
      acceptance: status === 'awaiting_user_done' || status === 'complete' ? 'pending' : 'none',
    })
  }
  return rows
}

function buildSessionTasks(
  sessions: WorkingSessionLike[] | undefined,
  activeSessionId: string | null,
  modelLabel: string,
  modelId: string | null,
  poolOriginMs: number,
  poolRunId: string | null,
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
      const { spans, originMs, trace } = projectAgentPoolSpans({
        title,
        status,
        steps: [],
        actions: [],
        currentAction,
        taskId,
        originMs: poolOriginMs,
        agentRunId: taskId,
      })
      return {
        taskId,
        definitionId: stableDefinitionId({ source: 'session', taskId }),
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
        majorActions: trace.majorActions,
        traceSpans: trace.spans,
        trace,
        originMs,
        poolRunId,
        loopSpecId: null,
        acceptance: status === 'awaiting_user_done' ? 'pending' : 'none',
      }
    })
}

function buildComposeTasks(
  composeSubagents: ComposeSubagentLike[] | undefined,
  modelLabel: string,
  modelId: string | null,
  chatSessionId: string | null,
  poolOriginMs: number,
  poolRunId: string | null,
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
      const { spans, originMs, trace } = projectAgentPoolSpans({
        title: slot.name,
        status: poolStatus,
        steps: [],
        actions: [],
        currentAction,
        taskId,
        originMs: poolOriginMs,
        agentRunId: slot.link?.runId ?? taskId,
      })
      return {
        taskId,
        definitionId: stableDefinitionId({ source: 'compose', taskId }),
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
        majorActions: trace.majorActions,
        traceSpans: trace.spans,
        trace,
        originMs,
        poolRunId,
        loopSpecId: null,
        acceptance: poolStatus === 'awaiting_user_done' ? 'pending' : 'none',
      }
    })
}

function collectOriginCandidates(input: ProjectAgentPoolInput): Array<number | null> {
  const candidates: Array<number | null> = [earliestAbs(input.flowActions)]
  for (const trace of Object.values(input.delegatedRunTraces)) {
    candidates.push(earliestAbs(trace.events.filter(isActionEvent), trace.events))
  }
  return candidates
}

/** Project live run / session / compose state into Agent Pool rows. */
export function projectAgentPool(input: ProjectAgentPoolInput): AgentPoolTask[] {
  const poolOriginMs =
    input.poolOriginMs ??
    resolvePoolOriginMs(collectOriginCandidates(input), Date.now())
  const poolRunId = input.poolRunId ?? null

  const delegationTasks = buildDelegationTasks(input, poolOriginMs, poolRunId)
  const root = buildRootTask(input, poolOriginMs, poolRunId)
  const live: AgentPoolTask[] = []
  if (root && delegationTasks.length === 0) {
    live.push(root)
  } else if (root && delegationTasks.length > 0) {
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
      poolOriginMs,
      poolRunId,
    ),
  )
  live.push(
    ...buildComposeTasks(
      input.composeSubagents,
      input.modelLabel,
      input.modelId,
      input.chatSessionId,
      poolOriginMs,
      poolRunId,
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

export function buildHistoryEntryFromTask(
  task: AgentPoolTask,
  now = new Date().toISOString(),
): AgentPoolHistoryEntry {
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
    majorActions: task.majorActions,
    traceSpans: task.traceSpans,
    acceptance: task.acceptance,
  }
}

/** Thin durable History card from disk index (spans filled when selected / local). */
export function historyEntryFromIndexEntry(entry: {
  runId: string
  title: string
  startedAt: string
  endedAt?: string
  acceptance?: AgentPoolHistoryEntry['acceptance']
  status?: string
}): AgentPoolHistoryEntry {
  const completedAt = entry.endedAt ?? entry.startedAt
  const originMs = Date.parse(entry.startedAt)
  return {
    id: `index:${entry.runId}`,
    runId: entry.runId,
    title: entry.title,
    currentAction: entry.title,
    completedAt,
    flowSteps: [],
    spans: [],
    originMs: Number.isFinite(originMs) ? originMs : Date.now(),
    majorActions: [],
    traceSpans: [],
    acceptance: entry.acceptance ?? 'none',
  }
}

/**
 * Merge local (rich) history with disk index entries. Prefer local cards that
 * already carry spans; append missing durable runs chronologically.
 */
export function mergeHistoryWithIndexEntries(
  local: AgentPoolHistoryEntry[],
  disk: AgentPoolHistoryEntry[],
  activeRunId: string | null,
): AgentPoolHistoryEntry[] {
  const byRunId = new Map<string, AgentPoolHistoryEntry>()
  for (const entry of disk) {
    if (!entry.runId || entry.runId === activeRunId) continue
    byRunId.set(entry.runId, entry)
  }
  for (const entry of local) {
    if (!entry.runId) {
      byRunId.set(entry.id, entry)
      continue
    }
    if (entry.runId === activeRunId) continue
    const existing = byRunId.get(entry.runId)
    if (!existing || entry.spans.length > 0 || (existing.spans.length === 0 && entry.flowSteps.length > 0)) {
      byRunId.set(entry.runId, entry)
    }
  }
  return [...byRunId.values()].sort(
    (a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt),
  )
}

export { createPoolRunId, barsForMajorAction } from './projectAgentPoolTrace'
