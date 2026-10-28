import { mkdirSync, readFileSync, unlinkSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { KeepAwakeMode, KeepAwakeStatus } from '../../../contracts/keep-awake.js'

const execFileAsync = promisify(execFile)

const MARKER_FILE_NAME = 'keep-awake-lid-guard.flag'
const MARKER_CONTENTS = 'projectos-keep-awake-lid=1\n'

export interface PowerSaveBlockerPort {
  start(type: 'prevent-app-suspension' | 'prevent-display-sleep'): number
  stop(id: number): boolean
  isStarted(id: number): boolean
}

export interface LidSleepGuardPort {
  /**
   * Enable or disable lid-close sleep prevention.
   * When `interactive` is false (quit / crash paths), must not show password UI.
   */
  setDisabled(disabled: boolean, options?: { interactive?: boolean }): Promise<void>
}

export interface KeepAwakeMarkerPort {
  read(): boolean
  write(): void
  clear(): void
}

export interface PowerKeepAwakeOptions {
  platform?: NodeJS.Platform
  powerSaveBlocker: PowerSaveBlockerPort
  lidGuard?: LidSleepGuardPort
  marker?: KeepAwakeMarkerPort
  onStatusChange?: (status: KeepAwakeStatus) => void
}

/**
 * Keeps the machine awake for Project OS agent work.
 *
 * - Idle sleep: Electron powerSaveBlocker (all platforms).
 * - Lid-close sleep (darwin): pmset disablesleep via LidSleepGuardPort.
 *
 * Product rule: when mode is not off, lid guard stays on for the whole mode
 * lifetime (one admin prompt at enable). Idle blocking follows mode rules.
 */
export class PowerKeepAwakeService {
  private readonly platform: NodeJS.Platform
  private readonly powerSaveBlocker: PowerSaveBlockerPort
  private readonly lidGuard: LidSleepGuardPort | null
  private readonly marker: KeepAwakeMarkerPort | null
  private readonly onStatusChange: ((status: KeepAwakeStatus) => void) | undefined

  private mode: KeepAwakeMode = 'off'
  private agentActivity = false
  private idleBlockerId: number | null = null
  private lidGuardActive = false
  private lastError: string | undefined
  private reconcileDone = false

  constructor(options: PowerKeepAwakeOptions) {
    this.platform = options.platform ?? process.platform
    this.powerSaveBlocker = options.powerSaveBlocker
    this.lidGuard = options.lidGuard ?? null
    this.marker = options.marker ?? null
    this.onStatusChange = options.onStatusChange
  }

  getStatus(): KeepAwakeStatus {
    const idleBlocked =
      this.idleBlockerId !== null && this.powerSaveBlocker.isStarted(this.idleBlockerId)
    const supported = this.platform === 'darwin'
    return {
      supported,
      mode: this.mode,
      active: idleBlocked || this.lidGuardActive,
      idleBlocked,
      lidGuardActive: this.lidGuardActive,
      lidGuardSupported: supported && this.lidGuard !== null,
      agentActivity: this.agentActivity,
      ...(this.lastError ? { lastError: this.lastError } : {}),
    }
  }

  /** Call once on app ready — clears a lid guard left after a crash. */
  async reconcileOnLaunch(): Promise<KeepAwakeStatus> {
    if (this.reconcileDone) return this.getStatus()
    this.reconcileDone = true
    if (this.marker?.read() && this.lidGuard) {
      try {
        await this.lidGuard.setDisabled(false)
        this.marker.clear()
        this.lidGuardActive = false
      } catch (error) {
        this.lastError = errorMessage(error)
      }
    }
    return this.emitStatus()
  }

  async setMode(mode: KeepAwakeMode): Promise<KeepAwakeStatus> {
    this.mode = mode
    this.lastError = undefined
    await this.sync()
    return this.getStatus()
  }

  async setAgentActivity(active: boolean): Promise<KeepAwakeStatus> {
    this.agentActivity = active
    await this.sync()
    return this.getStatus()
  }

  /** Release everything — call from before-quit cleanup (never prompts). */
  async deactivate(): Promise<void> {
    this.mode = 'off'
    this.agentActivity = false
    this.releaseIdleBlocker()
    if (this.lidGuardActive && this.lidGuard) {
      try {
        await this.lidGuard.setDisabled(false, { interactive: false })
        this.lidGuardActive = false
        this.marker?.clear()
      } catch {
        // Leave marker; reconcileOnLaunch will finish with an interactive prompt if needed.
        this.lidGuardActive = false
      }
    }
    this.emitStatus()
  }

  /** Best-effort sync release for force-quit paths. */
  stopSync(): void {
    this.releaseIdleBlocker()
    if (this.lidGuardActive && this.lidGuard) {
      void this.lidGuard
        .setDisabled(false, { interactive: false })
        .then(() => {
          this.marker?.clear()
        })
        .catch(() => {
          /* leave marker so reconcileOnLaunch can finish cleanup */
        })
      this.lidGuardActive = false
    }
    this.mode = 'off'
    this.agentActivity = false
  }

  private wantsKeepAwake(): boolean {
    if (this.mode === 'off') return false
    if (this.mode === 'while_app_open') return true
    return this.agentActivity
  }

  /** Lid stays armed whenever mode is not off (avoids re-prompting every agent). */
  private wantsLidGuard(): boolean {
    return this.mode !== 'off' && this.platform === 'darwin' && this.lidGuard !== null
  }

  private wantsIdleBlocker(): boolean {
    return this.wantsKeepAwake()
  }

  private async sync(): Promise<void> {
    if (this.wantsIdleBlocker()) {
      this.ensureIdleBlocker()
    } else {
      this.releaseIdleBlocker()
    }

    if (this.wantsLidGuard()) {
      await this.ensureLidGuard()
    } else {
      await this.releaseLidGuard()
    }

    this.emitStatus()
  }

  private ensureIdleBlocker(): void {
    if (this.idleBlockerId !== null && this.powerSaveBlocker.isStarted(this.idleBlockerId)) {
      return
    }
    this.idleBlockerId = this.powerSaveBlocker.start('prevent-app-suspension')
  }

  private releaseIdleBlocker(): void {
    if (this.idleBlockerId === null) return
    if (this.powerSaveBlocker.isStarted(this.idleBlockerId)) {
      this.powerSaveBlocker.stop(this.idleBlockerId)
    }
    this.idleBlockerId = null
  }

  private async ensureLidGuard(): Promise<void> {
    if (!this.lidGuard || this.lidGuardActive) return
    try {
      await this.lidGuard.setDisabled(true)
      this.lidGuardActive = true
      this.marker?.write()
      this.lastError = undefined
    } catch (error) {
      this.lastError = errorMessage(error)
      this.lidGuardActive = false
    }
  }

  private async releaseLidGuard(): Promise<void> {
    if (!this.lidGuard || !this.lidGuardActive) {
      if (!this.wantsLidGuard()) {
        this.marker?.clear()
      }
      return
    }
    try {
      // Prefer silent release so quitting / toggling Off never re-prompts.
      await this.lidGuard.setDisabled(false, { interactive: false })
      this.lidGuardActive = false
      this.marker?.clear()
    } catch {
      try {
        await this.lidGuard.setDisabled(false, { interactive: true })
        this.lidGuardActive = false
        this.marker?.clear()
      } catch (error) {
        // Keep marker so the next launch can restore sleep.
        this.lastError = errorMessage(error)
      }
    }
  }

  private emitStatus(): KeepAwakeStatus {
    const status = this.getStatus()
    this.onStatusChange?.(status)
    return status
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** File marker so a crash can restore disablesleep on next launch. */
export function createKeepAwakeMarker(userDataPath: string): KeepAwakeMarkerPort {
  const filePath = join(userDataPath, MARKER_FILE_NAME)
  return {
    read() {
      try {
        return existsSync(filePath) && readFileSync(filePath, 'utf8').includes('projectos-keep-awake-lid=1')
      } catch {
        return false
      }
    },
    write() {
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, MARKER_CONTENTS, 'utf8')
    },
    clear() {
      try {
        if (existsSync(filePath)) unlinkSync(filePath)
      } catch {
        /* ignore */
      }
    },
  }
}

/**
 * Darwin lid guard via `pmset disablesleep`.
 * Tries passwordless sudo first, then osascript admin prompt.
 */
export function createPmsetLidSleepGuard(): LidSleepGuardPort {
  return {
    async setDisabled(disabled: boolean, options?: { interactive?: boolean }): Promise<void> {
      const value = disabled ? '1' : '0'
      const interactive = options?.interactive !== false
      try {
        await execFileAsync(
          'sudo',
          ['-n', '/usr/bin/pmset', '-a', 'disablesleep', value],
          { timeout: 8_000 },
        )
        return
      } catch {
        if (!interactive) {
          throw new Error(
            `Could not ${disabled ? 'enable' : 'disable'} lid-close keep-awake without a password prompt`,
          )
        }
      }
      const script = `do shell script "/usr/bin/pmset -a disablesleep ${value}" with administrator privileges`
      try {
        await execFileAsync('osascript', ['-e', script], { timeout: 120_000 })
      } catch (error) {
        throw new Error(
          `Could not ${disabled ? 'enable' : 'disable'} lid-close keep-awake (pmset). ${errorMessage(error)}`,
        )
      }
    },
  }
}

