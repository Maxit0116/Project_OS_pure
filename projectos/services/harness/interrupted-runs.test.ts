import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { reconcileInterruptedAgentRuns } from "./interrupted-runs.js";

describe("reconcileInterruptedAgentRuns", () => {
  it("marks an unfinished log interrupted and leaves an applied backup id", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-interrupt-"));
    const dir = join(root, "agent-runs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "run_open.jsonl"), `${JSON.stringify({
      eventId: "evt_1",
      runId: "run_open",
      timestamp: "2026-10-20T00:00:00.000Z",
      type: "run_started",
    })}\n${JSON.stringify({
      eventId: "evt_2",
      runId: "run_open",
      timestamp: "2026-10-20T00:00:01.000Z",
      type: "apply_result",
      payload: { outcome: "applied", backupId: "backup-9", filesWritten: ["a.ts"] },
    })}\n`, "utf8");
    writeFileSync(join(dir, "run_done.jsonl"), `${JSON.stringify({
      eventId: "evt_3",
      runId: "run_done",
      timestamp: "2026-10-20T00:00:02.000Z",
      type: "run_completed",
    })}\n`, "utf8");
    writeFileSync(join(dir, "run_cancel.jsonl"), `${JSON.stringify({
      eventId: "evt_4",
      runId: "run_cancel",
      timestamp: "2026-10-20T00:00:03.000Z",
      type: "run_cancelled",
    })}\n`, "utf8");

    const notes = reconcileInterruptedAgentRuns(root);
    expect(notes).toEqual([{ runId: "run_open", backupId: "backup-9" }]);
    const rewritten = readFileSync(join(dir, "run_open.jsonl"), "utf8");
    expect(rewritten).toContain("\"type\":\"run_interrupted\"");
    expect(rewritten).toContain("\"status\":\"interrupted\"");
    expect(rewritten).toContain("\"writes\":\"applied\"");
    expect(rewritten).toContain("backup-9");
    expect(readFileSync(join(dir, "run_done.jsonl"), "utf8")).not.toContain("run_interrupted");
    expect(readFileSync(join(dir, "run_cancel.jsonl"), "utf8")).not.toContain("run_interrupted");
    expect(reconcileInterruptedAgentRuns(root)).toEqual([]);
  });

  it("skips a broken line, reports it, and does not invent a backup", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-interrupt-"));
    const dir = join(root, "agent-runs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "run_bad.jsonl"), [
      JSON.stringify({
        eventId: "evt_1",
        runId: "run_bad",
        timestamp: "2026-10-20T00:00:00.000Z",
        type: "run_started",
      }),
      "{not-json",
      "",
    ].join("\n"), "utf8");
    writeFileSync(join(dir, "run_failed.jsonl"), `${JSON.stringify({
      eventId: "evt_err",
      runId: "run_failed",
      timestamp: "2026-10-20T00:00:00.000Z",
      type: "step_failed",
      payload: { message: "stopped" },
    })}\n`, "utf8");

    const notes = reconcileInterruptedAgentRuns(root);
    expect(notes).toEqual([{ runId: "run_bad", corruptLines: [2] }]);
    const rewritten = readFileSync(join(dir, "run_bad.jsonl"), "utf8");
    expect(rewritten).toContain("\"writes\":\"none\"");
    expect(rewritten).toContain("\"corruptLines\":[2]");
    expect(rewritten).not.toContain("backupId");
    expect(readFileSync(join(dir, "run_failed.jsonl"), "utf8")).not.toContain("run_interrupted");
  });

  it("leaves an already finished log terminal when a later line is unreadable", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-interrupt-"));
    const dir = join(root, "agent-runs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "run_done.jsonl"), `${JSON.stringify({
      eventId: "evt_1",
      runId: "run_done",
      timestamp: "2026-10-20T00:00:00.000Z",
      type: "run_completed",
    })}\n{partial\n`, "utf8");

    expect(reconcileInterruptedAgentRuns(root)).toEqual([{
      runId: "run_done",
      corruptLines: [2],
      alreadyTerminal: true,
    }]);
    const raw = readFileSync(join(dir, "run_done.jsonl"), "utf8");
    expect(raw).not.toContain("run_interrupted");
  });
});