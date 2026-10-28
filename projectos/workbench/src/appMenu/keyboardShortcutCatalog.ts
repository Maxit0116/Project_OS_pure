export interface ShortcutKeyLabels {
  mac: string
  other: string
}

export interface ShortcutCatalogItem {
  id: string
  labelKey: string
  keys: ShortcutKeyLabels
}

export interface ShortcutCatalogGroup {
  id: string
  labelKey: string
  items: ShortcutCatalogItem[]
}

export const KEYBOARD_SHORTCUT_GROUPS: ShortcutCatalogGroup[] = [
  {
    id: 'file',
    labelKey: 'keyboardShortcuts.groups.file',
    items: [
      { id: 'open-folder', labelKey: 'keyboardShortcuts.openFolder', keys: { mac: '⌘O', other: 'Ctrl+O' } },
      { id: 'save', labelKey: 'keyboardShortcuts.save', keys: { mac: '⌘S', other: 'Ctrl+S' } },
      { id: 'close-editor', labelKey: 'keyboardShortcuts.closeEditor', keys: { mac: '⌘W', other: 'Ctrl+W' } },
      { id: 'close-window', labelKey: 'keyboardShortcuts.closeWindow', keys: { mac: '⇧⌘W', other: 'Ctrl+Shift+W' } },
      { id: 'settings', labelKey: 'keyboardShortcuts.openSettings', keys: { mac: '⌘,', other: 'Ctrl+,' } },
    ],
  },
  {
    id: 'edit',
    labelKey: 'keyboardShortcuts.groups.edit',
    items: [
      { id: 'find', labelKey: 'keyboardShortcuts.find', keys: { mac: '⌘F', other: 'Ctrl+F' } },
      { id: 'replace', labelKey: 'keyboardShortcuts.replace', keys: { mac: '⌥⌘F', other: 'Ctrl+Alt+F' } },
    ],
  },
  {
    id: 'view',
    labelKey: 'keyboardShortcuts.groups.view',
    items: [
      { id: 'command-palette', labelKey: 'keyboardShortcuts.commandPalette', keys: { mac: '⌘K', other: 'Ctrl+K' } },
      { id: 'sidebar', labelKey: 'keyboardShortcuts.toggleSidebar', keys: { mac: '⌘B', other: 'Ctrl+B' } },
      { id: 'bottom', labelKey: 'keyboardShortcuts.toggleBottomPanel', keys: { mac: '⌘`', other: 'Ctrl+`' } },
      { id: 'activity', labelKey: 'keyboardShortcuts.activity', keys: { mac: '⇧⌘U', other: 'Ctrl+Shift+U' } },
      { id: 'diagnostics', labelKey: 'keyboardShortcuts.diagnostics', keys: { mac: '⇧⌘M', other: 'Ctrl+Shift+M' } },
      { id: 'split', labelKey: 'keyboardShortcuts.splitEditorRight', keys: { mac: '⌘\\', other: 'Ctrl+\\' } },
    ],
  },
  {
    id: 'go',
    labelKey: 'keyboardShortcuts.groups.go',
    items: [
      { id: 'go-file', labelKey: 'keyboardShortcuts.goToFile', keys: { mac: '⌘P', other: 'Ctrl+P' } },
      { id: 'go-line', labelKey: 'keyboardShortcuts.goToLine', keys: { mac: '⌘G', other: 'Ctrl+G' } },
    ],
  },
  {
    id: 'chat',
    labelKey: 'keyboardShortcuts.groups.chat',
    items: [
      {
        id: 'chat-prev-turn',
        labelKey: 'keyboardShortcuts.previousChatTurn',
        keys: { mac: '⌥↑', other: 'Alt+↑' },
      },
      {
        id: 'chat-next-turn',
        labelKey: 'keyboardShortcuts.nextChatTurn',
        keys: { mac: '⌥↓', other: 'Alt+↓' },
      },
      {
        id: 'chat-latest-turn',
        labelKey: 'keyboardShortcuts.latestChatTurn',
        keys: { mac: '⌥End', other: 'Alt+End' },
      },
    ],
  },
  {
    id: 'terminal',
    labelKey: 'keyboardShortcuts.groups.terminal',
    items: [
      { id: 'new', labelKey: 'keyboardShortcuts.newTerminal', keys: { mac: '⇧⌘`', other: 'Ctrl+Shift+`' } },
      { id: 'previous', labelKey: 'keyboardShortcuts.previousTerminal', keys: { mac: '⌥⌘←', other: 'Ctrl+Alt+Left' } },
      { id: 'next', labelKey: 'keyboardShortcuts.nextTerminal', keys: { mac: '⌥⌘→', other: 'Ctrl+Alt+Right' } },
      { id: 'kill', labelKey: 'keyboardShortcuts.killTerminal', keys: { mac: '⌘⌫', other: 'Ctrl+Backspace' } },
    ],
  },
]

export function usesCommandShortcutGlyph(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac/i.test(navigator.platform) || /Mac/i.test(navigator.userAgent)
}
