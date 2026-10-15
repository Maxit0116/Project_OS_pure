import { lstatSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
  WorkspaceDirectoryEntrySchema,
  type WorkspaceDirectoryEntry,
} from "../contracts/workspace-directory.js";
import { ProjectOSError } from "../errors.js";
import { resolveContainedPath } from "../utils/path-containment.js";

const SKIP_ENTRY_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".projectos",
  ".codesee",
  ".cursor",
  ".vscode",
  ".idea",
  ".agents",
  ".DS_Store",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "target",
  "vendor",
  "Pods",
  "DerivedData",
]);

const MAX_DIRECTORY_ENTRIES = 5_000;

export function normalizeWorkspaceDirectoryPath(relativePath: string): string {
  const normalized = relativePath.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (normalized === "" || normalized === ".") return "";
  return normalized;
}

export function listWorkspaceDirectoryEntries(
  workspaceRoot: string,
  relativePath: string,
): WorkspaceDirectoryEntry[] {
  const directoryPath = normalizeWorkspaceDirectoryPath(relativePath);
  if (isProtectedWorkspacePath(directoryPath)) {
    throw new ProjectOSError(
      "file_not_found",
      `Directory '${relativePath}' is not available`,
    );
  }

  let absoluteDirectory: string;
  try {
    absoluteDirectory = resolveContainedPath(workspaceRoot, directoryPath || ".");
    const stats = lstatSync(absoluteDirectory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error("Workspace path is not a directory");
    }
  } catch (error) {
    if (error instanceof ProjectOSError) throw error;
    throw new ProjectOSError(
      "file_not_found",
      `Unable to read directory '${relativePath || "."}' from workspace`,
      { cause: error },
    );
  }

  let dirents;
  try {
    dirents = readdirSync(absoluteDirectory, { withFileTypes: true });
  } catch (error) {
    throw new ProjectOSError(
      "file_not_found",
      `Unable to read directory '${relativePath || "."}' from workspace`,
      { cause: error },
    );
  }

  const entries: WorkspaceDirectoryEntry[] = [];
  for (const dirent of dirents) {
    if (SKIP_ENTRY_NAMES.has(dirent.name) || dirent.name.endsWith(".app")) continue;
    if (dirent.isSymbolicLink()) continue;
    const kind = dirent.isDirectory() ? "directory" : dirent.isFile() ? "file" : null;
    if (!kind) continue;
    const path = directoryPath ? `${directoryPath}/${dirent.name}` : dirent.name;
    const absoluteChild = join(absoluteDirectory, dirent.name);
    const escaped = relative(absoluteDirectory, absoluteChild).split(sep).join("/");
    if (escaped !== dirent.name || isProtectedWorkspacePath(path)) continue;
    entries.push(WorkspaceDirectoryEntrySchema.parse({ name: dirent.name, path, kind }));
  }

  entries.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
  return entries.slice(0, MAX_DIRECTORY_ENTRIES);
}

function isProtectedWorkspacePath(relativePath: string): boolean {
  const first = relativePath.split("/").find((part) => part.length > 0 && part !== ".");
  return first === ".git" || first === ".projectos";
}
