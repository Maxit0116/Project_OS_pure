import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  applyIsolatedUserDataPath,
  canonicalizePath,
  defaultProjectOsUserDataPath,
  isForbiddenProfilePath,
  parseUserDataDirFromArgv,
  pathIsInsideOrEqual,
  pathsEqual,
  resolveConfiguredUserDataDir,
  type ElectronPathApp,
  type ElectronPathName,
} from './applyIsolatedUserDataPath.js'

const tempRoots: string[] = []

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

function tempDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'projectos-userdata-iso-'))
  tempRoots.push(root)
  return root
}

function mockApp(initialUserData: string): ElectronPathApp & {
  paths: Record<string, string>
  exit: ReturnType<typeof vi.fn>
} {
  const paths: Record<string, string> = {
    userData: initialUserData,
    sessionData: initialUserData,
    logs: join(initialUserData, 'logs'),
    crashDumps: join(initialUserData, 'Crashpad'),
    temp: join(initialUserData, 'tmp'),
  }
  return {
    paths,
    getPath(name: ElectronPathName) {
      return paths[name]!
    },
    setPath(name: ElectronPathName, path: string) {
      paths[name] = path
    },
    exit: vi.fn(),
  }
}

describe('applyIsolatedUserDataPath', () => {
  it('parses --user-data-dir from argv in both forms', () => {
    expect(parseUserDataDirFromArgv(['node', 'app', '--user-data-dir=/tmp/a'])).toBe('/tmp/a')
    expect(parseUserDataDirFromArgv(['node', 'app', '--user-data-dir', '/tmp/b'])).toBe('/tmp/b')
    expect(parseUserDataDirFromArgv(['node', 'app'])).toBeNull()
  })

  it('prefers PROJECTOS_USER_DATA_DIR over argv', () => {
    const resolved = resolveConfiguredUserDataDir(
      { PROJECTOS_USER_DATA_DIR: '/tmp/from-env' },
      ['node', 'app', '--user-data-dir=/tmp/from-argv'],
    )
    expect(resolved?.source).toBe('env')
    expect(pathsEqual(resolved!.path, '/tmp/from-env')).toBe(true)
  })

  it('sets userData/session/logs/crash/temp before ready and writes marker', () => {
    const isolate = tempDir()
    const home = tempDir()
    const daily = defaultProjectOsUserDataPath(home, 'darwin')
    const app = mockApp(daily)
    const result = applyIsolatedUserDataPath(app, {
      env: {
        PROJECTOS_USER_DATA_DIR: isolate,
        PROJECTOS_REQUIRE_ISOLATED_USER_DATA: '1',
        PROJECTOS_WRITE_ISOLATION_MARKER: '1',
      },
      argv: ['node', 'app'],
      homeDir: home,
      platformName: 'darwin',
      now: () => new Date('2026-11-07T10:00:00.000Z'),
    })
    expect(result.applied).toBe(true)
    expect(result.abortBootstrap).toBe(false)
    expect(result.rejectedReason).toBeNull()
    expect(canonicalizePath(app.getPath('userData'))).toBe(canonicalizePath(isolate))
    expect(canonicalizePath(app.getPath('sessionData'))).toBe(canonicalizePath(isolate))
    expect(app.getPath('logs')).toContain(join('logs'))
    expect(app.getPath('crashDumps')).toContain('Crashpad')
    expect(app.exit).not.toHaveBeenCalled()
    const marker = JSON.parse(
      readFileSync(join(isolate, 'projectos-isolation-marker.json'), 'utf8'),
    ) as { getPathSnapshot: Record<string, string>; redirectedPaths: Record<string, string> }
    expect(marker.getPathSnapshot.userData).toBeTruthy()
    expect(marker.redirectedPaths.logs).toContain('logs')
  })

  it('exits and aborts when isolation is required but no override is configured', () => {
    const home = tempDir()
    const daily = defaultProjectOsUserDataPath(home, 'darwin')
    const app = mockApp(daily)
    const result = applyIsolatedUserDataPath(app, {
      env: { PROJECTOS_REQUIRE_ISOLATED_USER_DATA: 'true' },
      argv: ['node', 'app'],
      homeDir: home,
      platformName: 'darwin',
      log: () => undefined,
    })
    expect(result.applied).toBe(false)
    expect(result.abortBootstrap).toBe(true)
    expect(result.rejectedReason).toMatch(/neither PROJECTOS_USER_DATA_DIR/)
    expect(app.exit).toHaveBeenCalledWith(2)
  })

  it('rejects daily path equality before mkdir and does not create the daily dir', () => {
    const home = tempDir()
    const daily = defaultProjectOsUserDataPath(home, 'darwin')
    const app = mockApp(join(home, 'other-initial'))
    const result = applyIsolatedUserDataPath(app, {
      env: {
        PROJECTOS_USER_DATA_DIR: daily,
        PROJECTOS_REQUIRE_ISOLATED_USER_DATA: '1',
      },
      argv: ['node', 'app'],
      homeDir: home,
      platformName: 'darwin',
      log: () => undefined,
    })
    expect(result.abortBootstrap).toBe(true)
    expect(result.applied).toBe(false)
    expect(app.exit).toHaveBeenCalledWith(2)
    // Must not mkdir the forbidden daily root as a side effect of rejection.
    expect(existsSync(daily)).toBe(false)
  })

  it('rejects a subdirectory of the daily profile root', () => {
    const home = tempDir()
    const daily = defaultProjectOsUserDataPath(home, 'darwin')
    mkdirSync(daily, { recursive: true })
    const nested = join(daily, 'nested-probe')
    const app = mockApp(join(home, 'other'))
    const result = applyIsolatedUserDataPath(app, {
      env: {
        PROJECTOS_USER_DATA_DIR: nested,
        PROJECTOS_REQUIRE_ISOLATED_USER_DATA: '1',
      },
      argv: ['node', 'app'],
      homeDir: home,
      platformName: 'darwin',
      log: () => undefined,
    })
    expect(result.abortBootstrap).toBe(true)
    expect(result.rejectedReason).toMatch(/nest under the daily profile/)
    expect(existsSync(nested)).toBe(false)
  })

  it('rejects a symlink whose realpath is the daily profile', () => {
    const home = tempDir()
    const daily = defaultProjectOsUserDataPath(home, 'darwin')
    mkdirSync(daily, { recursive: true })
    const linkParent = tempDir()
    const link = join(linkParent, 'alias-userdata')
    symlinkSync(daily, link)
    expect(pathIsInsideOrEqual(link, daily)).toBe(true)
    const app = mockApp(join(home, 'other'))
    const result = applyIsolatedUserDataPath(app, {
      env: {
        PROJECTOS_USER_DATA_DIR: link,
        PROJECTOS_REQUIRE_ISOLATED_USER_DATA: '1',
      },
      argv: ['node', 'app'],
      homeDir: home,
      platformName: 'darwin',
      log: () => undefined,
    })
    expect(result.abortBootstrap).toBe(true)
    expect(result.rejectedReason).toMatch(/symlink|daily profile/)
  })

  it('path helpers treat realpath aliases as equal', () => {
    const root = tempDir()
    const real = join(root, 'real')
    mkdirSync(real, { recursive: true })
    writeFileSync(join(real, 'x'), '1')
    const link = join(root, 'link')
    symlinkSync(real, link)
    expect(pathsEqual(link, real)).toBe(true)
    expect(isForbiddenProfilePath(join(link, 'child'), [real]).forbidden).toBe(true)
  })
})
