import type { CoarseFlowLabel, CompactFlowStep } from './coarseFlow'

export type FlowBookmarkMode = 'hidden' | 'current' | 'tab' | 'open'

export function isCompactFlowRunning(
  steps: CompactFlowStep[],
  phase: CoarseFlowLabel | null,
): boolean {
  if (steps.some((step) => step.status === 'running')) return true
  return (
    phase === 'reading' ||
    phase === 'thinking' ||
    phase === 'writing' ||
    phase === 'verifying'
  )
}

/** Collapsed running flow shows the current step. A finished flow keeps only a tab. */
export function flowBookmarkMode(input: {
  steps: CompactFlowStep[]
  phase: CoarseFlowLabel | null
  open: boolean
}): FlowBookmarkMode {
  const hasFlow = input.steps.length > 0 || input.phase != null
  if (!hasFlow) return 'hidden'
  if (input.open) return 'open'
  if (isCompactFlowRunning(input.steps, input.phase)) return 'current'
  return 'tab'
}
