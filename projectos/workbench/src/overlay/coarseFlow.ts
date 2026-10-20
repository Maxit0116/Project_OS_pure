export type CoarseFlowLabel =
  | 'reading'
  | 'thinking'
  | 'writing'
  | 'verifying'
  | 'done'
  | 'error'

export type CompactFlowStepStatus = 'running' | 'complete' | 'error' | 'warning'

export interface CompactFlowStep {
  id: string
  label: string
  status: CompactFlowStepStatus
}

export function mapRunEventToCoarseFlow(event: unknown): CoarseFlowLabel | null {
  if (!event || typeof event !== 'object' || !('type' in event)) return null
  const type = String((event as { type: unknown }).type)
  switch (type) {
    case 'file_read':
    case 'context_assembled':
    case 'context_attached':
    case 'mcp_tool_call':
    case 'tool_policy_decision':
      return 'reading'
    case 'model_request':
    case 'step_started':
    case 'run_started':
    case 'prompt_refined':
    case 'decision_summary':
      return 'thinking'
    case 'diff_proposed':
    case 'edit_plan_created':
    case 'apply_result':
    case 'diff_ready':
      return 'writing'
    case 'verification_result':
    case 'verification_completed':
    case 'proposal_validation_result':
    case 'batch_validation_result':
      return 'verifying'
    case 'run_completed':
    case 'step_completed':
      return 'done'
    case 'step_failed':
    case 'run_cancelled':
    case 'run_interrupted':
      return 'error'
    default:
      return null
  }
}

export function mapTransientTraceToCoarseFlow(trace: unknown): CoarseFlowLabel | null {
  if (!trace || typeof trace !== 'object') return null
  const record = trace as { kind?: string; phase?: string; toolName?: string }
  const blob = `${record.kind ?? ''} ${record.phase ?? ''} ${record.toolName ?? ''}`.toLowerCase()
  if (blob.includes('grep') || blob.includes('read') || blob.includes('search')) {
    return 'reading'
  }
  if (blob.includes('write') || blob.includes('edit') || blob.includes('apply')) {
    return 'writing'
  }
  if (blob.includes('think') || blob.includes('model')) {
    return 'thinking'
  }
  return 'thinking'
}

function upsertCompactStep(
  steps: CompactFlowStep[],
  step: CompactFlowStep,
): CompactFlowStep[] {
  const index = steps.findIndex((item) => item.id === step.id)
  if (index < 0) return [...steps, step]
  const next = [...steps]
  next[index] = { ...next[index]!, ...step }
  return next
}

function stepFromEvent(event: {
  type: string
  step?: { id?: string; label?: string; status?: string }
}): CompactFlowStep | null {
  const step = event.step
  if (!step?.id || !step.label) return null
  if (event.type === 'step_started') {
    return { id: step.id, label: step.label, status: 'running' }
  }
  if (event.type === 'step_completed') {
    return { id: step.id, label: step.label, status: 'complete' }
  }
  if (event.type === 'step_failed') {
    return { id: step.id, label: step.label, status: 'error' }
  }
  return null
}

/** Apply a streamed run event into a compact overlay flow timeline. */
export function applyRunEventToCompactFlow(
  steps: CompactFlowStep[],
  event: unknown,
): { steps: CompactFlowStep[]; phase: CoarseFlowLabel | null } {
  const phase = mapRunEventToCoarseFlow(event)
  if (!event || typeof event !== 'object' || !('type' in event)) {
    return { steps, phase }
  }
  const typed = event as {
    type: string
    step?: { id?: string; label?: string; status?: string }
    payload?: { stepId?: string; message?: string }
  }

  const fromStep = stepFromEvent(typed)
  let nextSteps = fromStep ? upsertCompactStep(steps, fromStep) : steps

  if (typed.type === 'correction_added') {
    const stepId = typed.payload?.stepId
    if (stepId) {
      nextSteps = nextSteps.map((item) =>
        item.id === stepId ? { ...item, status: 'warning' as const } : item,
      )
    }
  }

  // Synthetic breadcrumbs when the run emits action events without step payloads.
  if (!fromStep && phase && phase !== 'done' && phase !== 'error') {
    const syntheticId = `phase_${phase}`
    const labels: Record<Exclude<CoarseFlowLabel, 'done' | 'error'>, string> = {
      reading: 'Reading context',
      thinking: 'Thinking',
      writing: 'Writing changes',
      verifying: 'Verifying',
    }
    const label = labels[phase as keyof typeof labels]
    if (label) {
      nextSteps = upsertCompactStep(nextSteps, {
        id: syntheticId,
        label,
        status: 'running',
      })
      // Mark previous synthetic phases complete when moving on.
      nextSteps = nextSteps.map((item) =>
        item.id.startsWith('phase_') && item.id !== syntheticId && item.status === 'running'
          ? { ...item, status: 'complete' }
          : item,
      )
    }
  }

  if (typed.type === 'run_completed') {
    nextSteps = nextSteps.map((item) =>
      item.status === 'running' ? { ...item, status: 'complete' } : item,
    )
  }

  return { steps: nextSteps, phase }
}

export function currentCompactFlowLabel(
  steps: CompactFlowStep[],
  phase: CoarseFlowLabel | null,
): string {
  const running = [...steps].reverse().find((item) => item.status === 'running')
  if (running) return running.label
  const last = steps[steps.length - 1]
  if (last) return last.label
  if (phase === 'error') return 'Error'
  if (phase === 'done') return 'Done'
  if (phase === 'thinking') return 'Thinking'
  if (phase === 'reading') return 'Reading'
  if (phase === 'writing') return 'Writing'
  if (phase === 'verifying') return 'Verifying'
  return 'Agent flow'
}
