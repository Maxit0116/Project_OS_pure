import { ipcMain } from 'electron'
import { portWatcher } from './portWatcher.js'

export function registerServicesIpc(): void {
  ipcMain.handle('services:startWatch', (event) => {
    portWatcher.startWatching(event.sender)
  })

  ipcMain.handle('services:stopWatch', (event) => {
    portWatcher.stopWatching(event.sender.id)
  })

  ipcMain.handle(
    'services:register',
    (event, input: { port: number; host?: string; label?: string }) => {
      return portWatcher.register(event.sender, input)
    },
  )

  ipcMain.handle('services:unregister', (event, id: string) => {
    portWatcher.unregister(event.sender, id)
  })
}

export function disposeServicesForWebContents(webContentsId: number): void {
  portWatcher.stopWatching(webContentsId)
}
