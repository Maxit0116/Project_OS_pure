import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  applyIsolatedUserDataPath,
  defaultProjectOsUserDataPath,
  parseUserDataDirFromArgv,
  pathsEqual,
  resolveConfiguredUserDataDir,
  type ElectronPathApp,
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
  }
  return {
    paths,
    getPath(name) {
      return paths[name]!
    },
    setPath(name, path) {
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

  it('sets userData and sessionData before ready and writes marker', () => {
    const isolate = tempDir()
    const home = tempDir()
    const daily = defaultProjectOsUserDataPath(home)
    const app = mockApp(daily)
    const result = applyIsolatedUserDataPath(app, {
      env: {
        PROJECTOS_USER_DATA_DIR: isolate,
        PROJECTOS_REQUIRE_ISOLATED_USER_DATA: '1',
        PROJECTOS_WRITE_ISOLATION_MARKER: '1',
      },
      argv: ['node', 'app'],
      homeDir: home,
      now: () => new Date('2026-11-07T10:00:00.000Z'),
    })
    expect(result.applied).toBe(true)
    expect(result.rejectedReason).toBeNull()
    expect(app.paths.userData).toBe(isolate)
    expect(app.paths.sessionData).toBe(isolate)
    expect(app.exit).not.toHaveBeenCalled()
    const marker = JSON.parse(
      readFileSync(join(isolate, 'projectos-isolation-marker.json'), 'utf8'),
    ) as { effectivePath: string; source: string }
    expect(marker.effectivePath).toBe(isolate)
    expect(marker.source).toBe('env')
  })

  it('exits when isolation is required but no override is configured', () => {
    const home = tempDir()
    const daily = defaultProjectOsUserDataPath(home)
    const app = mockApp(daily)
    const result = applyIsolatedUserDataPath(app, {
      env: { PROJECTOS_REQUIRE_ISOLATED_USER_DATA: 'true' },
      argv: ['node', 'app'],
      homeDir: home,
      log: () => undefined,
    })
    expect(result.applied).toBe(false)
    expect(result.rejectedReason).toMatch(/neither PROJECTOS_USER_DATA_DIR/)
    expect(app.exit).toHaveBeenCalledWith(2)
  })

  it('exits when required isolation still resolves to the daily profile', () => {
    const home = tempDir()
    const daily = defaultProjectOsUserDataPath(home)
    const app = mockApp(daily)
    // Force setPath to be a no-op so effective path stays daily.
    app.setPath = () => undefined
    const result = applyIsolatedUserDataPath(app, {
      env: {
        PROJECTOS_USER_DATA_DIR: daily,
        PROJECTOS_REQUIRE_ISOLATED_USER_DATA: '1',
      },
      argv: ['node', 'app'],
      homeDir: home,
      log: () => undefined,
    })
    expect(result.rejectedReason).toMatch(/daily projectos-desktop profile/)
    expect(app.exit).toHaveBeenCalledWith(2)
  })
})
