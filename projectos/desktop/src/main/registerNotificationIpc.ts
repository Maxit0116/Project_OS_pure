import { BrowserWindow, ipcMain } from 'electron'
import { showDiffReadyNotification, type DiffReadyNotificationPayload } from './notifications.js'
import { assertTrustedHostRenderer } from './ipcSenderTrust.js'
import { parseDiffReadyNotificationPayload } from './ipcArgumentValidation.js'

export function registerNotificationIpc(): void {
  ipcMain.handle('window:isFocused', (event) => {
    assertTrustedHostRenderer(event)
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isFocused() ?? false
  })

  ipcMain.handle('notify:showDiffReady', (event, payload: unknown) => {
    assertTrustedHostRenderer(event)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    showDiffReadyNotification(
      win,
      parseDiffReadyNotificationPayload(payload) satisfies DiffReadyNotificationPayload,
    )
  })
}
