export function nextRovingTabIndex(
  key: string,
  currentIndex: number,
  itemCount: number,
): number | undefined {
  if (itemCount <= 0 || currentIndex < 0 || currentIndex >= itemCount) return undefined
  if (key === 'Home') return 0
  if (key === 'End') return itemCount - 1
  if (key === 'ArrowRight' || key === 'ArrowDown') {
    return (currentIndex + 1) % itemCount
  }
  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    return (currentIndex - 1 + itemCount) % itemCount
  }
  return undefined
}

export function focusTabAtIndex(currentTab: HTMLElement, index: number): void {
  const tabList = currentTab.closest('[role="tablist"]')
  const tabs = tabList?.querySelectorAll<HTMLElement>('[role="tab"]')
  tabs?.[index]?.focus()
}
