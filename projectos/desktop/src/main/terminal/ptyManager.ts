import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import type { WebContents } from 'electron'

export interface PtySession {
  id: string
  pty: { write(data: string): void; resize(cols: number, rows: number): void; kill(): void }
  webContentsId: number
}

type PtyModule = typeof import('node-pty')

let ptyModulePromise: Promise<PtyModule> | null = null

async function loadPtyModule(): Promise<PtyModule> {
  if (!ptyModulePromise) {
    ptyModulePromise = import('node-pty')
  }
  return ptyModulePromise
}

function resolveCwd(cwd: string): { cwd: string; fallbackUsed: boolean } {
  if (cwd && existsSync(cwd)) {
    return { cwd, fallbackUsed: false }
  }
  return { cwd: homedir(), fallbackUsed: true }
}

function shellArgs(): string[] {
  return process.platform === 'win32' ? [] : ['-i']
}

const COMMON_SHELL_ENV_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TMPDIR',
  'TMP',
  'TEMP',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'NVM_DIR',
  'VOLTA_HOME',
  'PNPM_HOME',
] as const

const WINDOWS_SHELL_ENV_KEYS = [
  'SystemRoot',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'ProgramData',
  'ProgramFiles',
  'ProgramFiles(x86)',
] as const

export function buildPtyEnvironment(
  source: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  const environment: Record<string, string> = {}
  const keys = platform === 'win32'
    ? [...COMMON_SHELL_ENV_KEYS, ...WINDOWS_SHELL_ENV_KEYS]
    : COMMON_SHELL_ENV_KEYS
  for (const key of keys) {
    const value = source[key]
    if (value !== undefined) environment[key] = value
  }
  environment.TERM = 'xterm-256color'
  environment.COLORTERM = 'truecolor'
  return environment
}

export class PtyManager {
  private readonly sessions = new Map<string, PtySession>()

  async create(webContents: WebContents, cwd: string): Promise<string> {
    const pty = await loadPtyModule()
    const shell = process.env.SHELL ?? (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh')
    const { cwd: resolvedCwd, fallbackUsed } = resolveCwd(cwd)
    const id = randomUUID()

    const ptyProcess = pty.spawn(shell, shellArgs(), {
      name: 'xterm-256color',
      cwd: resolvedCwd,
      env: buildPtyEnvironment(process.env),
      cols: 80,
      rows: 24,
    })

    ptyProcess.onData((data) => {
      if (!webContents.isDestroyed()) {
        webContents.send('terminal:data', id, data)
      }
    })

    ptyProcess.onExit(({ exitCode }) => {
      if (!webContents.isDestroyed()) {
        webContents.send('terminal:exit', id, exitCode)
      }
      this.sessions.delete(id)
    })

    this.sessions.set(id, {
      id,
      pty: ptyProcess,
      webContentsId: webContents.id,
    })

    if (fallbackUsed) {
      console.warn(
        `[ptyManager] Workspace path "${cwd}" is missing; terminal started in ${resolvedCwd}`,
      )
    }

    return id
  }

  private getOwnedSession(id: string, webContentsId: number): PtySession | undefined {
    const session = this.sessions.get(id)
    if (!session || session.webContentsId !== webContentsId) {
      return undefined
    }
    return session
  }

  write(id: string, data: string, webContentsId: number): void {
    this.getOwnedSession(id, webContentsId)?.pty.write(data)
  }

  resize(id: string, cols: number, rows: number, webContentsId: number): void {
    const session = this.getOwnedSession(id, webContentsId)
    if (session && cols > 0 && rows > 0) {
      session.pty.resize(cols, rows)
    }
  }

  kill(id: string, webContentsId: number): void {
    const session = this.getOwnedSession(id, webContentsId)
    if (!session) return
    session.pty.kill()
    this.sessions.delete(id)
  }

  killAllForWebContents(webContentsId: number): void {
    for (const [id, session] of this.sessions.entries()) {
      if (session.webContentsId === webContentsId) {
        session.pty.kill()
        this.sessions.delete(id)
      }
    }
  }
}

export const ptyManager = new PtyManager()
