import type { WorkGroupSelectCandidate } from './mapWorkGroupSelection'

export type WorkGroupSuggestionMove = 'next' | 'previous' | 'first' | 'last'

export function moveWorkGroupSuggestionIndex(
  candidates: readonly Pick<WorkGroupSelectCandidate, 'disabled'>[],
  currentIndex: number,
  move: WorkGroupSuggestionMove,
): number {
  if (candidates.length === 0) return -1
  const enabled = candidates
    .map((candidate, index) => (candidate.disabled ? -1 : index))
    .filter((index) => index >= 0)
  if (enabled.length === 0) return -1
  if (move === 'first') return enabled[0]!
  if (move === 'last') return enabled.at(-1)!

  const enabledIndex = enabled.indexOf(currentIndex)
  if (move === 'next') {
    return enabled[enabledIndex >= 0 ? (enabledIndex + 1) % enabled.length : 0]!
  }
  return enabled[
    enabledIndex >= 0
      ? (enabledIndex - 1 + enabled.length) % enabled.length
      : enabled.length - 1
  ]!
}
