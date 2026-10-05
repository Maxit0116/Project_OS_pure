import { existsSync, realpathSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  resolve,
  sep,
  win32,
} from "node:path";

export function resolveContainedPath(root: string, relativePath: string): string {
  assertContainedRelativePath(relativePath);

  const realRoot = realpathSync(root);
  const candidate = resolve(realRoot, relativePath);
  assertPathWithinRoot(realRoot, candidate, "Path escapes its allowed root");

  const realCandidate = realpathSync(candidate);
  assertPathWithinRoot(
    realRoot,
    realCandidate,
    "Resolved path escapes its allowed root",
  );
  return realCandidate;
}

export function resolveContainedDestinationPath(
  root: string,
  relativePath: string,
): string {
  assertContainedRelativePath(relativePath);

  const realRoot = realpathSync(root);
  const candidate = resolve(realRoot, relativePath);
  assertPathWithinRoot(realRoot, candidate, "Path escapes its allowed root");

  if (existsSync(candidate)) {
    const realCandidate = realpathSync(candidate);
    assertPathWithinRoot(
      realRoot,
      realCandidate,
      "Resolved path escapes its allowed root",
    );
    return realCandidate;
  }

  const realParent = realpathSync(dirname(candidate));
  assertPathWithinRoot(
    realRoot,
    realParent,
    "Resolved path escapes its allowed root",
  );
  const destination = join(realParent, basename(candidate));
  assertPathWithinRoot(realRoot, destination, "Path escapes its allowed root");
  return destination;
}

function assertContainedRelativePath(relativePath: string): void {
  if (
    relativePath.includes("\0") ||
    isAbsolute(relativePath) ||
    win32.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/u).includes("..")
  ) {
    throw new Error("Path must be a contained relative path");
  }
}

function assertPathWithinRoot(root: string, path: string, message: string): void {
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    throw new Error(message);
  }
}
