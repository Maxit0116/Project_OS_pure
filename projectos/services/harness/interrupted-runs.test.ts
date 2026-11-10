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

  it("reports legacy-normalized lines without rewriting a terminal log or inventing a backup", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-interrupt-"));
    const dir = join(root, "agent-runs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "run_legacy.jsonl"), [
      JSON.stringify({
        eventId: "evt_1",
        runId: "run_legacy",
        timestamp: "2026-10-20T00:00:00.000Z",
        type: "run_started",
      }),
      JSON.stringify({
        eventId: "evt_2",
        runId: "run_legacy",
        timestamp: "2026-10-20T00:00:01.000Z",
        type: "model_request",
        phaseId: "phase_plan",
        payload: {
          stage: "plan",
          provider: "DeepSeek",
          model: "deepseek-v4-flash",
          durationMs: 10,
          status: "ok",
          tokenUsage: { input: 1, output: 2 },
        },
      }),
      JSON.stringify({
        eventId: "evt_3",
        runId: "run_legacy",
        timestamp: "2026-10-20T00:00:02.000Z",
        type: "step_failed",
        payload: { message: "stopped" },
      }),
      "",
    ].join("\n"), "utf8");

    const notes = reconcileInterruptedAgentRuns(root);
    expect(notes).toEqual([{
      runId: "run_legacy",
      legacyNormalizedLines: [2],
      alreadyTerminal: true,
    }]);
    const raw = readFileSync(join(dir, "run_legacy.jsonl"), "utf8");
    expect(raw).not.toContain("run_interrupted");
    expect(raw).not.toContain("backupId");
  });

  it("skips agent-runs/index.jsonl (never treats basename as runId)", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-interrupt-index-"));
    const dir = join(root, "agent-runs");
    mkdirSync(dir, { recursive: true });
    const indexBody =
      `${JSON.stringify({
        runId: "run_real",
        definitionId: "def_x",
        poolRunId: "pool_x",
        rootRunId: "run_real",
        parentRunId: null,
        sessionId: null,
        loopInstanceId: null,
        status: "complete",
        attempt: 1,
        startedAt: "2026-10-20T00:00:00.000Z",
        acceptance: "none",
        title: "t",
      })}\n`;
    writeFileSync(join(dir, "index.jsonl"), indexBody, "utf8");
    writeFileSync(
      join(dir, "run_open.jsonl"),
      `${JSON.stringify({
        eventId: "evt_1",
        runId: "run_open",
        timestamp: "2026-10-20T00:00:00.000Z",
        type: "run_started",
      })}\n`,
      "utf8",
    );

    const notes = reconcileInterruptedAgentRuns(root);
    expect(notes.map((n) => n.runId)).toEqual(["run_open"]);
    expect(readFileSync(join(dir, "index.jsonl"), "utf8")).toBe(indexBody);
    expect(readFileSync(join(dir, "index.jsonl"), "utf8")).not.toContain(
      "run_interrupted",
    );
    // Second reconcile must still leave index untouched.
    reconcileInterruptedAgentRuns(root);
    expect(readFileSync(join(dir, "index.jsonl"), "utf8")).toBe(indexBody);
  });

  it("does not reconcile another workspace's agent-runs directory", () => {
    const rootA = mkdtempSync(join(tmpdir(), "pos-interrupt-a-"));
    const rootB = mkdtempSync(join(tmpdir(), "pos-interrupt-b-"));
    mkdirSync(join(rootA, "agent-runs"), { recursive: true });
    mkdirSync(join(rootB, "agent-runs"), { recursive: true });
    writeFileSync(join(rootA, "agent-runs", "run_a.jsonl"), `${JSON.stringify({
      eventId: "evt_a",
      runId: "run_a",
      timestamp: "2026-10-20T00:00:00.000Z",
      type: "run_started",
    })}\n`, "utf8");
    writeFileSync(join(rootB, "agent-runs", "run_b.jsonl"), `${JSON.stringify({
      eventId: "evt_b",
      runId: "run_b",
      timestamp: "2026-10-20T00:00:00.000Z",
      type: "run_started",
    })}\n`, "utf8");

    expect(reconcileInterruptedAgentRuns(rootA).map((note) => note.runId)).toEqual(["run_a"]);
    expect(reconcileInterruptedAgentRuns(rootB).map((note) => note.runId)).toEqual(["run_b"]);
  });
});