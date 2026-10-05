/**
 * Browser shim for the Node built-ins (`node:fs`, `node:path`, `node:os`) that the
 * backend `projectos` package imports. The workbench only ever exercises the
 * in-memory mock path (`MockProjectOSApiClient` overrides all disk access), so
 * these functions are imported but never called at runtime. They throw loudly so
 * that any accidental real-filesystem access surfaces immediately instead of
 * silently misbehaving. Vite aliases the three `node:` modules to this file.
 */
function unavailable(name: string): never {
  throw new Error(
    `[projectos] node built-in "${name}" is not available in the browser workbench. ` +
      `The mock client must not touch the real filesystem.`,
  )
}

// node:path — constants are safe to expose; functions are never used on the mock path.
export const sep = '/'
export const delimiter = ':'
export function dirname(): string {
  return unavailable('path.dirname')
}
export function join(): string {
  return unavailable('path.join')
}
export function relative(): string {
  return unavailable('path.relative')
}
export function resolve(): string {
  return unavailable('path.resolve')
}
export function basename(): string {
  return unavailable('path.basename')
}
export function extname(): string {
  return unavailable('path.extname')
}
export function isAbsolute(): boolean {
  return unavailable('path.isAbsolute')
}
export const win32 = {
  isAbsolute(): boolean {
    return unavailable('path.win32.isAbsolute')
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

// node:os
export function tmpdir(): string {
  return unavailable('os.tmpdir')
}
