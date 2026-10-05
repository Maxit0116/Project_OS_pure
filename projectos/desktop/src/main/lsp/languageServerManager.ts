import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { app } from 'electron'
import type { WebContents } from 'electron'

export interface LspStartResult {
  ok: boolean
  error?: string
}

interface LspSession {
  process: ChildProcessWithoutNullStreams
  webContentsId: number
  workspaceRoot: string
  buffer: string
}

function resolveLanguageServerCommand(): { command: string; args: string[] } | null {
  const resolveFrom = (packageJsonPath: string) => {
    const require = createRequire(packageJsonPath)
    const entry = require.resolve('typescript-language-server/lib/cli.mjs')
    return { command: process.execPath, args: [entry, '--stdio'] }
  }

  const candidates = [
    join(app.getAppPath(), 'package.json'),
    join(process.cwd(), 'package.json'),
  ]

  for (const packageJsonPath of candidates) {
    try {
      return resolveFrom(packageJsonPath)
    } catch {
      // try next candidate
    }
  }

  try {
    return resolveFrom(import.meta.url)
  } catch {
    return null
  }
}

export class LanguageServerManager {
  private session: LspSession | null = null

  async start(webContents: WebContents, workspaceRoot: string): Promise<LspStartResult> {
    this.stop(webContents.id)

    const commandSpec = resolveLanguageServerCommand()
    if (!commandSpec) {
      const message =
        'typescript-language-server is not installed. Run npm install in projectos/desktop.'
      console.warn(`[lsp] ${message}`)
      return { ok: false, error: message }
    }

    const { command, args } = commandSpec

    return new Promise((resolve) => {
      // Spawning via process.execPath without RUN_AS_NODE starts a second Electron
      // GUI instance (extra macOS Dock icon). Force Node mode for the language server.
      const child = spawn(command, args, {
        cwd: workspaceRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
        },
      })

      const fail = (error: string) => {
        child.removeAllListeners()
        if (this.session?.process === child) {
          this.session = null
        }
        console.warn('[lsp] failed to start:', error)
        resolve({ ok: false, error })
      }

      child.on('error', (error) => {
        fail(error.message)
      })

      child.on('spawn', () => {
        const session: LspSession = {
          process: child,
          webContentsId: webContents.id,
          workspaceRoot,
          buffer: '',
        }
        this.session = session

        child.stdout.on('data', (chunk: Buffer) => {
          session.buffer += chunk.toString('utf8')
          this.flushMessages(webContents, session)
        })

        child.stderr.on('data', (chunk: Buffer) => {
          console.warn('[lsp]', chunk.toString('utf8'))
        })

        child.on('exit', () => {
          if (this.session?.process === child) {
            this.session = null
          }
        })

        resolve({ ok: true })
      })
    })
  }

  send(webContentsId: number, message: string): void {
    const session = this.session
    if (!session || session.webContentsId !== webContentsId) return
    session.process.stdin.write(message)
  }

  stop(webContentsId: number): void {
    const session = this.session
    if (!session || session.webContentsId !== webContentsId) return
    session.process.kill()
    this.session = null
  }

  private flushMessages(webContents: WebContents, session: LspSession): void {
    while (true) {
      const headerEnd = session.buffer.indexOf('\r\n\r\n')
      if (headerEnd < 0) return

      const header = session.buffer.slice(0, headerEnd)
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i)
      if (!lengthMatch) {
        session.buffer = session.buffer.slice(headerEnd + 4)
        continue
      }

      const contentLength = Number.parseInt(lengthMatch[1], 10)
      const messageStart = headerEnd + 4
      const messageEnd = messageStart + contentLength
      if (session.buffer.length < messageEnd) return

      const body = session.buffer.slice(messageStart, messageEnd)
      session.buffer = session.buffer.slice(messageEnd)
      if (!webContents.isDestroyed()) {
        webContents.send('lsp:message', body)
      }
    }
  }
}

export const languageServerManager = new LanguageServerManager()
