import { BrowserWindow, ipcMain, powerSaveBlocker } from 'electron'

import { parseKeepAwakeMode, type KeepAwakeStatus } from '../../../contracts/keep-awake.js'
import { assertTrustedHostRenderer } from './ipcSenderTrust.js'
import { resolveUserDataPath } from './paths.js'
import {
  PowerKeepAwakeService,
  createKeepAwakeMarker,
  createPmsetLidSleepGuard,
} from './powerKeepAwake.js'

let service: PowerKeepAwakeService | null = null

function getService(): PowerKeepAwakeService {
  if (!service) {
    const platform = process.platform
    service = new PowerKeepAwakeService({
      platform,
      powerSaveBlocker,
      lidGuard: platform === 'darwin' ? createPmsetLidSleepGuard() : undefined,
      marker: platform === 'darwin' ? createKeepAwakeMarker(resolveUserDataPath()) : undefined,
      onStatusChange: broadcastStatus,
    })
  }
  return service
}

function broadcastStatus(status: KeepAwakeStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    win.webContents.send('keepAwake:status', status)
  }
}

export function getKeepAwakeService(): PowerKeepAwakeService {
  return getService()
}

export function registerKeepAwakeIpc(): void {
  const keepAwake = getService()
  void keepAwake.reconcileOnLaunch().catch((error: unknown) => {
    console.error('[projectos] keep-awake reconcile failed', error)
  })

  ipcMain.handle('keepAwake:getStatus', (event) => {
    assertTrustedHostRenderer(event)
    return getService().getStatus()
  })

  ipcMain.handle('keepAwake:setMode', async (event, input: unknown) => {
    assertTrustedHostRenderer(event)
    const mode = parseKeepAwakeMode(input)
    return getService().setMode(mode)
  })

  ipcMain.handle('keepAwake:setAgentActivity', async (event, input: unknown) => {
    assertTrustedHostRenderer(event)
    if (typeof input !== 'boolean') {
      throw new Error('keepAwake:setAgentActivity expects a boolean')
    }
    return getService().setAgentActivity(input)
  })
}
