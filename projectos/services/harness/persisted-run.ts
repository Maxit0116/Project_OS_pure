import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { AgentRunSchema, type AgentRun, type AgentRunStatus } from "../../contracts/agent-run.js";
import type { ApplyResult } from "../../contracts/diff.js";
import {
  AgentLifecycleEventSchema,
  AgentRunEventSchema,
  type AgentRunEvent,
} from "../../contracts/events.js";

const TERMINAL_STATUS = {
  run_completed: "complete",
  step_failed: "error",
  run_cancelled: "cancelled",
  run_interrupted: "interrupted",
} as const;

export interface PersistedRunLog {
  runId: string;
  events: AgentRunEvent[];
  /** 1-based source lines that were not valid events. */
  corruptLines: number[];
  /** Null while the log has no terminal event. Disk readers must not treat that as running. */
  terminalStatus: "complete" | "error" | "cancelled" | "interrupted" | null;
  writes: "applied" | "none" | "unknown";
  backupId?: string;
  applyResult?: ApplyResult;
}

export interface LoadedPersistedAgentRun {
  log: PersistedRunLog;
  /** Absent when the identity snapshot is missing or unreadable. Events are not used to invent one. */
  run: AgentRun | null;
  snapshotCorrupt: boolean;
}

export function isSafeRunId(runId: string): boolean {
  return runId.length > 0 &&
    runId.length <= 200 &&
    !runId.includes("/") &&
    !runId.includes("\\") &&
    !runId.includes("..") &&
    !runId.includes("\0");
}

export function agentRunLogPath(projectOSRoot: string, runId: string): string {
  return join(projectOSRoot, "agent-runs", `${runId}.jsonl`);
}

export function agentRunSnapshotPath(projectOSRoot: string, runId: string): string {
  return join(projectOSRoot, "agent-runs", `${runId}.run.json`);
}

/**
 * A persisted run is never `queued` or `running`. An open log is `interrupted`
 * until startup reconciliation appends that event.
 */
export function readableRunStatus(log: PersistedRunLog): AgentRunStatus {
  return log.terminalStatus ?? "interrupted";
}

export function readPersistedRunLog(
  projectOSRoot: string,
  runId: string,
): PersistedRunLog | null {
  if (!isSafeRunId(runId)) return null;
  const filePath = agentRunLogPath(projectOSRoot, runId);
  if (!existsSync(filePath)) return null;
  let raw = "";
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return {
      runId,
      events: [],
      corruptLines: [1],
      terminalStatus: null,
      writes: "unknown",
    };
  }
  return parsePersistedRunLog(runId, raw);
}

export function parsePersistedRunLog(runId: string, raw: string): PersistedRunLog {
  const events: AgentRunEvent[] = [];
  const corruptLines: number[] = [];
  const lines = raw.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? "";
    if (!trimmed) continue;
    try {
      const parsed = AgentRunEventSchema.safeParse(JSON.parse(trimmed));
      if (!parsed.success) {
        corruptLines.push(index + 1);
        continue;
      }
      if (parsed.data.runId !== runId) {
        corruptLines.push(index + 1);
        continue;
      }
      events.push(parsed.data);
    } catch {
      corruptLines.push(index + 1);
    }
  }

  const lastType = events.at(-1)?.type;
  const terminalStatus = lastType && lastType in TERMINAL_STATUS
    ? TERMINAL_STATUS[lastType as keyof typeof TERMINAL_STATUS]
    : null;
  let backupId: string | undefined;
  let filesWritten: string[] | undefined;
  for (const event of events) {
    if (event.type !== "apply_result") continue;
    if (event.payload.outcome !== "applied" || !event.payload.backupId) continue;
    backupId = event.payload.backupId;
    filesWritten = event.payload.filesWritten;
  }
  const writes = backupId ? "applied" : events.length > 0 ? "none" : "unknown";
  const applyResult = backupId && filesWritten
    ? {
        runId,
        applied: true,
        filesChanged: filesWritten,
        verificationStatus: verificationStatusOf(events),
        outcome: "applied" as const,
        backupId,
      }
    : undefined;
  return {
    runId,
    events,
    corruptLines,
    terminalStatus,
    writes,
    ...(backupId ? { backupId } : {}),
    ...(applyResult ? { applyResult } : {}),
  };
}

export function buildRunInterruptedEvent(
  log: PersistedRunLog,
  timestamp: string,
): AgentRunEvent {
  return AgentLifecycleEventSchema.parse({
    eventId: `evt_interrupted_${log.runId}`,
    runId: log.runId,
    timestamp,
    type: "run_interrupted",
    payload: {
      status: "interrupted",
      writes: log.writes,
      ...(log.backupId ? { backupId: log.backupId } : {}),
      ...(log.corruptLines.length > 0 ? { corruptLines: log.corruptLines } : {}),
    },
  });
}

export function writeRunSnapshot(projectOSRoot: string, run: AgentRun): void {
  if (!isSafeRunId(run.runId)) {
    throw new Error(`Refusing to persist an unsafe run id`);
  }
  const parsed = AgentRunSchema.parse(run);
  const target = agentRunSnapshotPath(projectOSRoot, parsed.runId);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(parsed)}\n`, "utf8");
    renameSync(temporary, target);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      /* keep the original write error */
    }
    throw error;
  }
}

/**
 * If a snapshot still says the run is active, record the startup interrupt.
 * Missing snapshots are left missing. A failed write throws.
 */
export function markSnapshotInterrupted(
  projectOSRoot: string,
  runId: string,
  completedAt: string,
): void {
  const snapshot = readRunSnapshot(projectOSRoot, runId);
  if (!snapshot || snapshot.corrupt || !snapshot.run) return;
  if (
    snapshot.run.status !== "queued" &&
    snapshot.run.status !== "running" &&
    snapshot.run.status !== "awaiting_review"
  ) {
    return;
  }
  writeRunSnapshot(projectOSRoot, {
    ...snapshot.run,
    status: "interrupted",
    completedAt: snapshot.run.completedAt ?? completedAt,
  });
}

export function loadPersistedAgentRun(
  projectOSRoot: string,
  runId: string,
): LoadedPersistedAgentRun | null {
  const log = readPersistedRunLog(projectOSRoot, runId);
  if (!log) return null;
  const snapshot = readRunSnapshot(projectOSRoot, runId);
  if (!snapshot || snapshot.corrupt || !snapshot.run) {
    return {
      log,
      run: null,
      snapshotCorrupt: snapshot?.corrupt === true,
    };
  }
  const status = readableRunStatus(log);
  const completedAt = snapshot.run.completedAt ?? log.events.at(-1)?.timestamp;
  try {
    const run = AgentRunSchema.parse({
      ...snapshot.run,
      status,
      ...(completedAt ? { completedAt } : {}),
    });
    return { log, run, snapshotCorrupt: false };
  } catch {
    return { log, run: null, snapshotCorrupt: true };
  }
}

function verificationStatusOf(events: readonly AgentRunEvent[]): "passed" | "failed" | "not_run" {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    if (event.type === "verification_result") return event.payload.status;
    if (event.type !== "verification_completed") continue;
    const status = event.payload?.status;
    if (status === "passed" || status === "failed" || status === "not_run") return status;
  }
  return "not_run";
}

function readRunSnapshot(
  projectOSRoot: string,
  runId: string,
): { run: AgentRun | null; corrupt: boolean } | null {
  if (!isSafeRunId(runId)) return null;
  const filePath = agentRunSnapshotPath(projectOSRoot, runId);
  if (!existsSync(filePath)) return null;
  try {
    const parsed = AgentRunSchema.safeParse(JSON.parse(readFileSync(filePath, "utf8")));
    if (!parsed.success || parsed.data.runId !== runId) {
      return { run: null, corrupt: true };
    }
    return { run: parsed.data, corrupt: false };
  } catch {
    return { run: null, corrupt: true };
  }
}
