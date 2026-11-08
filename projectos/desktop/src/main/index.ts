import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { app, BrowserWindow, dialog } from 'electron'
import { applyIsolatedUserDataPath } from './applyIsolatedUserDataPath.js'
import { createMainWindow } from './createWindow.js'
import { registerProjectOsIpc } from './registerProjectOsIpc.js'
import { registerNotificationIpc } from './registerNotificationIpc.js'
import { getKeepAwakeService, registerKeepAwakeIpc } from './registerKeepAwakeIpc.js'
import { registerShellIpc } from './registerShellIpc.js'
import { registerTerminalIpc } from './terminal/registerTerminalIpc.js'
import { registerServicesIpc } from './services/registerServicesIpc.js'
import { registerLspIpc } from './lsp/registerLspIpc.js'
import { installAppMenu } from './registerAppMenu.js'
import { registerWorkspaceWindowIpc } from './registerWorkspaceWindowIpc.js'
import { AppQuitCoordinator } from './appQuitCoordinator.js'
import { handleAppStartupFailure } from './appStartupFailure.js'
import { loadDesktopEnvFiles } from './loadDesktopEnv.js'
import { installParentExitGuard } from './parentExitGuard.js'
import {
  registerSpatialPinOverlay,
  unregisterSpatialPinOverlayShortcuts,
} from './registerSpatialPinOverlay.js'
import { startSpatialPinBridge, stopSpatialPinBridge } from './spatialPinBridge.js'

loadDesktopEnvFiles()
// Must run before ready / any Chromium persistence so FileSecretStore and
// session paths cannot silently fall back to the daily profile.
const isolation = applyIsolatedUserDataPath(app)
if (isolation.abortBootstrap) {
  // app.exit was already requested; do not register IPC, windows, or quit hooks.
  console.error('[projectos] Aborting desktop bootstrap after isolation failure')
} else {
installParentExitGuard()

function resolveInitialWorkspacePath(): string | undefined {
  const fromEnv = process.env.PROJECTOS_INITIAL_WORKSPACE?.trim()
  if (!fromEnv) return undefined
  const absolute = resolve(fromEnv)
  return existsSync(absolute) ? absolute : undefined
}

void app.whenReady().then(() => {
  installAppMenu()
  registerWorkspaceWindowIpc()
  registerProjectOsIpc()
  registerNotificationIpc()
  registerKeepAwakeIpc()
  registerShellIpc()
  registerTerminalIpc()
  registerServicesIpc()
  registerLspIpc()
  registerSpatialPinOverlay()
  startSpatialPinBridge()
  createMainWindow(resolveInitialWorkspacePath())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(resolveInitialWorkspacePath())
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
  {
    deactivate: async () => {
      await getKeepAwakeService().deactivate()
    },
    stopSync: () => {
      getKeepAwakeService().stopSync()
    },
  },
  {
    onCleanupFailure: (error) => {
      console.error('[projectos] App-exit cleanup did not complete cleanly', error)
    },
  },
)

app.on('before-quit', (event) => {
  unregisterSpatialPinOverlayShortcuts()
  stopSpatialPinBridge()
  quitCoordinator.handleBeforeQuit(event)
})
}
