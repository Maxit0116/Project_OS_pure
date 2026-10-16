import { BrowserWindow, ipcMain } from 'electron'
import { assertTrustedHostRenderer } from './ipcSenderTrust.js'
import { createMainWindow } from './createWindow.js'
import {
  canonicalWorkspacePath,
  findWindowIdForWorkspace,
  initialWorkspacePath,
} from './workspaceWindowRegistry.js'

const NEW_WINDOW_OFFSET = 28

export function registerWorkspaceWindowIpc(): void {
  ipcMain.handle('window:initialWorkspace', (event) => {
    assertTrustedHostRenderer(event)
    return initialWorkspacePath(event.sender.id)
  })

  ipcMain.handle('window:openWorkspaceInNewWindow', (event, input: unknown) => {
    assertTrustedHostRenderer(event)
    if (typeof input !== 'string') return
    const path = canonicalWorkspacePath(input)
    if (!path) return

    const windows = BrowserWindow.getAllWindows().flatMap((win) => {
      if (win.isDestroyed()) return []
      return [{ id: win.webContents.id, destroyed: false, win }]
    })
    const existingId = findWindowIdForWorkspace(path, windows)
    if (existingId !== null) {
      const existing = windows.find((item) => item.id === existingId)?.win
      existing?.show()
      existing?.focus()
      return
    }

    const created = createMainWindow(path)
    const source = BrowserWindow.fromWebContents(event.sender)
    if (source && !source.isDestroyed()) {
      const [x, y] = source.getPosition()
      created.setPosition(x + NEW_WINDOW_OFFSET, y + NEW_WINDOW_OFFSET)
    }
  })
}
