import type {
  AgentActionEvent,
  AgentActivity,
  AgentConversationScope,
  AgentTransientTrace,
  AskExplorationTrace,
  RetrievalSummary,
} from '@contracts/index'

export interface ActivityLabels {
  thinking: () => string
  planning: (objective?: string) => string
  explored: (count: number) => string
  exploredEmpty: () => string
  grepHits: (count: number) => string
  readFile: (file: string) => string
  edited: (file: string) => string
  ran: (command: string, status: string) => string
  context: (count: number) => string
  mcp: (tool: string, status: string) => string
  askFailed: () => string
}

export interface ActivityMessageSource {
  id: string
  timestamp: string
  explorationTrace?: AskExplorationTrace
  retrievalSummary?: RetrievalSummary
}

export interface ActivityAskResult {
  id: string
  createdAt: string
  contextBundleHash: string
  contextSummary: {
    files: Array<{
      path: string
      disposition: string
      byteLength?: number
      includedByteLength?: number
      omissionReason?: string
    }>
  }
  reasoning?: { content: string; truncated: boolean }
  explorationTrace?: AskExplorationTrace
  retrievalSummary?: RetrievalSummary
}

export type ActivityAskTrace =
  | { status: 'running'; scope: AgentConversationScope }
  | { status: 'complete'; scope: AgentConversationScope; result: ActivityAskResult }
  | { status: 'error'; scope: AgentConversationScope; message: string }

export interface ActivityPlanResult {
  id?: string
  objective: string
  steps: Array<{ description: string }>
  explorationTrace?: AskExplorationTrace
}

export type ActivityPlanTrace =
  | { status: 'running' }
  | { status: 'complete' | 'needs_clarification'; result: ActivityPlanResult }
  | { status: 'error'; message: string }

export interface ActivityProjectionInput {
  messages: ActivityMessageSource[]
  latestAskTrace: ActivityAskTrace | null
  latestPlanTrace: ActivityPlanTrace | null
  activeRunId: string | null
  flowActions: AgentActionEvent[]
  flowTransientTraces: AgentTransientTrace[]
  chatMode: 'ask' | 'change' | 'plan' | 'debug' | 'anchored'
  debugExploration?: AskExplorationTrace | null
}

const FALLBACK_TIME = '1970-01-01T00:00:00.000Z'

function fileName(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

function clock(messages: ActivityMessageSource[]): string {
  return messages[messages.length - 1]?.timestamp || FALLBACK_TIME
}

function appendExploration(
  activities: AgentActivity[],
  labels: ActivityLabels,
  sourceId: string,
  startedAt: string,
  trace: AskExplorationTrace,
  mode: AgentActivity['mode'],
  anchorMessageId?: string,
): void {
  const rounds = trace.rounds ?? []
  if (rounds.length > 0) {
    for (const round of rounds) {
      if (round.symbols.length === 0 && round.hits.length === 0) continue
      activities.push({
        id: `msg:${sourceId}:grep:${round.index}`,
        runId: sourceId,
        ...(anchorMessageId ? { anchorMessageId } : {}),
        mode,
        kind: 'grep',
        status: 'complete',
        summary: labels.grepHits(round.hits.length),
        startedAt,
        completedAt: startedAt,
        detail: {
          kind: 'grep',
          queries: round.symbols,
          hits: round.hits.map((hit) => ({
            path: hit.path,
            line: hit.line,
            preview: hit.preview,
          })),
          paths: round.reads.map((read) => read.path),
        },
      })
      for (const read of round.reads) {
        activities.push({
          id: `msg:${sourceId}:read:${round.index}:${read.path}`,
          runId: sourceId,
          ...(anchorMessageId ? { anchorMessageId } : {}),
          mode,
          kind: 'read_file',
          status: 'complete',
          summary: labels.readFile(fileName(read.path)),
          startedAt,
          completedAt: startedAt,
          detail: {
            kind: 'read_file',
            path: read.path,
            startLine: read.startLine,
            endLine: read.endLine,
            excerpt: read.excerpt,
            truncated: read.truncated,
            status: 'ok',
          },
        })
      }
    }
    return
  }
  if (trace.hits.length === 0 && trace.readPaths.length === 0 && (trace.reads?.length ?? 0) === 0) {
    return
  }
  const count = trace.readPaths.length
  activities.push({
    id: `msg:${sourceId}:explore`,
    runId: sourceId,
    ...(anchorMessageId ? { anchorMessageId } : {}),
    mode,
    kind: 'grep',
    status: 'complete',
    summary: count > 0 ? labels.explored(count) : labels.grepHits(trace.hits.length),
    startedAt,
    completedAt: startedAt,
    detail: {
      kind: 'grep',
      queries: trace.queriedSymbols,
      hits: trace.hits.map((hit) => ({
        path: hit.path,
        line: hit.line,
        preview: hit.preview,
      })),
      paths: trace.readPaths,
    },
  })
  for (const read of trace.reads ?? []) {
    activities.push({
      id: `msg:${sourceId}:read:${read.path}`,
      runId: sourceId,
      ...(anchorMessageId ? { anchorMessageId } : {}),
      mode,
      kind: 'read_file',
      status: 'complete',
      summary: labels.readFile(fileName(read.path)),
      startedAt,
      completedAt: startedAt,
      detail: {
        kind: 'read_file',
        path: read.path,
        startLine: read.startLine,
        endLine: read.endLine,
        excerpt: read.excerpt,
        truncated: read.truncated,
        status: 'ok',
      },
    })
  }
}

function retrievalActivity(
  labels: ActivityLabels,
  sourceId: string,
  startedAt: string,
  summary: RetrievalSummary,
  anchorMessageId: string,
): AgentActivity | null {
  if (!summary.searched) return null
  return {
    id: `msg:${sourceId}:retrieval`,
    runId: sourceId,
    anchorMessageId,
    mode: 'ask',
    kind: 'grep',
    status: 'complete',
    summary: summary.hitCount > 0
      ? labels.grepHits(summary.hitCount)
      : labels.exploredEmpty(),
    startedAt,
    completedAt: startedAt,
    detail: {
      kind: 'grep',
      queries: [],
      hits: summary.paths.map((path) => ({ path })),
      paths: summary.paths,
    },
  }
}

function projectFlowActivities(
  input: ActivityProjectionInput,
  labels: ActivityLabels,
  startedAt: string,
): AgentActivity[] {
  const mode = input.chatMode === 'anchored' ? 'ask' : input.chatMode
  const activities: AgentActivity[] = []

  for (const trace of input.flowTransientTraces) {
    activities.push({
      id: trace.traceId,
      runId: trace.runId,
      mode,
      kind: 'thinking',
      status: 'complete',
      summary: labels.thinking(),
      startedAt: trace.timestamp || startedAt,
      completedAt: trace.timestamp || startedAt,
      detail: {
        kind: 'thinking',
        content: trace.content,
        truncated: trace.truncated,
      },
    })
  }

  for (const event of input.flowActions) {
    const at = event.timestamp || startedAt
    switch (event.type) {
      case 'context_assembled':
        activities.push({
          id: event.eventId,
          runId: event.runId,
          mode,
          kind: 'context',
          status: 'complete',
          summary: labels.context(event.payload.files.length),
          startedAt: at,
          completedAt: at,
          detail: {
            kind: 'context',
            bundleHash: event.payload.bundleHash,
            files: event.payload.files.map((file) => ({
              path: file.path,
              disposition: file.disposition,
              ...(file.byteLength !== undefined ? { byteLength: file.byteLength } : {}),
              ...(file.includedByteLength !== undefined
                ? { includedByteLength: file.includedByteLength }
                : {}),
              ...(file.omissionReason ? { omissionReason: file.omissionReason } : {}),
            })),
          },
        })
        break
      case 'file_read':
        activities.push({
          id: event.eventId,
          runId: event.runId,
          mode,
          kind: 'read_file',
          status: event.payload.status === 'failed' ? 'error' : 'complete',
          summary: labels.readFile(fileName(event.payload.path)),
          startedAt: at,
          completedAt: at,
          ...(event.phaseId ? { phaseId: event.phaseId } : {}),
          detail: {
            kind: 'read_file',
            path: event.payload.path,
            byteLength: event.payload.byteLength,
            status: event.payload.status,
            ...(event.payload.startLine !== undefined ? { startLine: event.payload.startLine } : {}),
            ...(event.payload.endLine !== undefined ? { endLine: event.payload.endLine } : {}),
            ...(event.payload.excerpt ? { excerpt: event.payload.excerpt } : {}),
            ...(event.payload.truncated !== undefined ? { truncated: event.payload.truncated } : {}),
          },
        })
        break
      case 'edit_plan_created':
        activities.push({
          id: event.eventId,
          runId: event.runId,
          mode,
          kind: 'planning',
          status: 'complete',
          summary: labels.planning(event.payload.objective),
          startedAt: at,
          completedAt: at,
          detail: {
            kind: 'planning',
            objective: event.payload.objective,
            anchors: event.payload.anchors,
            acceptanceCriteria: event.payload.acceptanceCriteria,
          },
        })
        break
      case 'diff_proposed':
        for (const file of event.payload.files) {
          activities.push({
            id: `${event.eventId}:${file.path}`,
            runId: event.runId,
            mode,
            kind: 'edit',
            status: 'complete',
            summary: labels.edited(fileName(file.path)),
            startedAt: at,
            completedAt: at,
            detail: {
              kind: 'edit',
              path: file.path,
              operation: file.operation,
              ...(file.additions !== undefined ? { additions: file.additions } : {}),
              ...(file.deletions !== undefined ? { deletions: file.deletions } : {}),
              ...(file.hunkHeader ? { hunkHeader: file.hunkHeader } : {}),
            },
          })
        }
        break
      case 'verification_result':
        activities.push({
          id: event.eventId,
          runId: event.runId,
          mode,
          kind: 'shell',
          status: event.payload.status === 'failed' ? 'error' : 'complete',
          summary: labels.ran(event.payload.command ?? '—', event.payload.status),
          startedAt: at,
          completedAt: at,
          detail: {
            kind: 'shell',
            ...(event.payload.command ? { command: event.payload.command } : {}),
            status: event.payload.status,
            ...(event.payload.exitCode !== undefined ? { exitCode: event.payload.exitCode } : {}),
            ...(event.payload.stdout ? { stdout: event.payload.stdout } : {}),
            ...(event.payload.stderr ? { stderr: event.payload.stderr } : {}),
            ...(event.payload.truncated !== undefined ? { truncated: event.payload.truncated } : {}),
            ...(event.payload.durationMs !== undefined ? { durationMs: event.payload.durationMs } : {}),
          },
        })
        break
      case 'mcp_tool_call':
        activities.push({
          id: event.eventId,
          runId: event.runId,
          mode,
          kind: 'mcp',
          status: event.payload.status === 'failed' || event.payload.status === 'rejected'
            ? 'error'
            : 'complete',
          summary: labels.mcp(event.payload.toolName, event.payload.status),
          startedAt: at,
          completedAt: at,
          detail: {
            kind: 'mcp',
            serverId: event.payload.serverId,
            toolName: event.payload.toolName,
            status: event.payload.status,
            durationMs: event.payload.durationMs,
            ...(event.payload.error ? { error: event.payload.error } : {}),
          },
        })
        break
      default:
        break
    }
  }

  return activities
}

/**
 * Project sidebar summaries and overlay details from messages and the live run.
 * Does not invent steps that did not happen.
 */
export function projectAgentActivities(
  input: ActivityProjectionInput,
  labels: ActivityLabels,
): AgentActivity[] {
  const startedAt = clock(input.messages)
  const activities: AgentActivity[] = []
  const anchoredExplore = new Set<string>()
  const anchoredRetrieval = new Set<string>()

  for (const message of input.messages) {
    if (message.explorationTrace) {
      appendExploration(
        activities,
        labels,
        message.id,
        message.timestamp || startedAt,
        message.explorationTrace,
        'ask',
        message.id,
      )
      anchoredExplore.add(message.id)
    }
    if (message.retrievalSummary) {
      const retrieval = retrievalActivity(
        labels,
        message.id,
        message.timestamp || startedAt,
        message.retrievalSummary,
        message.id,
      )
      if (retrieval) {
        activities.push(retrieval)
        anchoredRetrieval.add(message.id)
      }
    }
  }

  const ask = input.latestAskTrace
  if (ask?.status === 'running') {
    activities.push({
      id: 'ask:thinking',
      runId: 'ask',
      mode: 'ask',
      kind: 'thinking',
      status: 'running',
      summary: labels.thinking(),
      startedAt,
      detail: { kind: 'thinking', content: '', truncated: false },
    })
  } else if (ask?.status === 'error') {
    activities.push({
      id: 'ask:thinking',
      runId: 'ask',
      mode: 'ask',
      kind: 'thinking',
      status: 'error',
      summary: labels.askFailed(),
      startedAt,
      detail: { kind: 'thinking', content: ask.message, truncated: false },
    })
  } else if (ask?.status === 'complete') {
    const result = ask.result
    activities.push({
      id: `ask:${result.id}:context`,
      runId: result.id,
      anchorMessageId: result.id,
      mode: 'ask',
      kind: 'context',
      status: 'complete',
      summary: labels.context(result.contextSummary.files.length),
      startedAt: result.createdAt,
      completedAt: result.createdAt,
      detail: {
        kind: 'context',
        bundleHash: result.contextBundleHash,
        files: result.contextSummary.files.map((file) => ({
          path: file.path,
          disposition: file.disposition,
          ...(file.byteLength !== undefined ? { byteLength: file.byteLength } : {}),
          ...(file.includedByteLength !== undefined
            ? { includedByteLength: file.includedByteLength }
            : {}),
          ...(file.omissionReason ? { omissionReason: file.omissionReason } : {}),
        })),
      },
    })
    if (result.reasoning) {
      activities.push({
        id: 'ask:thinking',
        runId: result.id,
        anchorMessageId: result.id,
        mode: 'ask',
        kind: 'thinking',
        status: 'complete',
        summary: labels.thinking(),
        startedAt: result.createdAt,
        completedAt: result.createdAt,
        detail: {
          kind: 'thinking',
          content: result.reasoning.content,
          truncated: result.reasoning.truncated,
        },
      })
    }
    if (result.explorationTrace && !anchoredExplore.has(result.id)) {
      appendExploration(
        activities,
        labels,
        result.id,
        result.createdAt,
        result.explorationTrace,
        'ask',
        result.id,
      )
    }
    if (result.retrievalSummary && !anchoredRetrieval.has(result.id)) {
      const retrieval = retrievalActivity(
        labels,
        result.id,
        result.createdAt,
        result.retrievalSummary,
        result.id,
      )
      if (retrieval) activities.push(retrieval)
    }
  }

  const plan = input.latestPlanTrace
  if (plan?.status === 'running') {
    activities.push({
      id: 'plan:planning',
      runId: 'plan',
      mode: 'plan',
      kind: 'planning',
      status: 'running',
      summary: labels.planning(),
      startedAt,
      detail: { kind: 'planning', objective: '', anchors: [], acceptanceCriteria: [] },
    })
  } else if (plan?.status === 'error') {
    activities.push({
      id: 'plan:planning',
      runId: 'plan',
      mode: 'plan',
      kind: 'planning',
      status: 'error',
      summary: labels.askFailed(),
      startedAt,
      detail: {
        kind: 'planning',
        objective: plan.message,
        anchors: [],
        acceptanceCriteria: [],
      },
    })
  } else if (plan && (plan.status === 'complete' || plan.status === 'needs_clarification')) {
    activities.push({
      id: 'plan:planning',
      runId: 'plan',
      mode: 'plan',
      kind: 'planning',
      status: 'complete',
      summary: labels.planning(plan.result.objective),
      startedAt,
      completedAt: startedAt,
      detail: {
        kind: 'planning',
        objective: plan.result.objective,
        anchors: [],
        acceptanceCriteria: plan.result.steps.map((step) => step.description),
      },
    })
    if (plan.result.explorationTrace) {
      appendExploration(
        activities,
        labels,
        plan.result.id ?? 'plan',
        startedAt,
        plan.result.explorationTrace,
        'plan',
      )
    }
  }

  if (input.debugExploration) {
    appendExploration(
      activities,
      labels,
      'debug',
      startedAt,
      input.debugExploration,
      'debug',
    )
  }

  activities.push(...projectFlowActivities(input, labels, startedAt))
  return activities
}

export function buildActivityLabels(
  ts: (path: string, params?: Record<string, string | number>) => string,
): ActivityLabels {
  return {
    thinking: () => ts('agentFlow.activity.thinking'),
    planning: (objective) => {
      const text = objective?.trim()
      if (!text) return ts('agentFlow.activity.planning')
      return text.length > 80 ? `${text.slice(0, 77)}…` : text
    },
    explored: (count) => ts('agentFlow.activity.explored', { count }),
    exploredEmpty: () => ts('agentFlow.activity.exploredEmpty'),
    grepHits: (count) => ts('agentFlow.activity.grepHits', { count }),
    readFile: (file) => ts('agentFlow.activity.readFile', { file }),
    edited: (file) => ts('agentFlow.activity.edited', { file }),
    ran: (command, status) => ts('agentFlow.activity.ran', { command, status }),
    context: (count) => ts('agentFlow.activity.context', { count }),
    mcp: (tool, status) => ts('agentFlow.activity.mcp', { tool, status }),
    askFailed: () => ts('agentFlow.activity.askFailed'),
  }
}

export function activitiesForMessage(
  activities: AgentActivity[],
  messageId: string,
): AgentActivity[] {
  return activities.filter((activity) => activity.anchorMessageId === messageId)
}

export function liveActivities(activities: AgentActivity[]): AgentActivity[] {
  return activities.filter((activity) => !activity.anchorMessageId)
}
