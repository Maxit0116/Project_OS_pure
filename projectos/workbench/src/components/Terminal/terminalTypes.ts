export type TerminalSplitDirection = 'horizontal' | 'vertical'

export interface TerminalTab {
  id: string
  ptyId: string | null
  title: string
  cwd: string
  exited: boolean
  exitCode: number | null
  hasUnread: boolean
  outputBuffer: string
}

export interface TerminalPane {
  id: string
  tabIds: string[]
  activeTabId: string | null
}

export interface TerminalPanelState {
  open: boolean
  splitDirection: TerminalSplitDirection | null
  panes: TerminalPane[]
  tabs: Record<string, TerminalTab>
  focusedPaneId: string
}

export const TERMINAL_OUTPUT_BUFFER_MAX = 32_000

export const DEFAULT_SHELL_TITLE = 'zsh'
