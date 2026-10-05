import { app, BrowserWindow, dialog, Menu } from 'electron'
import { createMainWindow } from './createWindow.js'
import { registerProjectOsIpc } from './registerProjectOsIpc.js'
import { registerNotificationIpc } from './registerNotificationIpc.js'
import { registerShellIpc } from './registerShellIpc.js'
import { registerTerminalIpc } from './terminal/registerTerminalIpc.js'
import { registerServicesIpc } from './services/registerServicesIpc.js'
import { registerLspIpc } from './lsp/registerLspIpc.js'
import { AppQuitCoordinator } from './appQuitCoordinator.js'
import { handleAppStartupFailure } from './appStartupFailure.js'
import { loadDesktopEnvFiles } from './loadDesktopEnv.js'
import { installParentExitGuard } from './parentExitGuard.js'

loadDesktopEnvFiles()
installParentExitGuard()

function buildAppMenu(): Menu {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : []),
      ],
    },
  ]
  return Menu.buildFromTemplate(template)
}

void app.whenReady().then(() => {
  Menu.setApplicationMenu(buildAppMenu())
  registerProjectOsIpc()
  registerNotificationIpc()
  registerShellIpc()
  registerTerminalIpc()
  registerServicesIpc()
  registerLspIpc()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
}).catch((error: unknown) => {
  handleAppStartupFailure(error, {
    showErrorBox: (title, content) => dialog.showErrorBox(title, content),
    quit: () => app.quit(),
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

const quitCoordinator = new AppQuitCoordinator(
  {
    quit: () => app.quit(),
    exit: (exitCode) => app.exit(exitCode),
  },
  {},
  {
    onCleanupFailure: (error) => {
      console.error('[projectos] App-exit cleanup did not complete cleanly', error)
    },
  },
)

app.on('before-quit', (event) => {
  quitCoordinator.handleBeforeQuit(event)
})
