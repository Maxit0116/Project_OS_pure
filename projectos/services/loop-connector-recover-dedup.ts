/**
 * Offline connector recover / dedup helpers (Gmail history + SaaS settle).
 * No live network — pure id-set / cursor rules for production adapters.
 */
export type ConnectorDedupState = {
  seenIds: string[];
  /** Opaque cursor (e.g. Gmail historyId). */
  cursor?: string;
};

export function dedupeConnectorIds(
  state: ConnectorDedupState,
  incoming: string[],
  maxSeen = 5_000,
): { state: ConnectorDedupState; novel: string[] } {
  const seen = new Set(state.seenIds);
  const novel: string[] = [];
  for (const id of incoming) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    novel.push(id);
  }
  return {
    novel,
    state: {
      ...state,
      seenIds: [...seen].slice(-maxSeen),
    },
  };
}

/**
 * Recover after resync_required / unknown settle: discard cursor, keep recent
 * seen ids so a full sync does not double-fire already handled ids.
 */
export function recoverConnectorCursor(
  state: ConnectorDedupState,
  reason: "resync_required" | "settle_unknown" | "manual",
): ConnectorDedupState {
  return {
    seenIds: state.seenIds.slice(-1_000),
    // cursor cleared — caller must full-sync / re-list
    ...(reason ? {} : {}),
  };
}
