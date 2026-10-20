import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { AgentRun } from "../../contracts/agent-run.js";
import { reconcileInterruptedAgentRuns } from "./interrupted-runs.js";
import {
  loadPersistedAgentRun,
  readableRunStatus,
  writeRunSnapshot,
} from "./persisted-run.js";

const runningLeaf: AgentRun = {
  runId: "run_disk",
  projectId: "proj_disk",
  kind: "feature_change",
  status: "running",
  relatedNodeIds: ["feat_login"],
  relatedFiles: ["app/login/page.tsx"],
  scope: {
    kind: "leaf-file",
    nodeId: "feat_login",
    filePath: "app/login/page.tsx",
  },
  role: "leaf_file_editor",
  rootRunId: "run_disk",
  startedAt: "2026-10-20T00:00:00.000Z",
};

describe("persisted agent runs", () => {
  it("reads an interrupted run from disk and never reports it as running", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-persist-"));
    const dir = join(root, "agent-runs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "run_disk.jsonl"), `${JSON.stringify({
      eventId: "evt_1",
      runId: "run_disk",
      timestamp: "2026-10-20T00:00:00.000Z",
      type: "run_started",
    })}\n${JSON.stringify({
      eventId: "evt_2",
      runId: "run_disk",
      timestamp: "2026-10-20T00:00:01.000Z",
      type: "apply_result",
      payload: {
        filesWritten: ["app/login/page.tsx"],
        backupId: "backup-disk",
        outcome: "applied",
      },
    })}\n{broken\n`, "utf8");
    writeRunSnapshot(root, runningLeaf);

    const notes = reconcileInterruptedAgentRuns(root);
    expect(notes.map((note) => note.runId)).toEqual(["run_disk"]);
    const loaded = loadPersistedAgentRun(root, "run_disk");
    expect(loaded?.snapshotCorrupt).toBe(false);
    expect(loaded?.run?.status).toBe("interrupted");
    expect(loaded?.run?.status).not.toBe("running");
    expect(readableRunStatus(loaded!.log)).toBe("interrupted");
    expect(loaded?.log.writes).toBe("applied");
    expect(loaded?.log.applyResult).toMatchObject({
      runId: "run_disk",
      applied: true,
      backupId: "backup-disk",
      filesChanged: ["app/login/page.tsx"],
      verificationStatus: "not_run",
    });
    expect(loaded?.log.corruptLines).toEqual([3]);
    const snapshot = JSON.parse(readFileSync(join(dir, "run_disk.run.json"), "utf8")) as AgentRun;
    expect(snapshot.status).toBe("interrupted");
  });

  it("does not invent a run when the snapshot is unreadable", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-persist-"));
    const dir = join(root, "agent-runs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "run_disk.jsonl"), `${JSON.stringify({
      eventId: "evt_1",
      runId: "run_disk",
      timestamp: "2026-10-20T00:00:00.000Z",
      type: "run_interrupted",
      payload: { status: "interrupted", writes: "none" },
    })}\n`, "utf8");
    writeFileSync(join(dir, "run_disk.run.json"), "{not-a-run\n", "utf8");

    const loaded = loadPersistedAgentRun(root, "run_disk");
    expect(loaded?.run).toBeNull();
    expect(loaded?.snapshotCorrupt).toBe(true);
    expect(loaded?.log.events).toHaveLength(1);
    expect(loaded?.log.terminalStatus).toBe("interrupted");
  });
});
