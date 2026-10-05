import type {
  ActivityEntry,
  ActivityEntryStatus,
  AgentActionEvent,
  AgentRunEvent,
  AgentTransientTrace,
  VerificationCommandResult,
  VerificationRunResult,
} from '@contracts/index'
import { useActivityStore } from './activityStore'

function logActivity(
  entry: Omit<ActivityEntry, 'id' | 'timestamp'> & Partial<Pick<ActivityEntry, 'id' | 'timestamp'>>,
): void {
  useActivityStore.getState().appendEntry(entry)
}

function statusForStep(event: AgentRunEvent): ActivityEntryStatus {
  if (event.type === 'step_failed') return 'error'
  if (event.type === 'step_completed') return 'success'
  return 'info'
}

function titleForAction(action: AgentActionEvent): string {
  switch (action.type) {
    case 'context_assembled':
      return 'Context assembled'
    case 'file_read':
      return `Read file: ${String(action.payload.path ?? 'unknown')}`
    case 'model_request':
      return 'Model request'
    case 'edit_plan_created':
      return 'Edit plan created'
    case 'proposal_validation_result':
      return 'Proposal validation'
    case 'batch_validation_result':
      return 'Batch validation'
    case 'decision_summary':
      return 'Decision summary'
    case 'diff_proposed':
      return 'Diff proposed'
    case 'apply_result':
      return action.payload.outcome === 'applied' ? 'Changes applied' : 'Apply skipped'
    case 'verification_result':
      return `Verification: ${String(action.payload.status ?? 'unknown')}`
    default:
      return action.type
  }
}

function stepLabel(event: AgentRunEvent): string {
  if (!event.step) return 'step'
  return event.step.label || event.step.outputSummary?.trim() || event.step.kind
}

export function logRunEventToActivity(event: AgentRunEvent): void {
  const runId = event.runId

  if (event.type === 'run_started') {
    logActivity({
      runId,
      channel: 'agent',
      kind: 'lifecycle',
      title: 'Agent run started',
      status: 'info',
      sourceEventId: event.eventId,
    })
    return
  }

  if (event.type === 'run_completed') {
    logActivity({
      runId,
      channel: 'agent',
      kind: 'lifecycle',
      title: 'Agent run completed',
      status: 'success',
      sourceEventId: event.eventId,
    })
    return
  }

  if (event.type === 'step_started' && event.step) {
    logActivity({
      runId,
      channel: 'agent',
      kind: 'lifecycle',
      title: `Step started: ${stepLabel(event)}`,
      detail: event.step.outputSummary,
      status: 'info',
      sourceEventId: event.eventId,
    })
    return
  }

  if ((event.type === 'step_completed' || event.type === 'step_failed') && event.step) {
    logActivity({
      runId,
      channel: 'agent',
      kind: 'lifecycle',
      title: `Step ${event.type === 'step_completed' ? 'completed' : 'failed'}: ${stepLabel(event)}`,
      detail: event.step.outputSummary,
      status: statusForStep(event),
      sourceEventId: event.eventId,
    })
    return
  }

  if (event.type === 'diff_ready') {
    logActivity({
      runId,
      channel: 'agent',
      kind: 'lifecycle',
      title: 'Diff ready for review',
      status: 'info',
      sourceEventId: event.eventId,
    })
    return
  }

  if (event.type === 'apply_result') {
    logActivity({
      runId,
      channel: 'agent',
      kind: 'lifecycle',
      title: event.payload.outcome === 'applied' ? 'Patch applied' : 'Patch not applied',
      detail:
        event.payload.filesWritten.length > 0
          ? `Files: ${event.payload.filesWritten.join(', ')}`
          : undefined,
      status: event.payload.outcome === 'applied' ? 'success' : 'warning',
      sourceEventId: event.eventId,
    })
    return
  }

  if (event.type === 'verification_completed') {
    const status = event.payload?.status
    const message = typeof event.payload?.message === 'string' ? event.payload.message : undefined
    logActivity({
      runId,
      channel: 'verification',
      kind: 'verification',
      title: `Verification ${status ?? 'completed'}`,
      detail: message,
      status:
        status === 'passed' ? 'success' : status === 'failed' ? 'error' : 'info',
      sourceEventId: event.eventId,
    })
    return
  }

  if (
    event.type === 'context_assembled' ||
    event.type === 'file_read' ||
    event.type === 'model_request' ||
    event.type === 'edit_plan_created' ||
    event.type === 'proposal_validation_result' ||
    event.type === 'batch_validation_result' ||
    event.type === 'decision_summary' ||
    event.type === 'diff_proposed' ||
    event.type === 'verification_result'
  ) {
    logActivity({
      runId,
      channel: event.type === 'verification_result' ? 'verification' : 'agent',
      kind: 'action',
      title: titleForAction(event),
      status:
        event.type === 'verification_result' && event.payload.status === 'failed'
          ? 'error'
          : 'info',
      sourceEventId: event.eventId,
    })
  }
}

export function logTransientTraceToActivity(trace: AgentTransientTrace): void {
  logActivity({
    runId: trace.runId,
    channel: 'agent',
    kind: 'reasoning',
    title: `Reasoning (${trace.phaseId})`,
    body: trace.content,
    status: 'info',
    sourceEventId: trace.traceId,
  })
}

export function logVerificationResultToActivity(result: VerificationRunResult): void {
  logActivity({
    runId: result.runId,
    channel: 'verification',
    kind: 'verification',
    title: `Verification ${result.status}`,
    status:
      result.status === 'passed' ? 'success' : result.status === 'failed' ? 'error' : 'info',
  })

  for (const commandResult of result.results) {
    logVerificationCommandToActivity(result.runId, commandResult)
  }
}

export function logVerificationCommandToActivity(
  runId: string,
  result: VerificationCommandResult,
): void {
  const commandLabel = [result.command.command, ...result.command.args].join(' ')
  logActivity({
    runId,
    channel: 'verification',
    kind: 'command',
    title: commandLabel,
    detail: `Exit ${result.exitCode ?? 'n/a'} · ${result.durationMs}ms${
      result.timedOut ? ' · timed out' : ''
    }${result.outputTruncated ? ' · output truncated' : ''}`,
    body: result.output,
    status: result.status === 'passed' ? 'success' : 'error',
  })
}
