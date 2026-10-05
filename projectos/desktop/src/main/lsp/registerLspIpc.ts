import { ipcMain } from 'electron'
import { languageServerManager } from './languageServerManager.js'

export function registerLspIpc(): void {
  ipcMain.handle('lsp:start', (event, workspaceRoot: string) => {
    return languageServerManager.start(event.sender, workspaceRoot)
  })

  ipcMain.handle('lsp:stop', (event) => {
    languageServerManager.stop(event.sender.id)
  })

  ipcMain.on('lsp:send', (event, message: string) => {
    languageServerManager.send(event.sender.id, message)
  })
}

export function disposeLspForWebContents(webContentsId: number): void {
  languageServerManager.stop(webContentsId)
}
