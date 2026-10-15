type KeyboardShortcutsListener = (open: boolean) => void

let open = false
const listeners = new Set<KeyboardShortcutsListener>()

export function keyboardShortcutsOpen(): boolean {
  return open
}

export function setKeyboardShortcutsOpen(next: boolean): void {
  if (open === next) return
  open = next
  for (const listener of listeners) listener(open)
}

export function subscribeKeyboardShortcuts(listener: KeyboardShortcutsListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
