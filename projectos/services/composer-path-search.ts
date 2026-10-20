import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { DefaultWorkspaceIgnorePolicy } from "./local-context-assembler.js";

const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".git",
  ".projectos",
]);

export function searchComposerFilePaths(
  workspaceRoot: string,
  query: string,
  limit = 30,
): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const matches: string[] = [];
  const walk = (directory: string) => {
    if (matches.length >= limit * 4) return;
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (matches.length >= limit * 4) return;
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = relative(workspaceRoot, absolute).split(sep).join("/");
      if (rel.toLowerCase().includes(needle)) matches.push(rel);
    }
  };
  walk(workspaceRoot);
  const ignored = new DefaultWorkspaceIgnorePolicy().ignoredPaths(workspaceRoot, matches);
  return matches.filter((path) => !ignored.has(path)).slice(0, limit);
}
