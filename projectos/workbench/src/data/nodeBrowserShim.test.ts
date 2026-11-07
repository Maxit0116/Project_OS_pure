import { posix as nodePosix, win32 as nodeWin32 } from 'path'
import { describe, expect, it } from 'vitest'

import * as shim from './nodeBrowserShim'

// `path` (not `node:path`) is deliberate: the workbench Vite config aliases the
// `node:` specifiers to the shim, so the bare specifier is the real Node module.

const PATHS = [
  '',
  '.',
  '..',
  '/',
  '//',
  'a',
  'a/b',
  'a/b/',
  '/a/b/c',
  '/a/b/c/',
  './a/./b',
  'a//b',
  'a/../b',
  'a/b/../../..',
  '../a',
  '../../a/b',
  '/a/../..',
  '/a/b/../c/',
  '.projectos/code-file-understanding.json',
  'dir/file.test.ts',
  '.bashrc',
  'name.',
  'archive.tar.gz',
]

describe('nodeBrowserShim node:path', () => {
  it('can be called while a module is being imported (join/dirname/resolve are pure)', () => {
    expect(shim.join('.projectos', 'chat-sessions')).toBe('.projectos/chat-sessions')
    expect(shim.join(shim.join('.projectos', 'loop-graphs'), 'index.json')).toBe(
      '.projectos/loop-graphs/index.json',
    )
  })

  it.each(PATHS)('normalize/dirname/basename/extname/isAbsolute match path.posix for %j', (input) => {
    expect(shim.normalize(input)).toBe(nodePosix.normalize(input))
    expect(shim.dirname(input)).toBe(nodePosix.dirname(input))
    expect(shim.basename(input)).toBe(nodePosix.basename(input))
    expect(shim.extname(input)).toBe(nodePosix.extname(input))
    expect(shim.isAbsolute(input)).toBe(nodePosix.isAbsolute(input))
  })

  it('basename strips a matching suffix like path.posix', () => {
    expect(shim.basename('/a/b/file.ts', '.ts')).toBe(nodePosix.basename('/a/b/file.ts', '.ts'))
    expect(shim.basename('/a/b/file.ts', 'file.ts')).toBe(
      nodePosix.basename('/a/b/file.ts', 'file.ts'),
    )
  })

  it('join matches path.posix', () => {
    const cases: string[][] = [
      [],
      [''],
      ['a'],
      ['a', 'b'],
      ['/a', 'b', 'c'],
      ['a', '', 'b'],
      ['a/', '/b'],
      ['a', '..', 'b'],
      ['..', 'a'],
      ['/', '..', 'a'],
      ['a', 'b', '../../..'],
    ]
    for (const segments of cases) {
      expect(shim.join(...segments)).toBe(nodePosix.join(...segments))
    }
  })

  it('resolve matches path.posix when an absolute segment anchors the result', () => {
    const cases: string[][] = [
      ['/a/b', 'c'],
      ['/a/b', '../c'],
      ['/a', '/b', 'c'],
      ['/a/b', '..', '..', '..'],
      ['x', '/a', 'b/../c'],
    ]
    for (const segments of cases) {
      expect(shim.resolve(...segments)).toBe(nodePosix.resolve(...segments))
    }
  })

  it('resolve anchors relative paths at "/" because a browser has no cwd', () => {
    expect(shim.resolve()).toBe('/')
    expect(shim.resolve('a', 'b')).toBe('/a/b')
    expect(shim.resolve('a', '..', '..')).toBe('/')
  })

  it('relative matches path.posix', () => {
    const cases: Array<[string, string]> = [
      ['/a/b', '/a/b'],
      ['/a/b', '/a/b/c/d'],
      ['/a/b/c', '/a/x'],
      ['/a', '/b'],
      ['/a/b/c', '/'],
      ['/', '/a/b'],
    ]
    for (const [from, to] of cases) {
      expect(shim.relative(from, to)).toBe(nodePosix.relative(from, to))
    }
  })

  it('exposes sep, delimiter and a posix namespace', () => {
    expect(shim.sep).toBe(nodePosix.sep)
    expect(shim.delimiter).toBe(nodePosix.delimiter)
    expect(shim.posix.join('a', 'b')).toBe('a/b')
  })

  it('win32.isAbsolute matches path.win32', () => {
    for (const input of ['', 'a', '/a', '\\a', 'C:\\a', 'C:/a', 'C:a', '\\\\server\\share']) {
      expect(shim.win32.isAbsolute(input)).toBe(nodeWin32.isAbsolute(input))
    }
  })
})

describe('nodeBrowserShim filesystem stubs', () => {
  it('still refuses real filesystem access', () => {
    expect(() => shim.readFileSync()).toThrow(/node built-in "fs\.readFileSync" is not available/)
    expect(() => shim.existsSync()).toThrow(/not available in the browser workbench/)
  })

  it('reports a fixed virtual temp directory so the mock client can name paths', () => {
    expect(shim.tmpdir()).toBe('/tmp')
    expect(shim.join(shim.tmpdir(), 'projectos-mock-agent-memory')).toBe(
      '/tmp/projectos-mock-agent-memory',
    )
  })
})
