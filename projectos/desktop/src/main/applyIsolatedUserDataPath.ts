import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

/**
 * Early userData isolation for Electron.
 *
 * Chromium's `--user-data-dir` usually works when placed before the app entry,
 * but Product code also reads `app.getPath('userData')` for FileSecretStore /
 * approvals / audit. Calling `app.setPath('userData', …)` before `ready`
 * makes the configured path authoritative for both Chromium and `getPath`,
 * and lets probes refuse to start when isolation was requested but missing.
 */

export interface ElectronPathApp {
  getPath(name: 'userData' | 'sessionData'): string
  setPath(name: 'userData' | 'sessionData', path: string): void
  exit?(code: number): void
}

export interface ApplyIsolatedUserDataOptions {
  env?: NodeJS.ProcessEnv
  argv?: readonly string[]
  homeDir?: string
  /** When true (default), create the directory before setPath. */
  ensureDirectory?: boolean
  /**
   * Optional sink for a small proof marker written under the effective userData
   * after apply (never writes into the default daily profile).
   */
  writeMarker?: boolean
  now?: () => Date
  log?: (message: string) => void
}

export interface ApplyIsolatedUserDataResult {
  configuredPath: string | null
  effectivePath: string
  applied: boolean
  source: 'env' | 'argv' | 'none'
  defaultPath: string
  required: boolean
  rejectedReason: string | null
}

const USER_DATA_ENV = 'PROJECTOS_USER_DATA_DIR'
const REQUIRE_ISOLATED_ENV = 'PROJECTOS_REQUIRE_ISOLATED_USER_DATA'
const MARKER_ENV = 'PROJECTOS_WRITE_ISOLATION_MARKER'
const ARGV_FLAG = '--user-data-dir'

export function defaultProjectOsUserDataPath(homeDir: string = homedir()): string {
  // Electron default on macOS for package name `projectos-desktop`.
  return join(homeDir, 'Library', 'Application Support', 'projectos-desktop')
}

export function parseUserDataDirFromArgv(argv: readonly string[]): string | null {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg) continue
    if (arg.startsWith(`${ARGV_FLAG}=`)) {
      const value = arg.slice(`${ARGV_FLAG}=`.length).trim()
      return value.length > 0 ? value : null
    }
    if (arg === ARGV_FLAG) {
      const next = argv[i + 1]?.trim()
      return next && !next.startsWith('-') ? next : null
    }
  }
  return null
}

export function resolveConfiguredUserDataDir(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv,
): { path: string; source: 'env' | 'argv' } | null {
  const fromEnv = env[USER_DATA_ENV]?.trim()
  if (fromEnv) {
    return { path: resolve(fromEnv), source: 'env' }
  }
  const fromArgv = parseUserDataDirFromArgv(argv)
  if (fromArgv) {
    return { path: isAbsolute(fromArgv) ? fromArgv : resolve(fromArgv), source: 'argv' }
  }
  return null
}

export function pathsEqual(a: string, b: string): boolean {
  const norm = (value: string) => resolve(value).replace(/[/\\]+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

/**
 * Apply configured userData before `app.whenReady`. Safe to call once at
 * process bootstrap. Returns structured result for probes/tests.
 */
export function applyIsolatedUserDataPath(
  app: ElectronPathApp,
  options: ApplyIsolatedUserDataOptions = {},
): ApplyIsolatedUserDataResult {
  const env = options.env ?? process.env
  const argv = options.argv ?? process.argv
  const homeDir = options.homeDir ?? homedir()
  const defaultPath = defaultProjectOsUserDataPath(homeDir)
  const required = isTruthy(env[REQUIRE_ISOLATED_ENV])
  const configured = resolveConfiguredUserDataDir(env, argv)
  const log = options.log ?? ((message: string) => {
    console.error(`[projectos] ${message}`)
  })

  if (!configured) {
    const effectivePath = safeGetPath(app, 'userData') ?? defaultPath
    const rejectedReason = required
      ? `PROJECTOS_REQUIRE_ISOLATED_USER_DATA is set but neither ${USER_DATA_ENV} nor ${ARGV_FLAG} was provided`
      : null
    if (rejectedReason) {
      log(rejectedReason)
      app.exit?.(2)
    }
    return {
      configuredPath: null,
      effectivePath,
      applied: false,
      source: 'none',
      defaultPath,
      required,
      rejectedReason,
    }
  }

  if (options.ensureDirectory !== false) {
    mkdirSync(configured.path, { recursive: true })
  }

  app.setPath('userData', configured.path)
  // Keep session storage with the same profile root so Chromium does not fall
  // back to the default Application Support tree for Session Storage / Preferences.
  try {
    app.setPath('sessionData', configured.path)
  } catch {
    // Older Electron mocks may not implement sessionData; ignore.
  }

  const effectivePath = safeGetPath(app, 'userData') ?? configured.path
  let rejectedReason: string | null = null
  if (required && pathsEqual(effectivePath, defaultPath)) {
    rejectedReason =
      'Isolated userData was required but effective path still resolves to the daily projectos-desktop profile'
    log(rejectedReason)
    app.exit?.(2)
  }

  const writeMarker = options.writeMarker ?? isTruthy(env[MARKER_ENV])
  if (writeMarker && !rejectedReason && !pathsEqual(effectivePath, defaultPath)) {
    const marker = {
      pid: process.pid,
      effectivePath,
      source: configured.source,
      at: (options.now ?? (() => new Date()))().toISOString(),
    }
    writeFileSync(join(effectivePath, 'projectos-isolation-marker.json'), `${JSON.stringify(marker, null, 2)}\n`, 'utf8')
  }

  return {
    configuredPath: configured.path,
    effectivePath,
    applied: true,
    source: configured.source,
    defaultPath,
    required,
    rejectedReason,
  }
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function safeGetPath(app: ElectronPathApp, name: 'userData' | 'sessionData'): string | null {
  try {
    return app.getPath(name)
  } catch {
    return null
  }
}
