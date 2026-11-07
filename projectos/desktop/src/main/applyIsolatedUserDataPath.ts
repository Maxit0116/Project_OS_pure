import { existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

/**
 * Early userData isolation for Electron.
 *
 * When PROJECTOS_REQUIRE_ISOLATED_USER_DATA is set, this module fail-closes
 * before creating directories or calling setPath: the configured path must
 * resolve (realpath when present) outside every default Project OS profile
 * root for the platform. On rejection, callers must abort bootstrap — app.exit
 * alone does not stop subsequent register* / whenReady work.
 */

export type ElectronPathName =
  | 'userData'
  | 'sessionData'
  | 'logs'
  | 'crashDumps'
  | 'temp'

export interface ElectronPathApp {
  getPath(name: ElectronPathName): string
  setPath(name: ElectronPathName, path: string): void
  exit?(code: number): void
}

export interface ApplyIsolatedUserDataOptions {
  env?: NodeJS.ProcessEnv
  argv?: readonly string[]
  homeDir?: string
  platformName?: NodeJS.Platform
  /** When true (default), create the directory only after the path is accepted. */
  ensureDirectory?: boolean
  writeMarker?: boolean
  now?: () => Date
  log?: (message: string) => void
  /**
   * Test seam: override default profile roots (never pass the real daily root
   * into negative live probes — use a fake daily under a temp harness).
   */
  defaultProfileRoots?: string[]
}

export interface ApplyIsolatedUserDataResult {
  configuredPath: string | null
  /** Canonical path used for setPath after acceptance (absolute, realpath when possible). */
  effectivePath: string
  applied: boolean
  /** True when isolation was required and rejected — bootstrap must stop. */
  abortBootstrap: boolean
  source: 'env' | 'argv' | 'none'
  defaultPath: string
  defaultRoots: string[]
  required: boolean
  rejectedReason: string | null
  redirectedPaths?: Partial<Record<ElectronPathName, string>>
}

const USER_DATA_ENV = 'PROJECTOS_USER_DATA_DIR'
const REQUIRE_ISOLATED_ENV = 'PROJECTOS_REQUIRE_ISOLATED_USER_DATA'
const MARKER_ENV = 'PROJECTOS_WRITE_ISOLATION_MARKER'
const ARGV_FLAG = '--user-data-dir'

export function defaultProjectOsUserDataPath(
  homeDir: string = homedir(),
  platformName: NodeJS.Platform = platform(),
): string {
  if (platformName === 'darwin') {
    return join(homeDir, 'Library', 'Application Support', 'projectos-desktop')
  }
  if (platformName === 'win32') {
    const appData = process.env.APPDATA?.trim()
    if (appData) return join(appData, 'projectos-desktop')
    return join(homeDir, 'AppData', 'Roaming', 'projectos-desktop')
  }
  const xdg = process.env.XDG_CONFIG_HOME?.trim()
  if (xdg) return join(xdg, 'projectos-desktop')
  return join(homeDir, '.config', 'projectos-desktop')
}

/** All profile roots that isolation must not equal or nest under. */
export function defaultProjectOsProfileRoots(
  homeDir: string = homedir(),
  platformName: NodeJS.Platform = platform(),
): string[] {
  const roots = [defaultProjectOsUserDataPath(homeDir, platformName)]
  if (platformName === 'darwin') {
    roots.push(join(homeDir, 'Library', 'Logs', 'projectos-desktop'))
    roots.push(join(homeDir, 'Library', 'Caches', 'projectos-desktop'))
  }
  return roots
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
    return { path: isAbsolute(fromArgv) ? resolve(fromArgv) : resolve(fromArgv), source: 'argv' }
  }
  return null
}

/** Prefer realpath for existing paths; otherwise absolute resolve. Never throws. */
export function canonicalizePath(path: string): string {
  const absolute = resolve(path)
  try {
    if (existsSync(absolute)) {
      return realpathSync(absolute)
    }
    // If a parent exists, realpath the parent and append the remainder so
    // symlink parents are not accepted as "outside" by string compare alone.
    let cursor = absolute
    const parts: string[] = []
    while (cursor !== resolve(cursor, '..')) {
      const parent = resolve(cursor, '..')
      if (parent === cursor) break
      parts.unshift(cursor.slice(parent.length).replace(/^[/\\]/, ''))
      if (existsSync(parent)) {
        return join(realpathSync(parent), ...parts)
      }
      cursor = parent
    }
  } catch {
    // fall through
  }
  return absolute
}

export function pathsEqual(a: string, b: string): boolean {
  const norm = (value: string) =>
    canonicalizePath(value).replace(/[/\\]+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

/** True when candidate is the root or a nested path under root (after canonicalize). */
export function pathIsInsideOrEqual(candidate: string, root: string): boolean {
  const left = canonicalizePath(candidate).replace(/[/\\]+$/, '')
  const right = canonicalizePath(root).replace(/[/\\]+$/, '')
  if (left.toLowerCase() === right.toLowerCase()) return true
  const rel = relative(right, left)
  if (!rel || rel === '') return true
  if (rel.startsWith(`..${sep}`) || rel === '..') return false
  // Windows drive-relative escape
  if (isAbsolute(rel)) return false
  return true
}

export function isForbiddenProfilePath(
  candidate: string,
  forbiddenRoots: readonly string[],
): { forbidden: boolean; matchedRoot: string | null } {
  for (const root of forbiddenRoots) {
    if (pathIsInsideOrEqual(candidate, root)) {
      return { forbidden: true, matchedRoot: root }
    }
  }
  return { forbidden: false, matchedRoot: null }
}

/**
 * Apply configured userData before `app.whenReady`. Safe to call once at
 * process bootstrap. When `abortBootstrap` is true the caller must return
 * immediately and must not register IPC / windows.
 */
export function applyIsolatedUserDataPath(
  app: ElectronPathApp,
  options: ApplyIsolatedUserDataOptions = {},
): ApplyIsolatedUserDataResult {
  const env = options.env ?? process.env
  const argv = options.argv ?? process.argv
  const homeDir = options.homeDir ?? homedir()
  const platformName = options.platformName ?? platform()
  const defaultPath = defaultProjectOsUserDataPath(homeDir, platformName)
  const defaultRoots = [
    ...(options.defaultProfileRoots ?? defaultProjectOsProfileRoots(homeDir, platformName)),
    ...parseForbiddenRootsFromEnv(env),
  ]
  const required = isTruthy(env[REQUIRE_ISOLATED_ENV])
  const configured = resolveConfiguredUserDataDir(env, argv)
  // Include Electron's current userData only when it still looks like a default
  // profile root. If Chromium already honored --user-data-dir, getPath may already
  // return the isolate path — do not treat that as forbidden.
  const currentUserData = safeGetPath(app, 'userData')
  if (
    currentUserData &&
    (
      pathsEqual(currentUserData, defaultPath) ||
      defaultRoots.some((root) => pathIsInsideOrEqual(currentUserData, root))
    ) &&
    !(configured && pathsEqual(currentUserData, configured.path))
  ) {
    defaultRoots.push(currentUserData)
  }
  const log = options.log ?? ((message: string) => {
    console.error(`[projectos] ${message}`)
  })

  const reject = (reason: string, configuredPath: string | null, source: 'env' | 'argv' | 'none') => {
    log(reason)
    app.exit?.(2)
    return {
      configuredPath,
      effectivePath: configuredPath ? canonicalizePath(configuredPath) : (safeGetPath(app, 'userData') ?? defaultPath),
      applied: false,
      abortBootstrap: true,
      source,
      defaultPath,
      defaultRoots,
      required,
      rejectedReason: reason,
    } satisfies ApplyIsolatedUserDataResult
  }

  if (!configured) {
    if (required) {
      return reject(
        `PROJECTOS_REQUIRE_ISOLATED_USER_DATA is set but neither ${USER_DATA_ENV} nor ${ARGV_FLAG} was provided`,
        null,
        'none',
      )
    }
    return {
      configuredPath: null,
      effectivePath: safeGetPath(app, 'userData') ?? defaultPath,
      applied: false,
      abortBootstrap: false,
      source: 'none',
      defaultPath,
      defaultRoots,
      required,
      rejectedReason: null,
    }
  }

  // Reject symlink / alias / subdir of daily BEFORE mkdir or setPath.
  if (required) {
    const canonical = canonicalizePath(configured.path)
    // If path exists as a symlink into a forbidden root, lstat+realpath catch it.
    try {
      if (existsSync(configured.path) && lstatSync(configured.path).isSymbolicLink()) {
        const target = canonicalizePath(configured.path)
        const hit = isForbiddenProfilePath(target, defaultRoots)
        if (hit.forbidden) {
          return reject(
            `Isolated userData symlink resolves into the daily profile root (${hit.matchedRoot})`,
            configured.path,
            configured.source,
          )
        }
      }
    } catch {
      // ignore lstat errors; canonicalizePath already best-effort
    }
    const hit = isForbiddenProfilePath(canonical, defaultRoots)
    if (hit.forbidden) {
      return reject(
        `Isolated userData must not equal or nest under the daily profile root (${hit.matchedRoot})`,
        configured.path,
        configured.source,
      )
    }
  }

  const acceptedPath = canonicalizePath(configured.path)

  if (options.ensureDirectory !== false) {
    mkdirSync(acceptedPath, { recursive: true })
  }

  const redirected: Partial<Record<ElectronPathName, string>> = {
    userData: acceptedPath,
    sessionData: acceptedPath,
    logs: join(acceptedPath, 'logs'),
    crashDumps: join(acceptedPath, 'Crashpad'),
    temp: join(acceptedPath, 'tmp'),
  }
  for (const [name, path] of Object.entries(redirected) as [ElectronPathName, string][]) {
    if (name !== 'userData' && name !== 'sessionData') {
      mkdirSync(path, { recursive: true })
    }
    try {
      app.setPath(name, path)
    } catch {
      // sessionData / logs / crashDumps / temp may be unavailable on mocks.
      if (name === 'userData') throw new Error('app.setPath(userData) failed')
    }
  }

  const effectivePath = canonicalizePath(safeGetPath(app, 'userData') ?? acceptedPath)
  if (required) {
    const hit = isForbiddenProfilePath(effectivePath, defaultRoots)
    if (hit.forbidden) {
      return reject(
        `Isolated userData was required but effective path still resolves into the daily profile (${hit.matchedRoot})`,
        configured.path,
        configured.source,
      )
    }
  }

  const writeMarker = options.writeMarker ?? isTruthy(env[MARKER_ENV])
  if (writeMarker) {
    const proofPaths: Record<string, string | null> = {}
    for (const name of ['userData', 'sessionData', 'logs', 'crashDumps', 'temp'] as const) {
      proofPaths[name] = safeGetPath(app, name)
    }
    const marker = {
      pid: process.pid,
      effectivePath,
      source: configured.source,
      redirectedPaths: redirected,
      getPathSnapshot: proofPaths,
      at: (options.now ?? (() => new Date()))().toISOString(),
    }
    writeFileSync(join(effectivePath, 'projectos-isolation-marker.json'), `${JSON.stringify(marker, null, 2)}\n`, 'utf8')
  }

  return {
    configuredPath: configured.path,
    effectivePath,
    applied: true,
    abortBootstrap: false,
    source: configured.source,
    defaultPath,
    defaultRoots,
    required,
    rejectedReason: null,
    redirectedPaths: redirected,
  }
}

const FORBIDDEN_ROOTS_ENV = 'PROJECTOS_ISOLATION_FORBIDDEN_ROOTS'

function parseForbiddenRootsFromEnv(env: NodeJS.ProcessEnv): string[] {
  const raw = env[FORBIDDEN_ROOTS_ENV]?.trim()
  if (!raw) return []
  return raw
    .split(/[:;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => resolve(part))
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function safeGetPath(app: ElectronPathApp, name: ElectronPathName): string | null {
  try {
    return app.getPath(name)
  } catch {
    return null
  }
}
