import type {
  AgentActionEvent,
  AgentDelegationEvent,
  AgentFlowStep,
  AgentFlowStepKind,
  AgentPoolRunKpi,
  AgentRunEvent,
  TraceMajorAction,
  TraceMajorActionStatus,
  TraceSpanKind,
  TraceSpanStatus,
  TraceSpanView,
  TraceSubAction,
  TraceTimingQuality,
} from '@contracts/index'

/** Major Action allowlist — user-facing stages only (DevPlan §8.1). */
const MAJOR_ACTION_KINDS = new Set<AgentFlowStepKind>([
  'context_prepared',
  'retrieve_context',
  'inspect_files',
  'understand',
  'locate_plan',
  'plan',
  'plan_delegation',
  'generate_proposal',
  'generate_diff',
  'validate_proposal',
  'validate_batch',
  'apply_change',
  'apply',
  'verify_change',
  'verify',
  'verify_group',
  'delegate_tasks',
  'commit_group',
  'debug',
])

const POINT_MS = 80

export interface ProjectAgentPoolTraceInput {
  agentRunId: string
  events?: AgentRunEvent[]
  steps?: AgentFlowStep[]
  actions?: AgentActionEvent[]
  /** Absolute epoch ms shared across the PoolRun. */
  poolOriginMs: number
  /** Wall clock for sealing open intervals when run is live. */
  nowMs?: number
  live?: boolean
}

export interface AgentPoolTraceProjection {
  majorActions: TraceMajorAction[]
  spans: TraceSpanView[]
  /** Flat bars for compact track: major actions only. */
  compactBars: AgentPoolTraceBar[]
  /** Evidence-honest run KPI for expand strip. */
  kpi: AgentPoolRunKpi
}

/** UI bar used by MiniWaterfall (Major Action or Span). */
export interface AgentPoolTraceBar {
  id: string
  parentId?: string
  kind: 'major' | TraceSpanKind | 'agent' | 'step' | 'action'
  label: string
  status: 'running' | 'complete' | 'error'
  startMs: number
  endMs?: number
  timingQuality: TraceTimingQuality
  level: 1 | 2 | 3
  /** Retry attempt when > 1 (Major Actions / failed siblings). */
  attempt?: number
}

function parseEventMs(timestamp: string): number | null {
  const value = Date.parse(timestamp)
  return Number.isFinite(value) ? value : null
}

function rel(abs: number, poolOriginMs: number): number {
  return Math.max(0, abs - poolOriginMs)
}

function mapStepStatus(status: string): TraceMajorActionStatus {
  if (status === 'error') return 'failed'
  if (status === 'running') return 'running'
  if (status === 'pending') return 'pending'
  if (status === 'skipped') return 'skipped'
  if (status === 'warning' || status === 'complete') return 'complete'
  return 'running'
}

function toBarStatus(
  status: TraceMajorActionStatus | TraceSpanStatus,
): 'running' | 'complete' | 'error' {
  if (status === 'failed' || status === 'error') return 'error'
  if (status === 'running' || status === 'pending') return 'running'
  return 'complete'
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

export function summarizeTraceAction(event: AgentActionEvent): string {
  switch (event.type) {
    case 'file_read':
      return `Read ${event.payload.path}`
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

function actionSpanKind(event: AgentActionEvent): TraceSpanKind {
  if (event.type === 'model_request') return 'model'
  if (event.type === 'mcp_tool_call') return 'tool'
  if (event.type === 'file_read') return 'file'
  if (event.type === 'apply_result') return 'apply'
  if (event.type === 'verification_result') return 'verify'
  return 'other'
}

function actionSpanStatus(event: AgentActionEvent): TraceSpanStatus {
  if (event.type === 'model_request') {
    return event.payload.status === 'failed' ? 'error' : 'ok'
  }
  if (event.type === 'mcp_tool_call') {
    return event.payload.status === 'failed' || event.payload.status === 'rejected'
      ? 'error'
      : 'ok'
  }
  if (event.type === 'file_read') {
    return event.payload.status === 'failed' ? 'error' : 'ok'
  }
  if (event.type === 'verification_result') {
    return event.payload.status === 'failed' ? 'error' : 'ok'
  }
  if (event.type === 'apply_result') {
    return event.payload.outcome === 'rejected' ||
      event.payload.outcome === 'recovery_required'
      ? 'error'
      : 'ok'
  }
  return 'ok'
}

function actionDurationMs(event: AgentActionEvent): number | null {
  if (event.type === 'model_request' || event.type === 'mcp_tool_call') {
    const duration = event.payload.durationMs
    return typeof duration === 'number' && Number.isFinite(duration) ? duration : null
  }
  if (event.type === 'verification_result') {
    const duration = event.payload.durationMs
    return typeof duration === 'number' && Number.isFinite(duration) ? duration : null
  }
  return null
}

function redactedAttributes(event: AgentActionEvent): Record<string, unknown> {
  switch (event.type) {
    case 'model_request':
      return {
        stage: event.payload.stage,
        provider: event.payload.provider,
        model: event.payload.model,
        status: event.payload.status,
        usage: event.payload.usage,
        tokenUsage:
          event.payload.usage === 'reported' ? event.payload.tokenUsage : undefined,
        durationMs: event.payload.durationMs,
      }
    case 'file_read':
      return {
        path: event.payload.path,
        byteLength: event.payload.byteLength,
        status: event.payload.status,
        startLine: event.payload.startLine,
        endLine: event.payload.endLine,
      }
    case 'mcp_tool_call':
      return {
        serverId: event.payload.serverId,
        toolName: event.payload.toolName,
        status: event.payload.status,
        durationMs: event.payload.durationMs,
        error: event.payload.error,
      }
    case 'diff_proposed':
      return { files: event.payload.files }
    case 'apply_result':
      return {
        outcome: event.payload.outcome,
        filesWritten: event.payload.filesWritten,
      }
    case 'verification_result':
      return {
        command: event.payload.command,
        status: event.payload.status,
        reason: event.payload.reason,
        summary: event.payload.summary,
        exitCode: event.payload.exitCode,
        durationMs: event.payload.durationMs,
      }
    case 'edit_plan_created':
      return {
        objective: event.payload.objective,
        acceptanceCriteria: event.payload.acceptanceCriteria,
      }
    default:
      return { type: event.type }
  }
}

function collectStepsFromEvents(events: AgentRunEvent[]): AgentFlowStep[] {
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
            ? event.step.status === 'warning'
              ? 'warning'
              : 'complete'
            : 'running'
      const next = { ...event.step, status } as AgentFlowStep
      const index = steps.findIndex((step) => step.id === next.id)
      if (index >= 0) steps[index] = next
      else steps.push(next)
    }
  }
  return steps
}

function stepTiming(
  stepId: string,
  events: AgentRunEvent[],
  poolOriginMs: number,
  live: boolean,
  nowMs: number,
): { startMs: number; endMs?: number; timingQuality: TraceTimingQuality } {
  let startAbs: number | null = null
  let endAbs: number | null = null
  for (const event of events) {
    if (
      (event.type === 'step_started' ||
        event.type === 'step_completed' ||
        event.type === 'step_failed') &&
      event.step?.id === stepId
    ) {
      const at = parseEventMs(event.timestamp)
      if (at == null) continue
      if (event.type === 'step_started') {
        startAbs = startAbs == null ? at : Math.min(startAbs, at)
      } else {
        endAbs = endAbs == null ? at : Math.max(endAbs, at)
        if (startAbs == null) startAbs = at
      }
    }
  }
  if (startAbs == null && endAbs == null) {
    return { startMs: 0, timingQuality: 'incomplete' }
  }
  if (startAbs == null && endAbs != null) {
    return {
      startMs: rel(endAbs, poolOriginMs),
      endMs: rel(endAbs, poolOriginMs),
      timingQuality: 'incomplete',
    }
  }
  const startMs = rel(startAbs!, poolOriginMs)
  if (endAbs != null) {
    return {
      startMs,
      endMs: Math.max(startMs, rel(endAbs, poolOriginMs)),
      timingQuality: 'exact',
    }
  }
  if (live) {
    return {
      startMs,
      endMs: undefined,
      timingQuality: 'exact',
    }
  }
  return {
    startMs,
    endMs: Math.max(startMs, rel(nowMs, poolOriginMs)),
    timingQuality: 'derived',
  }
}

function projectSpansFromActions(
  agentRunId: string,
  actions: AgentActionEvent[],
  poolOriginMs: number,
  actionIdForEvent: (event: AgentActionEvent) => string | undefined,
): TraceSpanView[] {
  const spans: TraceSpanView[] = []
  for (const event of actions) {
    if (event.type === 'tool_policy_decision' || event.type === 'memory_index_bound') {
      continue
    }
    const at = parseEventMs(event.timestamp)
    if (at == null) continue
    const atRel = rel(at, poolOriginMs)
    const duration = actionDurationMs(event)
    let startMs: number
    let endMs: number | undefined
    let timingQuality: TraceTimingQuality
    if (duration != null) {
      endMs = Math.max(atRel, duration)
      startMs = Math.max(0, endMs - duration)
      timingQuality = 'exact'
    } else {
      startMs = atRel
      endMs = atRel + POINT_MS
      timingQuality = 'derived'
    }
    const attrs = redactedAttributes(event)
    spans.push({
      spanId: `span:${event.eventId}`,
      agentRunId,
      actionId: actionIdForEvent(event),
      name: summarizeTraceAction(event),
      kind: actionSpanKind(event),
      status: actionSpanStatus(event),
      startMs,
      endMs,
      timingQuality,
      attributes: attrs,
      evidenceEventIds: [event.eventId],
    })
  }
  return spans
}

function fallbackBucket(event: AgentActionEvent): {
  id: string
  name: string
  kind: 'custom'
} {
  if (
    event.type === 'context_assembled' ||
    event.type === 'context_attached' ||
    event.type === 'file_read'
  ) {
    return { id: 'custom:context', name: 'Context & files', kind: 'custom' }
  }
  if (event.type === 'model_request') {
    return { id: 'custom:model', name: 'Model work', kind: 'custom' }
  }
  if (
    event.type === 'edit_plan_created' ||
    event.type === 'diff_proposed' ||
    event.type === 'apply_result'
  ) {
    return { id: 'custom:edit', name: 'Edit & apply', kind: 'custom' }
  }
  if (event.type === 'verification_result') {
    return { id: 'custom:verify', name: 'Verification', kind: 'custom' }
  }
  if (event.type === 'mcp_tool_call' || event.type === 'tool_policy_decision') {
    return { id: 'custom:tools', name: 'Tools', kind: 'custom' }
  }
  return { id: 'custom:other', name: 'Other work', kind: 'custom' }
}

function groupSubActions(
  spans: TraceSpanView[],
  actionId: string,
): TraceSubAction[] {
  const inAction = spans.filter((span) => span.actionId === actionId)
  if (inAction.length === 0) return []
  const groups = new Map<string, TraceSpanView[]>()
  for (const span of inAction) {
    const key = span.kind
    const list = groups.get(key) ?? []
    list.push(span)
    groups.set(key, list)
  }
  const result: TraceSubAction[] = []
  for (const [kind, group] of groups) {
    const startMs = Math.min(...group.map((span) => span.startMs))
    const ends = group.map((span) => span.endMs).filter((v): v is number => v != null)
    const allEnded = ends.length === group.length
    const hasError = group.some((span) => span.status === 'error')
    const hasRunning = group.some((span) => span.status === 'running')
    result.push({
      subActionId: `${actionId}:sub:${kind}`,
      name: kind,
      status: hasError ? 'failed' : hasRunning ? 'running' : 'complete',
      startMs,
      endMs: allEnded && ends.length > 0 ? Math.max(...ends) : undefined,
      timingQuality: group.every((span) => span.timingQuality === 'exact')
        ? 'exact'
        : group.some((span) => span.timingQuality === 'incomplete')
          ? 'incomplete'
          : 'derived',
      spanIds: group.map((span) => span.spanId),
      derived: true,
    })
  }
  return result.sort((a, b) => a.startMs - b.startMs)
}

function assignSpansToNearestAction(
  spans: TraceSpanView[],
  majors: TraceMajorAction[],
): TraceSpanView[] {
  if (majors.length === 0) return spans
  return spans.map((span) => {
    if (span.actionId) return span
    let best: TraceMajorAction | null = null
    for (const major of majors) {
      const majorEnd = major.endMs ?? Number.POSITIVE_INFINITY
      if (span.startMs >= major.startMs && span.startMs <= majorEnd) {
        if (!best || major.startMs >= best.startMs) best = major
      }
    }
    if (!best) {
      best = majors.reduce((a, b) =>
        Math.abs(a.startMs - span.startMs) <= Math.abs(b.startMs - span.startMs) ? a : b,
      )
    }
    return { ...span, actionId: best.actionId }
  })
}

function isDelegationEvent(event: AgentRunEvent): event is AgentDelegationEvent {
  return (
    event.type === 'task_delegated' ||
    event.type === 'child_run_started' ||
    event.type === 'child_run_completed' ||
    event.type === 'plan_created' ||
    event.type === 'plan_completed' ||
    event.type === 'plan_partially_completed' ||
    event.type === 'child_run_outcome'
  )
}

function payloadStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const status = (payload as { status?: unknown }).status
  return typeof status === 'string' ? status : null
}

/**
 * Project wait (awaiting review) and handoff (delegation) spans from lifecycle /
 * delegation evidence only — never decorative.
 */
export function projectWaitAndHandoffSpans(input: {
  agentRunId: string
  events: AgentRunEvent[]
  poolOriginMs: number
  live?: boolean
  nowMs?: number
}): TraceSpanView[] {
  const { agentRunId, events, poolOriginMs, live = false, nowMs = Date.now() } = input
  const spans: TraceSpanView[] = []
  const relativeNow = rel(nowMs, poolOriginMs)

  for (const event of events) {
    if (!isDelegationEvent(event)) continue
    const at = parseEventMs(event.timestamp)
    if (at == null) continue
    const atRel = rel(at, poolOriginMs)

    if (event.type === 'task_delegated' || event.type === 'child_run_started') {
      const taskId =
        'payload' in event && event.payload && typeof event.payload === 'object'
          ? String((event.payload as { taskId?: string }).taskId ?? '')
          : ''
      spans.push({
        spanId: `span:handoff:${event.eventId}`,
        agentRunId,
        name:
          event.type === 'task_delegated'
            ? taskId
              ? `Handoff · ${taskId}`
              : 'Handoff'
            : taskId
              ? `Child start · ${taskId}`
              : 'Child start',
        kind: 'handoff',
        status: 'ok',
        startMs: atRel,
        endMs: atRel + POINT_MS,
        timingQuality: 'exact',
        attributes: { eventType: event.type, taskId: taskId || undefined },
        evidenceEventIds: [event.eventId],
      })
    }

    if (
      event.type === 'child_run_completed' &&
      event.payload.status === 'awaiting_review'
    ) {
      spans.push({
        spanId: `span:wait:${event.eventId}`,
        agentRunId,
        name: 'Awaiting review',
        kind: 'wait',
        status: live ? 'running' : 'ok',
        startMs: atRel,
        endMs: live ? undefined : atRel + POINT_MS,
        timingQuality: live ? 'exact' : 'derived',
        attributes: {
          eventType: event.type,
          childRunId: event.payload.childRunId,
          taskId: event.payload.taskId,
        },
        evidenceEventIds: [event.eventId],
      })
    }
  }

  for (const event of events) {
    if (event.type !== 'run_completed') continue
    const status = payloadStatus(event.payload)
    if (status !== 'awaiting_review') continue
    const at = parseEventMs(event.timestamp)
    if (at == null) continue
    const atRel = rel(at, poolOriginMs)
    spans.push({
      spanId: `span:wait:${event.eventId}`,
      agentRunId,
      name: 'Awaiting review',
      kind: 'wait',
      status: live ? 'running' : 'ok',
      startMs: atRel,
      endMs: live ? undefined : Math.max(atRel + POINT_MS, relativeNow),
      timingQuality: live ? 'exact' : 'derived',
      attributes: { eventType: event.type, status },
      evidenceEventIds: [event.eventId],
    })
  }

  return spans
}

/** Aggregate expand-strip KPIs; omit tokens unless every model call reported usage. */
export function aggregateAgentPoolRunKpi(
  projection: Pick<AgentPoolTraceProjection, 'majorActions' | 'spans'>,
  relativeNowMs: number,
): AgentPoolRunKpi {
  const { majorActions, spans } = projection
  const starts = [
    ...majorActions.map((m) => m.startMs),
    ...spans.map((s) => s.startMs),
  ]
  const ends = [
    ...majorActions.map((m) => m.endMs ?? relativeNowMs),
    ...spans.map((s) => s.endMs ?? relativeNowMs),
  ]
  const startMs = starts.length > 0 ? Math.min(...starts) : 0
  const endMs = ends.length > 0 ? Math.max(...ends) : relativeNowMs
  const durationMs = Math.max(0, endMs - startMs)

  let modelCallCount = 0
  let toolCallCount = 0
  let errorCount = 0
  let tokensIn = 0
  let tokensOut = 0
  let allModelUsageReported = true
  let sawModel = false

  for (const span of spans) {
    if (span.status === 'error') errorCount += 1
    if (span.kind === 'model') {
      modelCallCount += 1
      sawModel = true
      const usage = span.attributes.usage
      const tokenUsage = span.attributes.tokenUsage as
        | { input?: number; output?: number }
        | undefined
      if (usage === 'reported' && tokenUsage) {
        tokensIn += typeof tokenUsage.input === 'number' ? tokenUsage.input : 0
        tokensOut += typeof tokenUsage.output === 'number' ? tokenUsage.output : 0
      } else {
        allModelUsageReported = false
      }
    }
    if (span.kind === 'tool') toolCallCount += 1
  }

  for (const major of majorActions) {
    if (major.status === 'failed') errorCount += 1
  }

  const kpi: AgentPoolRunKpi = {
    durationMs,
    modelCallCount,
    toolCallCount,
    errorCount,
  }
  if (sawModel && allModelUsageReported) {
    kpi.tokensIn = tokensIn
    kpi.tokensOut = tokensOut
  }
  return kpi
}

/**
 * Project AgentRun events into Major Actions → Sub Actions → Spans.
 * JSONL / event arrays are the source of truth — never invent success.
 */
export function projectAgentPoolTrace(
  input: ProjectAgentPoolTraceInput,
): AgentPoolTraceProjection {
  const {
    agentRunId,
    poolOriginMs,
    live = false,
    nowMs = Date.now(),
  } = input
  const events = input.events ?? []
  const steps =
    input.steps && input.steps.length > 0
      ? input.steps
      : collectStepsFromEvents(events)
  const actions =
    input.actions && input.actions.length > 0
      ? input.actions
      : events.filter(isActionEvent)

  const majorFromSteps = steps.filter((step) => MAJOR_ACTION_KINDS.has(step.kind))
  let majorActions: TraceMajorAction[] = []

  if (majorFromSteps.length > 0) {
    majorActions = majorFromSteps.map((step) => {
      const attemptMatch = /_r(\d+)$/.exec(step.id)
      const attempt = attemptMatch ? Number(attemptMatch[1]) + 1 : 1
      const timing = stepTiming(step.id, events, poolOriginMs, live, nowMs)
      const status = mapStepStatus(step.status)
      return {
        actionId: step.id,
        agentRunId,
        name: step.label,
        kind: step.kind,
        status: live && status === 'running' ? 'running' : status,
        startMs: timing.startMs,
        endMs: status === 'running' && live ? undefined : timing.endMs,
        timingQuality: timing.timingQuality,
        stepId: step.id,
        attempt: attempt > 1 ? attempt : undefined,
        subActions: [],
      }
    })
  } else if (actions.length > 0) {
    const buckets = new Map<
      string,
      { id: string; name: string; kind: 'custom'; events: AgentActionEvent[] }
    >()
    for (const event of actions) {
      const bucket = fallbackBucket(event)
      const existing = buckets.get(bucket.id) ?? {
        ...bucket,
        events: [] as AgentActionEvent[],
      }
      existing.events.push(event)
      buckets.set(bucket.id, existing)
    }
    majorActions = [...buckets.values()].map((bucket) => {
      const times = bucket.events
        .map((event) => parseEventMs(event.timestamp))
        .filter((v): v is number => v != null)
      const startAbs = times.length > 0 ? Math.min(...times) : null
      const endAbs = times.length > 0 ? Math.max(...times) : null
      const hasError = bucket.events.some(
        (event) => actionSpanStatus(event) === 'error',
      )
      return {
        actionId: `${agentRunId}:${bucket.id}`,
        agentRunId,
        name: bucket.name,
        kind: 'custom' as const,
        status: (hasError ? 'failed' : live ? 'running' : 'complete') as TraceMajorActionStatus,
        startMs: startAbs != null ? rel(startAbs, poolOriginMs) : 0,
        endMs:
          live && !hasError
            ? undefined
            : endAbs != null
              ? rel(endAbs, poolOriginMs) + POINT_MS
              : undefined,
        timingQuality: (startAbs != null ? 'derived' : 'incomplete') as TraceTimingQuality,
        subActions: [],
      }
    })
  }

  const actionSpans = assignSpansToNearestAction(
    projectSpansFromActions(agentRunId, actions, poolOriginMs, (event) => {
      if (majorFromSteps.length === 0) {
        return `${agentRunId}:${fallbackBucket(event).id}`
      }
      return undefined
    }),
    majorActions,
  )
  const structuralSpans = projectWaitAndHandoffSpans({
    agentRunId,
    events,
    poolOriginMs,
    live,
    nowMs,
  })
  const spans = [...actionSpans, ...structuralSpans]

  majorActions = majorActions.map((major) => ({
    ...major,
    subActions: groupSubActions(
      spans.filter((span) => span.kind !== 'wait' && span.kind !== 'handoff'),
      major.actionId,
    ),
  }))

  const compactBars: AgentPoolTraceBar[] = [
    ...majorActions.map((major) => ({
      id: major.actionId,
      kind: 'major' as const,
      label: major.name,
      status: toBarStatus(major.status),
      startMs: major.startMs,
      endMs: major.endMs,
      timingQuality: major.timingQuality,
      level: 1 as const,
      attempt: major.attempt,
    })),
    ...structuralSpans.map((span) => ({
      id: span.spanId,
      kind: span.kind,
      label: span.name,
      status: toBarStatus(span.status),
      startMs: span.startMs,
      endMs: span.endMs,
      timingQuality: span.timingQuality,
      level: 1 as const,
    })),
  ]

  const relativeNow = Math.max(0, nowMs - poolOriginMs)
  const kpi = aggregateAgentPoolRunKpi({ majorActions, spans }, relativeNow)

  return { majorActions, spans, compactBars, kpi }
}

/** Bars for expanded L2/L3 under a selected Major Action. */
export function barsForMajorAction(
  projection: AgentPoolTraceProjection,
  actionId: string,
  includeSpans: boolean,
): AgentPoolTraceBar[] {
  const major = projection.majorActions.find((item) => item.actionId === actionId)
  if (!major) return []
  const bars: AgentPoolTraceBar[] = [
    {
      id: major.actionId,
      kind: 'major',
      label: major.name,
      status: toBarStatus(major.status),
      startMs: major.startMs,
      endMs: major.endMs,
      timingQuality: major.timingQuality,
      level: 1,
      attempt: major.attempt,
    },
  ]
  for (const sub of major.subActions) {
    bars.push({
      id: sub.subActionId,
      parentId: major.actionId,
      kind: 'step',
      label: sub.name,
      status: toBarStatus(sub.status),
      startMs: sub.startMs,
      endMs: sub.endMs,
      timingQuality: sub.timingQuality,
      level: 2,
    })
    if (includeSpans) {
      for (const spanId of sub.spanIds) {
        const span = projection.spans.find((item) => item.spanId === spanId)
        if (!span) continue
        bars.push({
          id: span.spanId,
          parentId: sub.subActionId,
          kind: span.kind,
          label: span.name,
          status: toBarStatus(span.status),
          startMs: span.startMs,
          endMs: span.endMs,
          timingQuality: span.timingQuality,
          level: 3,
          attempt: major.attempt,
        })
      }
    }
  }
  // Surface wait/handoff under this major's window when drilling spans.
  if (includeSpans) {
    for (const span of projection.spans) {
      if (span.kind !== 'wait' && span.kind !== 'handoff') continue
      const majorEnd = major.endMs ?? Number.POSITIVE_INFINITY
      if (span.startMs < major.startMs || span.startMs > majorEnd) continue
      if (bars.some((bar) => bar.id === span.spanId)) continue
      bars.push({
        id: span.spanId,
        parentId: major.actionId,
        kind: span.kind,
        label: span.name,
        status: toBarStatus(span.status),
        startMs: span.startMs,
        endMs: span.endMs,
        timingQuality: span.timingQuality,
        level: 3,
      })
    }
  }
  return bars
}

/** Stable definition id — opaque, not derived from mutable display config. */
export function stableDefinitionId(input: {
  source: 'root' | 'delegation' | 'session' | 'compose'
  taskId: string
  chatSessionId?: string | null
}): string {
  if (input.source === 'root') {
    return `def_root_${input.chatSessionId ?? 'workspace'}`
  }
  if (input.source === 'delegation') {
    return `def_task_${input.taskId}`
  }
  if (input.source === 'session') {
    return `def_${input.taskId}`
  }
  return `def_${input.taskId}`
}

/** Independent pool run id; relationship to rootRunId is metadata only. */
export function createPoolRunId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `pool_${crypto.randomUUID()}`
  }
  return `pool_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function resolvePoolOriginMs(
  absoluteStarts: Array<number | null | undefined>,
  fallback = Date.now(),
): number {
  const values = absoluteStarts.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  )
  return values.length > 0 ? Math.min(...values) : fallback
}
