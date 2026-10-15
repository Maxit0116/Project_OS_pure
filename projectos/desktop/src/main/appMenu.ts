import type { AppMenuCommand, AppMenuState } from '../../../contracts/app-menu.js'

export interface AppMenuWindow {
  isDestroyed(): boolean
  close(): void
  webContents: {
    send(channel: string, payload: unknown): void
  }
}

export interface AppMenuActions {
  dispatch(command: AppMenuCommand, window: AppMenuWindow | undefined): void
  closeWindow(window: AppMenuWindow | undefined): void
}

export interface AppMenuTemplateItem {
  id?: string
  label?: string
  role?: string
  type?: 'separator' | 'normal' | 'submenu'
  accelerator?: string
  enabled?: boolean
  submenu?: AppMenuTemplateItem[]
  click?: (menuItem: unknown, window: AppMenuWindow | undefined) => void
}

interface MenuLabels {
  settings: string
  file: string
  openFolder: string
  openRecent: string
  noRecent: string
  save: string
  closeEditor: string
  closeWindow: string
  edit: string
  find: string
  replace: string
  view: string
  commandPalette: string
  toggleSidebar: string
  functionMap: string
  agentFlow: string
  code: string
  toggleBottomPanel: string
  activity: string
  services: string
  diagnostics: string
  splitEditorRight: string
  splitEditorDown: string
  developer: string
  go: string
  goToFile: string
  goToLine: string
  terminal: string
  newTerminal: string
  splitTerminalRight: string
  splitTerminalDown: string
  previousTerminal: string
  nextTerminal: string
  killTerminal: string
  toggleTerminal: string
  window: string
  help: string
  keyboardShortcuts: string
}

const EN_LABELS: MenuLabels = {
  settings: 'Settings',
  file: 'File',
  openFolder: 'Open Folder…',
  openRecent: 'Open Recent',
  noRecent: 'No Recent Projects',
  save: 'Save',
  closeEditor: 'Close Editor',
  closeWindow: 'Close Window',
  edit: 'Edit',
  find: 'Find',
  replace: 'Replace',
  view: 'View',
  commandPalette: 'Command Palette',
  toggleSidebar: 'Toggle Left Sidebar',
  functionMap: 'Function Map',
  agentFlow: 'Agent Flow',
  code: 'Code',
  toggleBottomPanel: 'Toggle Bottom Panel',
  activity: 'Activity',
  services: 'Services',
  diagnostics: 'Diagnostics',
  splitEditorRight: 'Split Editor Right',
  splitEditorDown: 'Split Editor Down',
  developer: 'Developer',
  go: 'Go',
  goToFile: 'Go to File',
  goToLine: 'Go to Line',
  terminal: 'Terminal',
  newTerminal: 'New Terminal',
  splitTerminalRight: 'Split Right',
  splitTerminalDown: 'Split Down',
  previousTerminal: 'Previous Terminal',
  nextTerminal: 'Next Terminal',
  killTerminal: 'Kill Terminal',
  toggleTerminal: 'Toggle Terminal',
  window: 'Window',
  help: 'Help',
  keyboardShortcuts: 'Keyboard Shortcuts',
}

const ZH_LABELS: MenuLabels = {
  settings: '设置',
  file: '文件',
  openFolder: '打开文件夹…',
  openRecent: '打开最近的项目',
  noRecent: '没有最近的项目',
  save: '保存',
  closeEditor: '关闭编辑器',
  closeWindow: '关闭窗口',
  edit: '编辑',
  find: '查找',
  replace: '替换',
  view: '显示',
  commandPalette: '命令面板',
  toggleSidebar: '切换左侧栏',
  functionMap: '功能地图',
  agentFlow: 'Agent 流程',
  code: '代码',
  toggleBottomPanel: '切换底部面板',
  activity: '活动',
  services: '服务',
  diagnostics: '诊断',
  splitEditorRight: '向右拆分编辑器',
  splitEditorDown: '向下拆分编辑器',
  developer: '开发者',
  go: '前往',
  goToFile: '转到文件',
  goToLine: '转到行',
  terminal: '终端',
  newTerminal: '新建终端',
  splitTerminalRight: '向右分屏',
  splitTerminalDown: '向下分屏',
  previousTerminal: '上一个终端',
  nextTerminal: '下一个终端',
  killTerminal: '关闭当前终端',
  toggleTerminal: '显示/隐藏终端',
  window: '窗口',
  help: '帮助',
  keyboardShortcuts: '键盘快捷键',
}

export function initialAppMenuState(systemLocale: string): AppMenuState {
  return {
    locale: systemLocale.toLowerCase().startsWith('zh') ? 'zh' : 'en',
    recentWorkspaces: [],
    workspaceOpen: false,
    hasActiveEditor: false,
  }
}

export function buildAppMenuTemplate(
  state: AppMenuState,
  appName: string,
  platform: NodeJS.Platform,
  actions: AppMenuActions,
): AppMenuTemplateItem[] {
  const labels = state.locale === 'zh' ? ZH_LABELS : EN_LABELS
  const isMac = platform === 'darwin'
  const workspaceOpen = state.workspaceOpen
  const hasEditor = state.workspaceOpen && state.hasActiveEditor

  const recentSubmenu: AppMenuTemplateItem[] = state.recentWorkspaces.length === 0
    ? [{ label: labels.noRecent, enabled: false }]
    : state.recentWorkspaces.map((item) => ({
        label: menuLabel(item.name),
        click: (_menuItem, window) => {
          actions.dispatch({ id: 'open-recent', path: item.path }, window)
        },
      }))

  return [
    ...(isMac
      ? [
          {
            label: appName,
            submenu: [
              { role: 'about' },
              { type: 'separator' as const },
              commandItem('app.settings', labels.settings, 'CmdOrCtrl+,', workspaceOpen, actions, {
                id: 'open-settings',
              }),
              { type: 'separator' as const },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' as const },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      id: 'menu.file',
      label: labels.file,
      submenu: [
        commandItem('file.openFolder', labels.openFolder, 'CmdOrCtrl+O', true, actions, {
          id: 'open-folder',
        }),
        {
          id: 'file.openRecent',
          label: labels.openRecent,
          submenu: recentSubmenu,
        },
        ...(isMac
          ? []
          : [
              { type: 'separator' as const },
              commandItem('file.settings', labels.settings, 'CmdOrCtrl+,', workspaceOpen, actions, {
                id: 'open-settings',
              }),
            ]),
        { type: 'separator' },
        commandItem('file.save', labels.save, 'CmdOrCtrl+S', hasEditor, actions, { id: 'save' }),
        { type: 'separator' },
        commandItem('file.closeEditor', labels.closeEditor, 'CmdOrCtrl+W', hasEditor, actions, {
          id: 'close-editor',
        }),
        {
          id: 'file.closeWindow',
          label: labels.closeWindow,
          accelerator: 'CmdOrCtrl+Shift+W',
          click: (_menuItem, window) => actions.closeWindow(window),
        },
        ...(isMac
          ? []
          : [
              { type: 'separator' as const },
              { role: 'quit' },
            ]),
      ],
    },
    {
      id: 'menu.edit',
      label: labels.edit,
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        commandItem('edit.find', labels.find, 'CmdOrCtrl+F', hasEditor, actions, { id: 'find' }),
        commandItem('edit.replace', labels.replace, 'Alt+CmdOrCtrl+F', hasEditor, actions, {
          id: 'replace',
        }),
      ],
    },
    {
      id: 'menu.view',
      label: labels.view,
      submenu: [
        commandItem(
          'view.commandPalette',
          labels.commandPalette,
          'CmdOrCtrl+K',
          true,
          actions,
          { id: 'command-palette' },
        ),
        { type: 'separator' },
        commandItem(
          'view.toggleSidebar',
          labels.toggleSidebar,
          'CmdOrCtrl+B',
          workspaceOpen,
          actions,
          { id: 'toggle-left-panel' },
        ),
        commandItem('view.functionMap', labels.functionMap, undefined, workspaceOpen, actions, {
          id: 'show-function-map',
        }),
        commandItem('view.agentFlow', labels.agentFlow, undefined, workspaceOpen, actions, {
          id: 'show-agent-flow',
        }),
        commandItem('view.code', labels.code, undefined, workspaceOpen, actions, { id: 'show-code' }),
        { type: 'separator' },
        commandItem(
          'view.toggleBottomPanel',
          labels.toggleBottomPanel,
          'CmdOrCtrl+`',
          workspaceOpen,
          actions,
          { id: 'toggle-bottom-panel' },
        ),
        commandItem('view.activity', labels.activity, 'Shift+CmdOrCtrl+U', workspaceOpen, actions, {
          id: 'show-activity',
        }),
        commandItem('view.services', labels.services, undefined, workspaceOpen, actions, {
          id: 'show-services',
        }),
        commandItem(
          'view.diagnostics',
          labels.diagnostics,
          'Shift+CmdOrCtrl+M',
          workspaceOpen,
          actions,
          { id: 'show-diagnostics' },
        ),
        { type: 'separator' },
        commandItem(
          'view.splitRight',
          labels.splitEditorRight,
          'CmdOrCtrl+\\',
          hasEditor,
          actions,
          { id: 'split-editor-right' },
        ),
        commandItem(
          'view.splitDown',
          labels.splitEditorDown,
          undefined,
          hasEditor,
          actions,
          { id: 'split-editor-down' },
        ),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          id: 'view.developer',
          label: labels.developer,
          submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
          ],
        },
      ],
    },
    {
      id: 'menu.go',
      label: labels.go,
      submenu: [
        commandItem('go.file', labels.goToFile, 'CmdOrCtrl+P', workspaceOpen, actions, {
          id: 'go-to-file',
        }),
        commandItem('go.line', labels.goToLine, 'CmdOrCtrl+G', hasEditor, actions, {
          id: 'go-to-line',
        }),
      ],
    },
    {
      id: 'menu.terminal',
      label: labels.terminal,
      submenu: [
        commandItem(
          'terminal.new',
          labels.newTerminal,
          'Shift+CmdOrCtrl+`',
          workspaceOpen,
          actions,
          { id: 'terminal-new' },
        ),
        commandItem(
          'terminal.splitRight',
          labels.splitTerminalRight,
          undefined,
          workspaceOpen,
          actions,
          { id: 'terminal-split-right' },
        ),
        commandItem(
          'terminal.splitDown',
          labels.splitTerminalDown,
          undefined,
          workspaceOpen,
          actions,
          { id: 'terminal-split-down' },
        ),
        { type: 'separator' },
        commandItem(
          'terminal.previous',
          labels.previousTerminal,
          'Alt+CmdOrCtrl+Left',
          workspaceOpen,
          actions,
          { id: 'terminal-previous' },
        ),
        commandItem(
          'terminal.next',
          labels.nextTerminal,
          'Alt+CmdOrCtrl+Right',
          workspaceOpen,
          actions,
          { id: 'terminal-next' },
        ),
        { type: 'separator' },
        commandItem('terminal.kill', labels.killTerminal, undefined, workspaceOpen, actions, {
          id: 'terminal-kill',
        }),
        { type: 'separator' },
        commandItem(
          'terminal.toggle',
          labels.toggleTerminal,
          undefined,
          workspaceOpen,
          actions,
          { id: 'toggle-bottom-panel' },
        ),
      ],
    },
    {
      id: 'menu.window',
      label: labels.window,
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        {
          id: 'window.close',
          label: labels.closeWindow,
          click: (_menuItem, window) => actions.closeWindow(window),
        },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' },
            ]
          : []),
      ],
    },
    {
      id: 'menu.help',
      label: labels.help,
      submenu: [
        commandItem(
          'help.shortcuts',
          labels.keyboardShortcuts,
          undefined,
          true,
          actions,
          { id: 'show-keyboard-shortcuts' },
        ),
      ],
    },
  ]
}

function commandItem(
  id: string,
  label: string,
  accelerator: string | undefined,
  enabled: boolean,
  actions: AppMenuActions,
  command: AppMenuCommand,
): AppMenuTemplateItem {
  return {
    id,
    label,
    ...(accelerator ? { accelerator } : {}),
    enabled,
    click: (_menuItem, window) => actions.dispatch(command, window),
  }
}

function menuLabel(value: string): string {
  return value.replace(/&/g, '&&').replace(/[\r\n]/g, ' ')
}
