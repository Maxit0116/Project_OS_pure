export function nextTreeRowIndex(
  key: string,
  currentIndex: number,
  rowCount: number,
): number | undefined {
  if (rowCount <= 0 || currentIndex < 0 || currentIndex >= rowCount) return undefined
  if (key === 'ArrowDown') return Math.min(currentIndex + 1, rowCount - 1)
  if (key === 'ArrowUp') return Math.max(currentIndex - 1, 0)
  if (key === 'Home') return 0
  if (key === 'End') return rowCount - 1
  return undefined
}

export function moveTreeRowFocus(
  currentRow: HTMLElement,
  key: string,
  onFocusedRow: (rowId: string) => void,
): boolean {
  const tree = currentRow.closest('[role="tree"]')
  const rows = tree?.querySelectorAll<HTMLElement>('[data-tree-row-id]')
  if (!rows) return false
  const currentIndex = Array.from(rows).indexOf(currentRow)
  const nextIndex = nextTreeRowIndex(key, currentIndex, rows.length)
  if (nextIndex === undefined || nextIndex === currentIndex) return false
  const target = rows[nextIndex]
  const rowId = target?.dataset['treeRowId']
  if (!target || !rowId) return false
  onFocusedRow(rowId)
  target.focus()
  return true
}
