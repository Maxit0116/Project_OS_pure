import { appendFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  agentRunLogPath,
  buildRunInterruptedEvent,
  isSafeRunId,
  markSnapshotInterrupted,
  readPersistedRunLog,
} from "./persisted-run.js";

export interface InterruptedRunNote {
  runId: string;
  backupId?: string;
  /** 1-based lines that were skipped instead of treated as success. */
  corruptLines?: number[];
  /** The log was already terminal. Corrupt lines are reported and the file is not rewritten. */
  alreadyTerminal?: boolean;
  snapshotUpdateFailed?: boolean;
}

/**
 * Startup reconciliation (Session S-1).
 * Appends `run_interrupted` when a persisted run did not finish.
 * Does not apply, verify, or replay model output.
 * Callers using in-memory event persistence must not invoke this.
 */
export function reconcileInterruptedAgentRuns(projectOSRoot: string): InterruptedRunNote[] {
  const directory = join(projectOSRoot, "agent-runs");
  if (!existsSync(directory)) return [];
  const notes: InterruptedRunNote[] = [];
  for (const name of readdirSync(directory)) {
    if (!name.endsWith(".jsonl")) continue;
    const runId = name.slice(0, -".jsonl".length);
    if (!isSafeRunId(runId)) continue;
    const log = readPersistedRunLog(projectOSRoot, runId);
    if (!log) continue;
    if (log.events.length === 0 && log.corruptLines.length === 0) continue;
    if (log.terminalStatus) {
      if (log.corruptLines.length > 0) {
        notes.push({
          runId,
          corruptLines: log.corruptLines,
          alreadyTerminal: true,
          ...(log.backupId ? { backupId: log.backupId } : {}),
        });
      }
      continue;
    }
    const timestamp = new Date().toISOString();
    const event = buildRunInterruptedEvent(log, timestamp);
    appendFileSync(agentRunLogPath(projectOSRoot, runId), `${JSON.stringify(event)}\n`, "utf8");
    let snapshotUpdateFailed = false;
    try {
      markSnapshotInterrupted(projectOSRoot, runId, timestamp);
    } catch {
      snapshotUpdateFailed = true;
    }
    notes.push({
      runId,
      ...(log.backupId ? { backupId: log.backupId } : {}),
      ...(log.corruptLines.length > 0 ? { corruptLines: log.corruptLines } : {}),
      ...(snapshotUpdateFailed ? { snapshotUpdateFailed: true } : {}),
    });
  }
  return notes;
}
