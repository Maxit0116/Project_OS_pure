import { ipcMain } from 'electron'
import { ptyManager } from './ptyManager.js'
import {
  assertTrustedHostRenderer,
  isTrustedHostRenderer,
} from '../ipcSenderTrust.js'
import {
  assertIpcString,
  parseTerminalCreateArgs,
  parseTerminalResizeArgs,
  parseTerminalWriteArgs,
} from '../ipcArgumentValidation.js'

export function registerTerminalIpc(): void {
  ipcMain.handle('terminal:create', async (event, cwd: unknown) => {
    assertTrustedHostRenderer(event)
    try {
      return await ptyManager.create(event.sender, parseTerminalCreateArgs(cwd))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to start terminal'
      throw new Error(
        `${message}. Run "npm run rebuild:native" in projectos/desktop if node-pty is missing.`,
      )
    }
  })

  ipcMain.on('terminal:write', (event, id: unknown, data: unknown) => {
    if (!isTrustedHostRenderer(event)) return
    try {
      const parsed = parseTerminalWriteArgs(id, data)
      ptyManager.write(parsed.id, parsed.data, event.sender.id)
    } catch {
      // Fire-and-forget terminal input has no rejection channel; discard invalid payloads.
    }
  })

  ipcMain.on('terminal:resize', (event, id: unknown, cols: unknown, rows: unknown) => {
    if (!isTrustedHostRenderer(event)) return
    try {
      const parsed = parseTerminalResizeArgs(id, cols, rows)
      ptyManager.resize(parsed.id, parsed.cols, parsed.rows, event.sender.id)
    } catch {
      // Fire-and-forget resize input has no rejection channel; discard invalid payloads.
    }
  })

  ipcMain.handle('terminal:kill', (event, id: unknown) => {
    assertTrustedHostRenderer(event)
    ptyManager.kill(assertIpcString(id, 'Terminal id'), event.sender.id)
  })
}

export function disposeTerminalForWebContents(webContentsId: number): void {
  ptyManager.killAllForWebContents(webContentsId)
}
