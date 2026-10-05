export interface FocusTarget {
  focus(): void
}

export function trapDialogTab(
  focusable: readonly FocusTarget[],
  activeElement: FocusTarget | null,
  shiftKey: boolean,
): boolean {
  if (focusable.length === 0) return false
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const activeIndex = activeElement ? focusable.indexOf(activeElement) : -1

  if (shiftKey && (activeIndex <= 0)) {
    last.focus()
    return true
  }
  if (!shiftKey && (activeIndex < 0 || activeIndex === focusable.length - 1)) {
    first.focus()
    return true
  }
  return false
}
