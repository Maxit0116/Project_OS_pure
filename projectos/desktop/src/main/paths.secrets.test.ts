import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: (name: string) => join(tmpdir(), `mock-electron-${name}`),
  },
}))

import { resolveSecretsUserDataPath } from './paths.js'

const roots: string[] = []

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

function temp(): string {
  const root = mkdtempSync(join(tmpdir(), 'projectos-secrets-path-'))
  roots.push(root)
  return root
}

describe('resolveSecretsUserDataPath', () => {
  it('defaults to userData writable', () => {
    const userData = temp()
    const resolved = resolveSecretsUserDataPath({}, userData)
    expect(resolved.source).toBe('userData')
    expect(resolved.readOnly).toBe(false)
    expect(resolved.path).toBe(userData)
  })

  it('marks external PROJECTOS_SECRETS_USER_DATA as read-only', () => {
    const userData = temp()
    const secrets = temp()
    writeFileSync(join(secrets, 'secrets.json'), '{"secrets":{}}\n')
    const resolved = resolveSecretsUserDataPath(
      { PROJECTOS_SECRETS_USER_DATA: secrets },
      userData,
    )
    expect(resolved.source).toBe('env')
    expect(resolved.readOnly).toBe(true)
    expect(resolved.path).toBe(realpathSync(secrets))
  })

  it('canonicalizes symlink env roots', () => {
    const userData = temp()
    const real = temp()
    writeFileSync(join(real, 'secrets.json'), '{"secrets":{}}\n')
    const parent = temp()
    const link = join(parent, 'alias')
    symlinkSync(real, link)
    const resolved = resolveSecretsUserDataPath(
      { PROJECTOS_SECRETS_USER_DATA: link },
      userData,
    )
    expect(resolved.path).toBe(realpathSync(real))
    expect(resolved.readOnly).toBe(true)
  })

  it('forces read-only on same userData when PROJECTOS_SECRETS_READ_ONLY=1', () => {
    const userData = temp()
    mkdirSync(userData, { recursive: true })
    const resolved = resolveSecretsUserDataPath(
      { PROJECTOS_SECRETS_READ_ONLY: '1' },
      userData,
    )
    expect(resolved.readOnly).toBe(true)
    expect(resolved.source).toBe('userData')
  })
})
