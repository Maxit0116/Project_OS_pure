import { BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron'
import { basename, extname } from 'node:path'
import { closeSync, fstatSync, openSync, readSync } from 'node:fs'

import { MAP_IMAGE_MAX_BYTES } from '../../../contracts/map-content.js'
import { assertAllowedExternalUrl } from './externalUrlPolicy.js'
import { assertTrustedHostRenderer } from './ipcSenderTrust.js'
import { parseWindowTitle } from './ipcArgumentValidation.js'

export function registerShellIpc(): void {
  ipcMain.handle('shell:pickWorkspaceFolder', async (event) => {
    assertTrustedHostRenderer(event)
    const parent = BrowserWindow.fromWebContents(event.sender)
    const result = parent
      ? await dialog.showOpenDialog(parent, {
          properties: ['openDirectory'],
          title: 'Open Project Workspace',
          buttonLabel: 'Open',
        })
      : await dialog.showOpenDialog({
          properties: ['openDirectory'],
          title: 'Open Project Workspace',
          buttonLabel: 'Open',
        })
    if (result.canceled || !result.filePaths[0]) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle('shell:pickImageFile', async (event) => {
    assertTrustedHostRenderer(event)
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Select Image',
      buttonLabel: 'Open',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }],
    })
    if (result.canceled || !result.filePaths[0]) {
      return null
    }

    return readUserPickedImage(result.filePaths[0])
  })

  ipcMain.handle('shell:openExternal', async (event, input: unknown) => {
    assertTrustedHostRenderer(event)
    const url = assertAllowedExternalUrl(input)
    await shell.openExternal(url).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown OS error'
      throw new Error(`Failed to open external URL: ${message}`)
    })
  })

  ipcMain.handle('window:isFullScreen', (event) => {
    assertTrustedHostRenderer(event)
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isFullScreen() ?? false
  })

  ipcMain.handle('window:setTitle', (event, title: unknown) => {
    assertTrustedHostRenderer(event)
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.setTitle(parseWindowTitle(title))
  })
}

function readUserPickedImage(absolutePath: string):
  | {
      dataUrl: string
      fileName: string
      mimeType: 'image/jpeg' | 'image/png'
      width: number
      height: number
    }
  | { error: 'invalid_type' | 'too_large' | 'failed' } {
  const fileName = basename(absolutePath)
  const ext = extname(absolutePath).toLowerCase()
  if (ext !== '.jpg' && ext !== '.jpeg' && ext !== '.png') {
    return { error: 'invalid_type' }
  }

  let descriptor: number | undefined
  try {
    descriptor = openSync(absolutePath, 'r')
    const before = fstatSync(descriptor)
    if (!before.isFile()) return { error: 'failed' }
    if (before.size > MAP_IMAGE_MAX_BYTES) return { error: 'too_large' }

    const bytes = Buffer.alloc(before.size)
    let offset = 0
    while (offset < bytes.byteLength) {
      const bytesRead = readSync(
        descriptor,
        bytes,
        offset,
        bytes.byteLength - offset,
        offset,
      )
      if (bytesRead === 0) break
      offset += bytesRead
    }
    if (offset !== bytes.byteLength || fstatSync(descriptor).size !== before.size) {
      return { error: 'failed' }
    }

    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg'
    const size = nativeImage.createFromBuffer(bytes).getSize()
    if (size.width <= 0 || size.height <= 0) {
      return { error: 'failed' }
    }

    return {
      dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`,
      fileName,
      mimeType,
      width: size.width,
      height: size.height,
    }
  } catch {
    return { error: 'failed' }
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor)
      } catch {
        // The result is already fail-closed; there is no safe recovery at IPC teardown.
      }
    }
  }
}
