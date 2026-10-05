declare module "node:fs" {
  export function cpSync(
    source: string,
    destination: string,
    options?: { recursive?: boolean; force?: boolean },
  ): void;
  export function existsSync(path: string): boolean;
  export function closeSync(fd: number): void;
  export function fchmodSync(fd: number, mode: number): void;
  export function fsyncSync(fd: number): void;
  export function fstatSync(fd: number, options: { bigint: true }): {
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
    size: bigint;
    mode: bigint;
    dev: bigint;
    ino: bigint;
    nlink: bigint;
    mtimeNs: bigint;
    ctimeNs: bigint;
  };
  export function fstatSync(fd: number): {
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
    size: number;
    mode: number;
    dev: number;
    ino: number;
    nlink: number;
  };
  export function lstatSync(path: string, options: { bigint: true }): {
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
    size: bigint;
    mode: bigint;
    dev: bigint;
    ino: bigint;
    nlink: bigint;
    mtimeNs: bigint;
    ctimeNs: bigint;
  };
  export function lstatSync(path: string): {
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
    size: number;
    mode: number;
    dev: number;
    ino: number;
    nlink: number;
  };
  export function linkSync(existingPath: string, newPath: string): void;
  export function mkdirSync(
    path: string,
    options?: { recursive?: boolean; mode?: number },
  ): void;
  export function mkdtempSync(prefix: string): string;
  export function openSync(path: string, flags: string, mode?: number): number;
  export function openSync(path: string, flags: number, mode?: number): number;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readFileSync(path: string, options: { encoding: null }): Uint8Array;
  export function readFileSync(fd: number): Buffer;
  export function readSync(
    fd: number,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number | null,
  ): number;
  export function realpathSync(path: string): string;
  export function readdirSync(path: string): string[];
  export function renameSync(oldPath: string, newPath: string): void;
  export function unlinkSync(path: string): void;
  export function rmSync(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): void;
  export function statSync(path: string): {
    isDirectory(): boolean;
    isFile(): boolean;
    size: number;
  };
  export function symlinkSync(
    target: string,
    path: string,
    type?: "file" | "dir" | "junction",
  ): void;
  export function writeFileSync(path: string, data: string, encoding: "utf8"): void;
  export function writeFileSync(path: string, data: Uint8Array | Buffer): void;
  export function writeFileSync(
    path: string,
    data: string | Uint8Array | Buffer,
    options: { flag?: string; mode?: number },
  ): void;
  export function writeFileSync(fd: number, data: Uint8Array | Buffer): void;
  export function appendFileSync(path: string, data: string, encoding: "utf8"): void;
}

declare module "node:buffer" {
  export class Buffer extends Uint8Array {
    static from(input: Uint8Array): Buffer;
    static from(
      input: string,
      encoding: "base64" | "utf8",
    ): Buffer;
    toString(encoding: "base64" | "utf8"): string;
  }
}

declare module "node:path" {
  export const delimiter: string;
  export const sep: string;
  export function basename(path: string): string;
  export function dirname(path: string): string;
  export function extname(path: string): string;
  export function join(...paths: string[]): string;
  export function relative(from: string, to: string): string;
  export function resolve(...paths: string[]): string;
  export function isAbsolute(path: string): boolean;
  export const win32: { isAbsolute(path: string): boolean };
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:crypto" {
  interface Hash {
    update(data: string, encoding: "utf8"): Hash;
    update(data: Uint8Array): Hash;
    digest(encoding: "hex"): string;
  }
  export function createHash(algorithm: "sha256"): Hash;
  export function randomBytes(size: number): Buffer;
}

declare module "node:child_process" {
  export function spawnSync(
    command: string,
    args: string[],
    options:
      | { input: string; encoding: "utf8" }
      | {
          shell: false;
          windowsHide: boolean;
          encoding: "utf8";
          timeout: number;
          maxBuffer: number;
        },
  ): {
    status: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    error?: Error & { code?: string };
  };
}
