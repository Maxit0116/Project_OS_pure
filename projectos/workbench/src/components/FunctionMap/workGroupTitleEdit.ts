export interface WorkGroupTitleEditSession {
  settled: boolean
}

export function settleWorkGroupTitleEdit(
  session: WorkGroupTitleEditSession,
  draft: string,
  currentTitle: string,
  onTitleChange: (title: string) => void,
): boolean {
  if (session.settled) return false
  session.settled = true
  const nextTitle = draft.trim() || currentTitle
  if (nextTitle !== currentTitle) onTitleChange(nextTitle)
  return true
}
