/**
 * Workspace path digests for approval evidence.
 * Symlinks: realpath must stay inside workspaceRoot (escape → unreadable).
 * Does not traverse directories or emit file contents — only path→digest maps.
 */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve, sep } from "node:path";

import { stableStringify } from "./loop-intent-graph-diff.js";

export const EMPTY_CODE_DIGEST = createHash("sha256")
  .update("[]", "utf8")
  .digest("hex")
  .slice(0, 32);

export type WorkspacePathDigestResult = {
  digests: Record<string, string>;
  /** Unexpected absence (not declared as deleted/tombstone). */
  missing: string[];
  /** Declared deleted and confirmed absent. */
  tombstones: string[];
  /** Declared deleted but file still present (dirty). */
  undeleted: string[];
  /** Escape, symlink escape, non-file, I/O error. */
  unreadable: string[];
};

export function digestBytes(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 32);
}

export function combineFileDigests(digests: Record<string, string>): string {
  const entries = Object.entries(digests).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return EMPTY_CODE_DIGEST;
  return createHash("sha256")
    .update(stableStringify(entries), "utf8")
    .digest("hex")
    .slice(0, 32);
}

/**
 * Resolve a relative workspace path without escaping the root (lexical).
 * Absolute / `..` escapes → null (fail-closed).
 */
export function resolveContainedWorkspacePath(
  workspaceRoot: string,
  relativePath: string,
): string | null {
  const trimmed = relativePath.trim();
  if (!trimmed || isAbsolute(trimmed)) return null;
  const root = resolve(workspaceRoot);
  const candidate = resolve(root, normalize(trimmed));
  const rel = relative(root, candidate);
  if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) return null;
  return candidate;
}

function pathStaysInRoot(workspaceRoot: string, absolutePath: string): boolean {
  const root = resolve(workspaceRoot);
  const rel = relative(root, absolutePath);
  return !(rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel));
}

export type DigestWorkspacePathsOptions = {
  /** Paths expected absent (tombstones). */
  deletedPaths?: string[];
};

/**
 * Digest files under workspaceRoot. Never follows symlink targets outside root.
 * Does not recurse directories. Caps unique paths via caller list (bounded).
 */
export function createWorkspacePathDigester(
  workspaceRoot: string,
): (
  paths: string[],
  options?: DigestWorkspacePathsOptions,
) => WorkspacePathDigestResult {
  return (paths: string[], options?: DigestWorkspacePathsOptions) => {
    const digests: Record<string, string> = {};
    const missing: string[] = [];
    const tombstones: string[] = [];
    const undeleted: string[] = [];
    const unreadable: string[] = [];
    const deletedSet = new Set(
      (options?.deletedPaths ?? []).map((path) => path.trim()).filter(Boolean),
    );
    const unique = [...new Set(paths.map((path) => path.trim()).filter(Boolean))];

    for (const path of unique) {
      const absolute = resolveContainedWorkspacePath(workspaceRoot, path);
      if (!absolute) {
        unreadable.push(path);
        continue;
      }
      let lstat;
      try {
        lstat = lstatSync(absolute);
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: string }).code)
            : "";
        if (code === "ENOENT") {
          if (deletedSet.has(path)) tombstones.push(path);
          else missing.push(path);
        } else {
          unreadable.push(path);
        }
        continue;
      }

      if (deletedSet.has(path)) {
        undeleted.push(path);
        // Still digest current bytes so baseline can detect dirty undelete.
      }

      try {
        let readPath = absolute;
        if (lstat.isSymbolicLink()) {
          const real = realpathSync(absolute);
          if (!pathStaysInRoot(workspaceRoot, real)) {
            unreadable.push(path);
            continue;
          }
          readPath = real;
          const realStat = lstatSync(readPath);
          if (!realStat.isFile()) {
            unreadable.push(path);
            continue;
          }
        } else if (!lstat.isFile()) {
          unreadable.push(path);
          continue;
        }
        digests[path] = digestBytes(readFileSync(readPath));
      } catch {
        unreadable.push(path);
      }
    }

    // Declared deletions not in the present-files list still need tombstone accounting.
    for (const path of deletedSet) {
      if (
        digests[path] ||
        missing.includes(path) ||
        tombstones.includes(path) ||
        undeleted.includes(path) ||
        unreadable.includes(path)
      ) {
        continue;
      }
      const absolute = resolveContainedWorkspacePath(workspaceRoot, path);
      if (!absolute) {
        unreadable.push(path);
        continue;
      }
      try {
        lstatSync(absolute);
        undeleted.push(path);
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: string }).code)
            : "";
        if (code === "ENOENT") tombstones.push(path);
        else unreadable.push(path);
      }
    }

    return { digests, missing, tombstones, undeleted, unreadable };
  };
}
