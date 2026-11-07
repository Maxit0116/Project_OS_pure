import { existsSync } from 'node:fs'
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

/**
 * Directory for FileSecretStore only. Defaults to Electron userData.
 * Set PROJECTOS_SECRETS_USER_DATA to reuse an existing secrets root (e.g. the
 * daily profile's secrets.json location) without pointing Chromium userData
 * at that profile. Values are never logged.
 */
export function resolveSecretsUserDataPath(): string {
  const fromEnv = process.env.PROJECTOS_SECRETS_USER_DATA?.trim()
  if (fromEnv) {
    return resolve(fromEnv)
  }
  return resolveUserDataPath()
}
