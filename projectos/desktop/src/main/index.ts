import { app, BrowserWindow, dialog } from 'electron'
import { createMainWindow } from './createWindow.js'
import { registerProjectOsIpc } from './registerProjectOsIpc.js'
import { registerNotificationIpc } from './registerNotificationIpc.js'
import { registerShellIpc } from './registerShellIpc.js'
import { registerTerminalIpc } from './terminal/registerTerminalIpc.js'
import { registerServicesIpc } from './services/registerServicesIpc.js'
import { registerLspIpc } from './lsp/registerLspIpc.js'
import { installAppMenu } from './registerAppMenu.js'
import { AppQuitCoordinator } from './appQuitCoordinator.js'
import { handleAppStartupFailure } from './appStartupFailure.js'
import { loadDesktopEnvFiles } from './loadDesktopEnv.js'
import { installParentExitGuard } from './parentExitGuard.js'

loadDesktopEnvFiles()
installParentExitGuard()

void app.whenReady().then(() => {
  installAppMenu()
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
