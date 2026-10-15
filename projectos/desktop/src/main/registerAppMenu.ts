import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import { parseAppMenuState, type AppMenuCommand } from '../../../contracts/app-menu.js'
import { buildAppMenuTemplate, initialAppMenuState } from './appMenu.js'
import {
  assertTrustedHostRenderer,
  isActiveTrustedHostWebContents,
} from './ipcSenderTrust.js'

let menuState = initialAppMenuState('en')

export function installAppMenu(): void {
  menuState = initialAppMenuState(app.getLocale())
  ipcMain.on('menu:setState', (event, input: unknown) => {
    assertTrustedHostRenderer(event)
    const next = parseAppMenuState(input)
    if (!next) return
    menuState = next
    publishAppMenu()
  })
  publishAppMenu()
}

function publishAppMenu(): void {
  const template = buildAppMenuTemplate(menuState, app.name, process.platform, {
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
