/**
 * Persistent offline event queue for Loop internal triggers (PW-8 / GC-5.2).
 * Survives process restart; dedupes by eventType:eventId; drains into
 * startLoopInstanceFromEvent. Not an external webhook inbox; not 24/7 live push.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export const LOOP_EVENT_QUEUE_RELATIVE_PATH = join(
  ".projectos",
  "loop-event-queue.json",
);

export type OfflineLoopEventStatus =
  | "queued"
  | "drained"
  | "dropped_duplicate"
  | "failed";

export type OfflineLoopEventEntry = {
  dedupeKey: string;
  loopId: string;
  eventId: string;
  eventType: string;
  payload?: Record<string, unknown>;
  enqueuedAt: string;
  status: OfflineLoopEventStatus;
  updatedAt: string;
  lastError?: string;
  drainedInstanceId?: string;
};

export type OfflineLoopEventQueueState = {
  version: 1;
  /** Recent drained/dropped keys retained for cross-restart dedupe. */
  seenKeys: string[];
  entries: OfflineLoopEventEntry[];
};

const MAX_SEEN = 5_000;
const MAX_ENTRIES = 2_000;

function nowIso(): string {
  return new Date().toISOString();
}

function emptyState(): OfflineLoopEventQueueState {
  return { version: 1, seenKeys: [], entries: [] };
}

function queuePath(workspaceRoot: string): string {
  return join(workspaceRoot, LOOP_EVENT_QUEUE_RELATIVE_PATH);
}

export function loadOfflineLoopEventQueue(
  workspaceRoot: string,
): OfflineLoopEventQueueState {
  const path = queuePath(workspaceRoot);
  if (!existsSync(path)) return emptyState();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as OfflineLoopEventQueueState;
    if (raw?.version !== 1 || !Array.isArray(raw.entries) || !Array.isArray(raw.seenKeys)) {
      return emptyState();
    }
    return {
      version: 1,
      seenKeys: raw.seenKeys.filter((k) => typeof k === "string").slice(-MAX_SEEN),
      entries: raw.entries.filter(
        (e) =>
          e &&
          typeof e.dedupeKey === "string" &&
          typeof e.loopId === "string" &&
          typeof e.eventId === "string" &&
          typeof e.eventType === "string",
      ),
    };
  } catch {
    return emptyState();
  }
}

export function saveOfflineLoopEventQueue(
  workspaceRoot: string,
  state: OfflineLoopEventQueueState,
): void {
  const path = queuePath(workspaceRoot);
  mkdirSync(dirname(path), { recursive: true });
  const normalized: OfflineLoopEventQueueState = {
    version: 1,
    seenKeys: state.seenKeys.slice(-MAX_SEEN),
    entries: state.entries.slice(-MAX_ENTRIES),
  };
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function offlineEventDedupeKey(event: {
  eventType: string;
  eventId: string;
}): string {
  return `event:${event.eventType}:${event.eventId}`;
}

export type EnqueueOfflineLoopEventResult =
  | { outcome: "queued"; entry: OfflineLoopEventEntry; state: OfflineLoopEventQueueState }
  | {
      outcome: "dropped_duplicate";
      entry: OfflineLoopEventEntry;
      state: OfflineLoopEventQueueState;
    };

/**
 * Persist an inbound internal event. Duplicate dedupeKey → dropped_duplicate
 * (still recorded once for audit); does not start a Loop by itself.
 */
export function enqueueOfflineLoopEvent(
  workspaceRoot: string,
  input: {
    loopId: string;
    eventId: string;
    eventType: string;
    payload?: Record<string, unknown>;
  },
): EnqueueOfflineLoopEventResult {
  const state = loadOfflineLoopEventQueue(workspaceRoot);
  const dedupeKey = offlineEventDedupeKey(input);
  const at = nowIso();
  if (
    state.seenKeys.includes(dedupeKey) ||
    state.entries.some(
      (e) =>
        e.dedupeKey === dedupeKey &&
        (e.status === "queued" || e.status === "drained" || e.status === "dropped_duplicate"),
    )
  ) {
    const entry: OfflineLoopEventEntry = {
      dedupeKey,
      loopId: input.loopId,
      eventId: input.eventId,
      eventType: input.eventType,
      ...(input.payload ? { payload: input.payload } : {}),
      enqueuedAt: at,
      status: "dropped_duplicate",
      updatedAt: at,
    };
    const next = {
      ...state,
      seenKeys: [...state.seenKeys, dedupeKey].slice(-MAX_SEEN),
      entries: [...state.entries, entry].slice(-MAX_ENTRIES),
    };
    saveOfflineLoopEventQueue(workspaceRoot, next);
    return { outcome: "dropped_duplicate", entry, state: next };
  }

  const entry: OfflineLoopEventEntry = {
    dedupeKey,
    loopId: input.loopId,
    eventId: input.eventId,
    eventType: input.eventType,
    ...(input.payload ? { payload: input.payload } : {}),
    enqueuedAt: at,
    status: "queued",
    updatedAt: at,
  };
  const next = {
    ...state,
    seenKeys: [...state.seenKeys, dedupeKey].slice(-MAX_SEEN),
    entries: [...state.entries, entry].slice(-MAX_ENTRIES),
  };
  saveOfflineLoopEventQueue(workspaceRoot, next);
  return { outcome: "queued", entry, state: next };
}

export type DrainOfflineLoopEventResult = {
  drained: OfflineLoopEventEntry[];
  failed: OfflineLoopEventEntry[];
  skipped: number;
  state: OfflineLoopEventQueueState;
};

/**
 * Drain queued entries (FIFO). Caller supplies startFn — typically
 * startLoopInstanceFromEvent. Failed starts stay queued with lastError for
 * recover-on-retry; successful starts mark drained + retain seenKeys.
 */
export function drainOfflineLoopEventQueue(
  workspaceRoot: string,
  startFn: (input: {
    loopId: string;
    eventId: string;
    eventType: string;
    payload?: Record<string, unknown>;
  }) => { instanceId?: string } | void,
  options?: { max?: number },
): DrainOfflineLoopEventResult {
  const state = loadOfflineLoopEventQueue(workspaceRoot);
  const max = options?.max ?? 100;
  const drained: OfflineLoopEventEntry[] = [];
  const failed: OfflineLoopEventEntry[] = [];
  let skipped = 0;
  let processed = 0;

  const entries = state.entries.map((entry) => ({ ...entry }));
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    if (entry.status !== "queued") {
      skipped += 1;
      continue;
    }
    if (processed >= max) break;
    processed += 1;
    try {
      const started = startFn({
        loopId: entry.loopId,
        eventId: entry.eventId,
        eventType: entry.eventType,
        ...(entry.payload ? { payload: entry.payload } : {}),
      });
      const at = nowIso();
      const { lastError: _drop, ...rest } = entry;
      entries[i] = {
        ...rest,
        status: "drained",
        updatedAt: at,
        ...(started?.instanceId ? { drainedInstanceId: started.instanceId } : {}),
      };
      drained.push(entries[i]!);
    } catch (error) {
      const at = nowIso();
      entries[i] = {
        ...entry,
        status: "queued",
        updatedAt: at,
        lastError:
          error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      };
      failed.push(entries[i]!);
    }
  }

  const next: OfflineLoopEventQueueState = {
    version: 1,
    seenKeys: state.seenKeys.slice(-MAX_SEEN),
    entries,
  };
  saveOfflineLoopEventQueue(workspaceRoot, next);
  return { drained, failed, skipped, state: next };
}

/** Recover after crash: queued entries remain; re-drain without clearing seenKeys. */
export function recoverOfflineLoopEventQueue(
  workspaceRoot: string,
): OfflineLoopEventQueueState {
  const state = loadOfflineLoopEventQueue(workspaceRoot);
  // Persistence is the recovery — no cursor to discard. Ensure failed stay queued.
  const entries = state.entries.map((entry) =>
    entry.status === "failed"
      ? { ...entry, status: "queued" as const, updatedAt: nowIso() }
      : entry,
  );
  const next = { ...state, entries };
  saveOfflineLoopEventQueue(workspaceRoot, next);
  return next;
}

export function listQueuedOfflineLoopEvents(
  workspaceRoot: string,
): OfflineLoopEventEntry[] {
  return loadOfflineLoopEventQueue(workspaceRoot).entries.filter(
    (e) => e.status === "queued",
  );
}
