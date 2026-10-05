import {
  closeSync,
  fchmodSync,
  fsyncSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

export interface DurableFilePersistencePrimitives {
  replace(temporaryPath: string, targetPath: string): void;
}

const defaultPersistencePrimitives: DurableFilePersistencePrimitives = {
  replace: renameSync,
};

export function createDurableFilePersistencePrimitives(
  primitives: Partial<DurableFilePersistencePrimitives> = {},
): DurableFilePersistencePrimitives {
  return { ...defaultPersistencePrimitives, ...primitives };
}

export function writeDurableTextReplacing(
  targetPath: string,
  contents: string,
  primitives: DurableFilePersistencePrimitives,
): void {
  const directory = dirname(targetPath);
  const temporaryPath = join(
    directory,
    `.${basename(targetPath)}.projectos-${globalThis.crypto.randomUUID()}.tmp`,
  );
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, new TextEncoder().encode(contents));
    fchmodSync(descriptor, 0o600);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    fsyncDirectory(directory);
    primitives.replace(temporaryPath, targetPath);
    fsyncDirectory(directory);
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* preserve the original failure */ }
    }
    removeFileIfPresent(temporaryPath);
    throw error;
  }
}

function fsyncDirectory(path: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, "r");
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function removeFileIfPresent(path: string): void {
  try {
    unlinkSync(path);
    fsyncDirectory(dirname(path));
  } catch (error) {
    if (!isErrno(error, "ENOENT")) throw error;
  }
}

function isErrno(error: unknown, code: string): error is Error & { code: string } {
  return error instanceof Error &&
    "code" in error &&
    (error as { code?: unknown }).code === code;
}
