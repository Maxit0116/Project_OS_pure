/**
 * Browser shim for the Node built-ins (`node:fs`, `node:path`, `node:os`) that the
 * backend `projectos` package imports. The workbench only ever exercises the
 * in-memory mock path (`MockProjectOSApiClient` overrides all disk access), so
 * the `node:fs` functions are imported but never called at runtime. They throw
 * loudly so that any accidental real-filesystem access surfaces immediately
 * instead of silently misbehaving. Vite aliases the three `node:` modules to
 * this file.
 *
 * `node:path` is different: it is pure string manipulation with no filesystem
 * access, and backend modules call it while they are being imported (for example
 * `const PATH = join(".projectos", "x.json")` at module scope). It therefore has
 * real POSIX implementations below rather than throwing stubs. There is no process
 * working directory in a browser, so `resolve` treats `/` as the cwd.
 */
function unavailable(name: string): never {
  throw new Error(
    `[projectos] node built-in "${name}" is not available in the browser workbench. ` +
      `The mock client must not touch the real filesystem.`,
  )
}

// node:path — POSIX semantics, mirroring Node's `path.posix`.
export const sep = '/'
export const delimiter = ':'

/** Collapses `.`/`..`/empty segments of a path split on `/`. */
function collapseSegments(segments: string[], absolute: boolean): string[] {
  const out: string[] = []
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop()
      else if (!absolute) out.push('..')
      continue
    }
    out.push(segment)
  }
  return out
}

export function normalize(path: string): string {
  if (path.length === 0) return '.'
  const absolute = path.startsWith('/')
  const trailingSlash = path.endsWith('/')
  let normalized = collapseSegments(path.split('/'), absolute).join('/')
  if (normalized.length === 0) return absolute ? '/' : trailingSlash ? './' : '.'
  if (trailingSlash) normalized += '/'
  return absolute ? `/${normalized}` : normalized
}

export function join(...segments: string[]): string {
  const joined = segments.filter((segment) => segment.length > 0).join('/')
  return joined.length === 0 ? '.' : normalize(joined)
}

export function resolve(...segments: string[]): string {
  let resolved = ''
  for (let index = segments.length - 1; index >= 0 && !resolved.startsWith('/'); index -= 1) {
    const segment = segments[index]!
    if (segment.length === 0) continue
    resolved = resolved.length === 0 ? segment : `${segment}/${resolved}`
  }
  // No process cwd in a browser: anchor relative results at the filesystem root.
  return `/${collapseSegments(resolved.split('/'), true).join('/')}`
}

export function isAbsolute(path: string): boolean {
  return path.startsWith('/')
}

export function dirname(path: string): string {
  if (path.length === 0) return '.'
  const hasRoot = path.startsWith('/')
  let end = -1
  let matchedSlash = true
  for (let index = path.length - 1; index >= 1; index -= 1) {
    if (path[index] === '/') {
      if (!matchedSlash) {
        end = index
        break
      }
    } else {
      matchedSlash = false
    }
  }
  if (end === -1) return hasRoot ? '/' : '.'
  if (hasRoot && end === 1) return '//'
  return path.slice(0, end)
}

export function basename(path: string, suffix?: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const base = trimmed.slice(trimmed.lastIndexOf('/') + 1)
  if (suffix !== undefined && suffix !== base && base.endsWith(suffix)) {
    return base.slice(0, base.length - suffix.length)
  }
  return base
}

export function extname(path: string): string {
  const base = basename(path)
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || base === '..') return ''
  return base.slice(dot)
}

export function relative(from: string, to: string): string {
  const fromSegments = resolve(from).split('/').filter(Boolean)
  const toSegments = resolve(to).split('/').filter(Boolean)
  let common = 0
  while (
    common < fromSegments.length &&
    common < toSegments.length &&
    fromSegments[common] === toSegments[common]
  ) {
    common += 1
  }
  return [
    ...fromSegments.slice(common).map(() => '..'),
    ...toSegments.slice(common),
  ].join('/')
}

export const posix = {
  sep,
  delimiter,
  normalize,
  join,
  resolve,
  isAbsolute,
  dirname,
  basename,
  extname,
  relative,
}

export const win32 = {
  isAbsolute(path: string): boolean {
    return /^(?:[\\/]|[a-zA-Z]:[\\/])/.test(path)
  },
}

// node:fs
export function cpSync(): void {
  unavailable('fs.cpSync')
}
export function existsSync(): boolean {
  return unavailable('fs.existsSync')
}
export function closeSync(): void {
  unavailable('fs.closeSync')
}
export function fchmodSync(): void {
  unavailable('fs.fchmodSync')
}
export function fsyncSync(): void {
  unavailable('fs.fsyncSync')
}
export function fstatSync(): {
  isDirectory(): boolean
  isFile(): boolean
  isSymbolicLink(): boolean
  size: number
  mode: number
  dev: number
  ino: number
} {
  return unavailable('fs.fstatSync')
}
export function lstatSync(): {
  isDirectory(): boolean
  isFile(): boolean
  isSymbolicLink(): boolean
  size: number
  mode: number
  dev: number
  ino: number
} {
  return unavailable('fs.lstatSync')
}
export function mkdirSync(): void {
  unavailable('fs.mkdirSync')
}
export function mkdtempSync(): string {
  return unavailable('fs.mkdtempSync')
}
export function openSync(): number {
  return unavailable('fs.openSync')
}
export function readFileSync(): string {
  return unavailable('fs.readFileSync')
}
export function readSync(): number {
  return unavailable('fs.readSync')
}
export function realpathSync(): string {
  return unavailable('fs.realpathSync')
}
export function readdirSync(): string[] {
  return unavailable('fs.readdirSync')
}
export function renameSync(): void {
  unavailable('fs.renameSync')
}
export function rmSync(): void {
  unavailable('fs.rmSync')
}
export function unlinkSync(): void {
  unavailable('fs.unlinkSync')
}
export function statSync(): { isDirectory(): boolean; isFile(): boolean; size: number } {
  return unavailable('fs.statSync')
}
export function writeFileSync(): void {
  unavailable('fs.writeFileSync')
}
export function appendFileSync(): void {
  unavailable('fs.appendFileSync')
}

// node:os — `tmpdir` is only used to *name* a location (the mock client derives its
// agent-memory root from it while being constructed). There is no OS temp directory
// in a browser, so it reports a fixed virtual one; any attempt to actually read or
// write under it still hits the throwing `node:fs` stubs above.
export function tmpdir(): string {
  return '/tmp'
}
