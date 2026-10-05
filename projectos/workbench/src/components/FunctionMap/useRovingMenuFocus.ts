import { useCallback, useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'

type MenuMoveKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'

export function nextMenuItemIndex(
  itemCount: number,
  activeIndex: number,
  key: MenuMoveKey,
): number {
  if (itemCount <= 0) return -1
  if (key === 'Home') return 0
  if (key === 'End') return itemCount - 1
  if (key === 'ArrowDown') return activeIndex < 0 ? 0 : (activeIndex + 1) % itemCount
  return activeIndex < 0 ? itemCount - 1 : (activeIndex - 1 + itemCount) % itemCount
}

function enabledMenuItems(menu: HTMLElement): HTMLElement[] {
  return Array.from(
    menu.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not([disabled]):not([aria-disabled="true"])',
    ),
  )
}

function focusMenuItem(items: readonly HTMLElement[], activeIndex: number): void {
  items.forEach((item, index) => {
    item.tabIndex = index === activeIndex ? 0 : -1
  })
  items[activeIndex]?.focus()
}

export function useRovingMenuFocus(
  menuRef: RefObject<HTMLElement>,
  open: boolean,
  onClose: () => void,
  restoreFocusTo?: HTMLElement | null,
) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useLayoutEffect(() => {
    if (!open) return
    const restoreTarget =
      restoreFocusTo ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const menu = menuRef.current
    if (menu) focusMenuItem(enabledMenuItems(menu), 0)
    return () => {
      if (restoreTarget?.isConnected) restoreTarget.focus()
    }
  }, [menuRef, open, restoreFocusTo])

  return useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onCloseRef.current()
      return
    }
    if (
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return
    }
    const menu = menuRef.current
    if (!menu) return
    const items = enabledMenuItems(menu)
    const activeIndex = document.activeElement instanceof HTMLElement
      ? items.indexOf(document.activeElement)
      : -1
    const nextIndex = nextMenuItemIndex(items.length, activeIndex, event.key)
    if (nextIndex < 0) return
    event.preventDefault()
    event.stopPropagation()
    focusMenuItem(items, nextIndex)
  }, [menuRef])
}
