import { Notification, app, type BrowserWindow } from 'electron'

export type DiffReadyNotificationPayload = {
  title: string
  body: string
  destination: 'ask' | 'diff'
  runIds: string[]
}

export function showDiffReadyNotification(
  win: BrowserWindow,
  payload: DiffReadyNotificationPayload,
) {
  if (!Notification.isSupported()) {
    console.warn('[desktop] system notifications are not supported; skipping diff-ready alert')
    return
  }

  const notification = new Notification({
    title: payload.title,
    body: payload.body,
    silent: false,
  })

  notification.on('click', () => {
    if (win.isDestroyed()) return
    if (win.isMinimized()) {
      win.restore()
    }
    if (!win.isVisible()) {
      win.show()
    }
    if (process.platform === 'darwin') {
      app.focus({ steal: true })
    } else {
      app.focus()
    }
    win.show()
    win.focus()
    if (!win.webContents.isDestroyed()) {
      win.webContents.send('notify:diffReadyActivated', {
        destination: payload.destination,
        runIds: payload.runIds,
      })
    }
  })

  notification.on('failed', (_event, error) => {
    console.error('[desktop] failed to deliver diff-ready system notification', error)
  })

  notification.show()
}
