export type LiveGraphFileIndexEntry = {
  path: string;
  nodeIds: readonly string[];
};

/**
 * Resolve a workspace path to C4 / function-map node ids.
 * Prefers exact path match; falls back to suffix match when the event path
 * is absolute or prefixed differently from fileIndex entries.
 */
export function resolvePathToNodeIds(
  path: string,
  fileIndex: readonly LiveGraphFileIndexEntry[],
): string[] {
  const normalized = normalizePath(path);
  if (!normalized) return [];

  const exact = fileIndex.find((entry) => normalizePath(entry.path) === normalized);
  if (exact) return [...exact.nodeIds];

  const suffixHits = fileIndex.filter((entry) => {
    const entryPath = normalizePath(entry.path);
    return (
      entryPath.endsWith(`/${normalized}`) ||
      normalized.endsWith(`/${entryPath}`) ||
      entryPath === normalized
    );
  });
  if (suffixHits.length === 1) {
    return [...suffixHits[0]!.nodeIds];
  }
  if (suffixHits.length > 1) {
    const ids = new Set<string>();
    for (const hit of suffixHits) {
      for (const id of hit.nodeIds) ids.add(id);
    }
    return [...ids];
  }
  return [];
}

export function fileLabel(path: string): string {
  const parts = normalizePath(path).split("/");
  return parts[parts.length - 1] || path;
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+/g, "/");
}
