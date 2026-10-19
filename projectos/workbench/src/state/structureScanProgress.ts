import type {
  StructureScanProgress,
  StructureScanProgressEvent,
  StructureScanStep,
  StructureScanStepId,
} from '@contracts/index'
import { createPlannedStructureScanSteps } from '@contracts/index'

function patchStep(
  steps: StructureScanStep[],
  stepId: StructureScanStepId,
  patch: Partial<StructureScanStep>,
): StructureScanStep[] {
  return steps.map((step) =>
    step.id === stepId ? { ...step, ...patch, id: stepId } : step,
  )
}

export function applyStructureScanProgressEvent(
  current: StructureScanProgress | null,
  event: StructureScanProgressEvent,
): StructureScanProgress {
  const base: StructureScanProgress =
    current && current.scanId === event.scanId
      ? current
      : {
          scanId: event.scanId,
          projectId: event.projectId,
          mode: event.type === 'scan_planned' ? event.mode : (current?.mode ?? 'regenerate'),
          status: 'running',
          steps:
            event.type === 'scan_planned'
              ? event.steps
              : createPlannedStructureScanSteps(),
          startedAt: event.timestamp,
          updatedAt: event.timestamp,
        }

  // Ignore late step noise after the scan already settled (esp. after cancel).
  if (
    current &&
    current.scanId === event.scanId &&
    (current.status === 'cancelled' ||
      current.status === 'success' ||
      current.status === 'failed') &&
    event.type !== 'scan_cancelled' &&
    event.type !== 'scan_completed' &&
    event.type !== 'scan_failed'
  ) {
    return current
  }
  if (
    current &&
    current.scanId === event.scanId &&
    current.status === 'cancelled' &&
    (event.type === 'scan_completed' || event.type === 'scan_failed')
  ) {
    return current
  }

  const updatedAt = event.timestamp
  switch (event.type) {
    case 'scan_planned':
      return {
        ...base,
        mode: event.mode,
        status: 'running',
        steps: event.steps,
        updatedAt,
      }
    case 'step_started':
      return {
        ...base,
        status: 'running',
        steps: patchStep(base.steps, event.stepId, {
          status: 'running',
          ...(event.detail !== undefined ? { detail: event.detail } : {}),
        }),
        updatedAt,
      }
    case 'step_completed':
      return {
        ...base,
        steps: patchStep(base.steps, event.stepId, {
          status: 'complete',
          ...(event.detail !== undefined ? { detail: event.detail } : {}),
        }),
        updatedAt,
      }
    case 'step_skipped':
      return {
        ...base,
        steps: patchStep(base.steps, event.stepId, {
          status: 'skipped',
          ...(event.detail !== undefined ? { detail: event.detail } : {}),
        }),
        updatedAt,
      }
    case 'step_failed':
      return {
        ...base,
        status: 'failed',
        error: event.message,
        steps: patchStep(base.steps, event.stepId, { status: 'failed' }),
        updatedAt,
      }
    case 'scan_completed':
      return {
        ...base,
        status: 'success',
        error: undefined,
        steps: base.steps.map((step) =>
          step.status === 'pending' || step.status === 'running'
            ? { ...step, status: 'complete' as const }
            : step,
        ),
        updatedAt,
      }
    case 'scan_failed':
      return {
        ...base,
        status: 'failed',
        error: event.message,
        steps: event.stepId
          ? patchStep(base.steps, event.stepId, { status: 'failed' })
          : base.steps.map((step) =>
              step.status === 'running' ? { ...step, status: 'failed' as const } : step,
            ),
        updatedAt,
      }
    case 'scan_cancelled':
      return {
        ...base,
        status: 'cancelled',
        error: undefined,
        steps: base.steps.map((step) =>
          step.status === 'running' || step.status === 'pending'
            ? { ...step, status: 'skipped' as const }
            : step,
        ),
        updatedAt,
      }
    default:
      return { ...base, updatedAt }
  }
}
