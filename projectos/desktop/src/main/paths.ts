import { existsSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { app } from 'electron'

/** Bundled sample workspace (dev repo path or packaged extraResources). */
export function resolveSampleWorkspaceRoot(): string {
  const fromEnv = process.env.PROJECTOS_SAMPLE_WORKSPACE
  if (fromEnv && existsSync(fromEnv)) {
    return resolve(fromEnv)
  }

  const candidates = [
    resolve(app.getAppPath(), '../../sample-graph-saas'),
    resolve(app.getAppPath(), '../../../sample-graph-saas'),
    resolve(process.cwd(), '../../sample-graph-saas'),
    resolve(process.cwd(), '../sample-graph-saas'),
    resolve(process.cwd(), 'sample-graph-saas'),
  ]

  if (!app.isPackaged) {
    candidates.unshift(
      resolve(__dirname, '../../../../sample-graph-saas'),
      resolve(__dirname, '../../../../../sample-graph-saas'),
    )
  } else {
    candidates.unshift(join(process.resourcesPath, 'sample-graph-saas'))
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(
    'sample-graph-saas workspace not found. Set PROJECTOS_SAMPLE_WORKSPACE or bundle extraResources.',
  )
}

export function resolveUserDataPath(): string {
  return app.getPath('userData')
}

export interface SecretsUserDataResolution {
  /** Canonical directory that contains secrets.json */
  path: string
  /**
   * True when secrets are reused from an external root (PROJECTOS_SECRETS_USER_DATA
   * different from Chromium userData) or when PROJECTOS_SECRETS_READ_ONLY is set.
   * External reuse is always read-only so isolate processes cannot mutate shared credentials.
   */
  readOnly: boolean
  source: 'env' | 'userData'
}

function canonicalizeExistingDir(path: string): string {
  const absolute = resolve(path)
  if (!existsSync(absolute)) {
    return absolute
  }
  return realpathSync(absolute)
}

/**
 * Resolve the FileSecretStore root. Defaults to Electron userData (writable).
 * Set PROJECTOS_SECRETS_USER_DATA to reuse an existing secrets directory without
 * pointing Chromium userData at that profile. Values are never logged.
 *
 * External reuse is always read-only. Force read-only on the default path with
 * PROJECTOS_SECRETS_READ_ONLY=1.
 */
export function resolveSecretsUserDataPath(
  env: NodeJS.ProcessEnv = process.env,
  userDataPath: string = resolveUserDataPath(),
): SecretsUserDataResolution {
  const fromEnv = env.PROJECTOS_SECRETS_USER_DATA?.trim()
  const forceReadOnly = isTruthy(env.PROJECTOS_SECRETS_READ_ONLY)
  if (fromEnv) {
    const configured = canonicalizeExistingDir(fromEnv)
    const userDataCanonical = canonicalizeExistingDir(userDataPath)
    const external = configured.toLowerCase() !== userDataCanonical.toLowerCase()
    return {
      path: configured,
      readOnly: external || forceReadOnly,
      source: 'env',
    }
  }
  return {
    path: userDataPath,
    readOnly: forceReadOnly,
    source: 'userData',
  }
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}
