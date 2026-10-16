import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import { parseAppMenuState, type AppMenuCommand, type AppMenuState } from '../../../contracts/app-menu.js'
import { buildAppMenuTemplate, initialAppMenuState } from './appMenu.js'
import {
  assertTrustedHostRenderer,
  isActiveTrustedHostWebContents,
} from './ipcSenderTrust.js'
import { forgetWorkspaceWindow, rememberWorkspacePath } from './workspaceWindowRegistry.js'

const menuStateByWindow = new Map<number, AppMenuState>()
let fallbackMenuState = initialAppMenuState('en')

export function installAppMenu(): void {
  fallbackMenuState = initialAppMenuState(app.getLocale())
  ipcMain.on('menu:setState', (event, input: unknown) => {
    assertTrustedHostRenderer(event)
    const next = parseAppMenuState(input)
    if (!next) return
    menuStateByWindow.set(event.sender.id, next)
    rememberWorkspacePath(event.sender.id, next.workspacePath)
    fallbackMenuState = next
    publishAppMenu()
  })
  app.on('browser-window-focus', () => {
    publishAppMenu()
  })
  app.on('browser-window-created', (_event, win) => {
    const webContentsId = win.webContents.id
    win.on('closed', () => {
      menuStateByWindow.delete(webContentsId)
      forgetWorkspaceWindow(webContentsId)
      publishAppMenu()
    })
  })
  publishAppMenu()
}

function publishAppMenu(): void {
  const template = buildAppMenuTemplate(menuStateForFocusedWindow(), app.name, process.platform, {
    dispatch(command, window) {
      deliverMenuCommand(asBrowserWindow(window), command)
    },
    closeWindow(window) {
      const target = asBrowserWindow(window) ?? BrowserWindow.getAllWindows().find((item) => !item.isDestroyed())
      target?.close()
    },
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template as Electron.MenuItemConstructorOptions[]))
}

function menuStateForFocusedWindow(): AppMenuState {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed()) {
    const state = menuStateByWindow.get(focused.webContents.id)
    if (state) return state
  }
  return fallbackMenuState
}

function deliverMenuCommand(preferred: BrowserWindow | undefined, command: AppMenuCommand): void {
  const target = preferred && !preferred.isDestroyed()
    ? preferred
    : BrowserWindow.getAllWindows().find((item) => !item.isDestroyed())
  if (!target || !isActiveTrustedHostWebContents(target.webContents)) return
  target.webContents.send('menu:command', command)
}

function asBrowserWindow(window: { isDestroyed(): boolean } | undefined): BrowserWindow | undefined {
  if (!window || window.isDestroyed()) return undefined
  return window as BrowserWindow
}
