import type { AppMenuCommand } from '@contracts/app-menu'
import { getActiveEditorFilePath } from '../components/CodeEditor/editorPaneHelpers'
import { scheduleEditorCommand } from '../components/CodeEditor/editorNavigation'
import { normalizeRecentWorkspacePath } from '../state/recentWorkspaces'
import { isDesktopApp } from '../data/clientMode'
import { useBottomDockStore } from '../state/bottomDockStore'
import { useTerminalStore } from '../state/terminalStore'
import { useChatSessionStore } from '../state/chatSessionStore'
import { useWorkbenchStore } from '../state/workbenchStore'
import { dispatchCommandPalette } from './commandPaletteController'
import { setKeyboardShortcutsOpen } from './keyboardShortcutsController'

const DUPLICATE_WINDOW_MS = 80

const EDITOR_COMMAND_IDS = {
  find: 'actions.find',
  replace: 'editor.action.startFindReplaceAction',
  'go-to-line': 'editor.action.gotoLine',
} as const

let lastCommand: { key: string; at: number } | null = null

export interface MenuKeyEvent {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing?: boolean
  repeat?: boolean
}

export function resetAppMenuCommandGuardForTests(): void {
  lastCommand = null
}

export function commandFromKeyEvent(event: MenuKeyEvent): AppMenuCommand | null {
  if (event.isComposing || event.repeat) return null
  if (!event.metaKey && !event.ctrlKey) return null

  if (isBackquote(event)) {
    if (event.altKey) return null
    return { id: event.shiftKey ? 'terminal-new' : 'toggle-bottom-panel' }
  }

  if (event.altKey && isArrow(event, 'ArrowRight')) return { id: 'terminal-next' }
  if (event.altKey && isArrow(event, 'ArrowLeft')) return { id: 'terminal-previous' }
  if (event.altKey && !event.shiftKey && isKey(event, 'KeyF', 'f')) return { id: 'replace' }
  if (event.shiftKey && !event.altKey && isKey(event, 'KeyU', 'u')) return { id: 'show-activity' }
  if (event.shiftKey && !event.altKey && isKey(event, 'KeyM', 'm')) return { id: 'show-diagnostics' }
  if (event.shiftKey || event.altKey) return null

  if (isKey(event, 'Comma', ',') || event.key === ',') return { id: 'open-settings' }
  if (isKey(event, 'KeyO', 'o')) return { id: 'open-folder' }
  if (isKey(event, 'KeyS', 's')) return { id: 'save' }
  if (isKey(event, 'KeyW', 'w')) return { id: 'close-editor' }
  if (isKey(event, 'KeyK', 'k')) return { id: 'command-palette' }
  if (event.shiftKey && isKey(event, 'KeyP', 'p')) return { id: 'spatial-pin' }
  if (isKey(event, 'KeyP', 'p')) return { id: 'go-to-file' }
  if (isKey(event, 'KeyB', 'b')) return { id: 'toggle-left-panel' }
  if (isKey(event, 'KeyF', 'f')) return { id: 'find' }
  if (isKey(event, 'KeyG', 'g')) return { id: 'go-to-line' }
  if (isKey(event, 'Backslash', '\\')) return { id: 'split-editor-right' }
  return null
}

export function workspaceWindowTarget(
  currentPath: string | null | undefined,
  nextPath: string,
): 'current' | 'same' | 'new' {
  const next = normalizeRecentWorkspacePath(nextPath)
  if (!next) return 'current'
  const current = currentPath ? normalizeRecentWorkspacePath(currentPath) : ''
  if (!current) return 'current'
  if (current === next) return 'same'
  return 'new'
}

export function executeAppMenuCommand(command: AppMenuCommand): void {
  const key = command.id === 'open-recent' ? `open-recent:${command.path}` : command.id
  const now = Date.now()
  if (lastCommand && lastCommand.key === key && now - lastCommand.at < DUPLICATE_WINDOW_MS) return
  lastCommand = { key, at: now }

  switch (command.id) {
    case 'open-settings':
      if (!workspaceReady()) return
      useWorkbenchStore.getState().setSettingsOpen(true)
      return
    case 'open-folder':
      void openFolder()
      return
    case 'open-recent':
      void openWorkspaceFromMenu(command.path)
      return
    case 'save':
      saveActiveEditor()
      return
    case 'close-editor':
      closeActiveEditor()
      return
    case 'command-palette':
      dispatchCommandPalette('toggle')
      return
    case 'go-to-file':
      if (!workspaceReady()) return
      dispatchCommandPalette('open-files')
      return
    case 'toggle-left-panel': {
      if (!workspaceReady()) return
      const { leftPanelOpen, setLeftPanelOpen } = useWorkbenchStore.getState()
      setLeftPanelOpen(!leftPanelOpen)
      return
    }
    case 'show-function-map':
      if (!workspaceReady()) return
      useWorkbenchStore.getState().setCenterTab('function-map')
      return
    case 'show-agent-flow':
      if (!workspaceReady()) return
      useChatSessionStore.getState().presentAgentFlow()
      return
    case 'show-code':
      if (!workspaceReady()) return
      useWorkbenchStore.getState().setCenterTab('code')
      return
    case 'toggle-bottom-panel':
      if (!workspaceReady()) return
      useBottomDockStore.getState().togglePanel()
      return
    case 'show-activity':
      if (!workspaceReady()) return
      useBottomDockStore.getState().setActiveView('activity')
      return
    case 'show-services':
      if (!workspaceReady()) return
      useBottomDockStore.getState().setActiveView('services')
      return
    case 'show-diagnostics':
      if (!workspaceReady()) return
      useBottomDockStore.getState().setActiveView('diagnostics')
      return
    case 'split-editor-right':
      splitEditor('horizontal')
      return
    case 'split-editor-down':
      splitEditor('vertical')
      return
    case 'find':
      runEditorMenuAction(EDITOR_COMMAND_IDS.find)
      return
    case 'replace':
      runEditorMenuAction(EDITOR_COMMAND_IDS.replace)
      return
    case 'go-to-line':
      runEditorMenuAction(EDITOR_COMMAND_IDS['go-to-line'])
      return
    case 'terminal-new': {
      if (!workspaceReady()) return
      const hadTabs = useTerminalStore.getState().panes.some((pane) => pane.tabIds.length > 0)
      useBottomDockStore.getState().openPanel('terminal')
      if (hadTabs) void useTerminalStore.getState().createTab()
      return
    }
    case 'terminal-kill':
      if (!workspaceReady()) return
      void useTerminalStore.getState().killActiveTab()
      return
    case 'terminal-split-right':
      if (!workspaceReady() || !isDesktopApp()) return
      void useTerminalStore.getState().splitTerminal('horizontal')
      return
    case 'terminal-split-down':
      if (!workspaceReady() || !isDesktopApp()) return
      void useTerminalStore.getState().splitTerminal('vertical')
      return
    case 'terminal-next':
      if (!workspaceReady()) return
      useTerminalStore.getState().cycleActiveTab(1)
      return
    case 'terminal-previous':
      if (!workspaceReady()) return
      useTerminalStore.getState().cycleActiveTab(-1)
      return
    case 'show-keyboard-shortcuts':
      setKeyboardShortcutsOpen(true)
      return
    case 'spatial-pin':
      if (!isDesktopApp()) return
      void window.projectOS?.spatialPin.beginCapture()
      return
    default: {
      const unreachable: never = command
      return unreachable
    }
  }
}

function workspaceReady(): boolean {
  return useWorkbenchStore.getState().phase === 'ready'
}

function activeEditorPath(): string | null {
  if (!workspaceReady()) return null
  return getActiveEditorFilePath(useWorkbenchStore.getState())
}

function saveActiveEditor(): void {
  const filePath = activeEditorPath()
  if (!filePath) return
  const state = useWorkbenchStore.getState()
  if (!state.isEditorDirty(filePath)) return
  void state.saveEditorFile(filePath)
}

function closeActiveEditor(): void {
  const filePath = activeEditorPath()
  if (!filePath) return
  useWorkbenchStore.getState().closeEditorFile(filePath)
}

function splitEditor(direction: 'horizontal' | 'vertical'): void {
  if (!activeEditorPath()) return
  const state = useWorkbenchStore.getState()
  state.setCenterTab('code')
  state.splitEditor(direction)
}

function runEditorMenuAction(commandId: string): void {
  const filePath = activeEditorPath()
  if (!filePath) return
  const state = useWorkbenchStore.getState()
  if (state.markdownEditorViewModes[filePath] === 'preview') {
    state.setMarkdownEditorViewMode(filePath, 'source')
  }
  state.setCenterTab('code')
  if (typeof window === 'undefined') return
  scheduleEditorCommand(filePath, commandId)
}

async function openFolder(): Promise<void> {
  const bridge = typeof window === 'undefined' ? undefined : window.projectOS
  if (!bridge?.shell.pickWorkspaceFolder) return
  const picked = await bridge.shell.pickWorkspaceFolder()
  if (!picked) return
  await openWorkspaceFromMenu(picked)
}

async function openWorkspaceFromMenu(path: string): Promise<void> {
  const current = useWorkbenchStore.getState().project?.workspaceRoot
  const target = workspaceWindowTarget(current, path)
  if (target === 'same') return
  if (target === 'new' && window.projectOS?.window.openWorkspaceInNewWindow) {
    await window.projectOS.window.openWorkspaceInNewWindow(path)
    return
  }
  await useWorkbenchStore.getState().openWorkspace(path)
}

function isBackquote(event: MenuKeyEvent): boolean {
  return event.code === 'Backquote' || event.key === '`'
}

function isArrow(event: MenuKeyEvent, key: 'ArrowLeft' | 'ArrowRight'): boolean {
  return event.code === key || event.key === key
}

function isKey(event: MenuKeyEvent, code: string, key: string): boolean {
  if (event.code) return event.code === code
  return event.key.toLowerCase() === key
}
