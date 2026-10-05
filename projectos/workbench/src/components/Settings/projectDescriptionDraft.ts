export interface ProjectDescriptionDraftState {
  draft: string
  source: string
}

export function reconcileProjectDescriptionDraft(
  state: ProjectDescriptionDraftState,
  nextSource: string,
): ProjectDescriptionDraftState {
  const dirty = state.draft !== state.source
  const matchesSavedValue = state.draft.trim() === nextSource
  return {
    draft: !dirty || matchesSavedValue ? nextSource : state.draft,
    source: nextSource,
  }
}

export function normalizedProjectDescriptionDraft(draft: string): string {
  return draft.trim()
}
