/**
 * DI local_tools must persist formal durable AgentRun (snapshot + jsonl),
 * not memory-only Map. Restore/getAgentRun must read the same path.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadPersistedAgentRun } from "./harness/persisted-run.js";
import {
  appendLoopbackDurableVerification,
  persistLoopbackDurableAgentRun,
} from "./loop-execution-loopback-durable.js";

const temps: string[] = [];

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("persistLoopbackDurableAgentRun", () => {
  it("writes snapshot+jsonl that loadPersistedAgentRun can restore", () => {
    const projectOSRoot = mkdtempSync(join(tmpdir(), "loopback-durable-"));
    temps.push(projectOSRoot);
    const runId = "run_loopback_durable_1";

    const { run, events } = persistLoopbackDurableAgentRun({
      projectOSRoot,
      projectId: "proj_test",
      runId,
      featureNodeId: "feat_leaf",
      filePath: "src/app.ts",
      unifiedDiff: "--- a/src/app.ts\n+++ b/src/app.ts\n+ok\n",
      status: "complete",
      loopInstanceId: "inst_1",
    });

    expect(run.runId).toBe(runId);
    expect(run.status).toBe("complete");
    expect(events.some((e) => e.type === "run_started")).toBe(true);
    expect(events.some((e) => e.type === "apply_result")).toBe(true);
    expect(events.some((e) => e.type === "run_completed")).toBe(true);

    const loaded = loadPersistedAgentRun(projectOSRoot, runId);
    expect(loaded?.run?.runId).toBe(runId);
    expect(loaded?.run?.status).toBe("complete");
    expect(loaded?.log.events.length).toBeGreaterThanOrEqual(4);
    expect(loaded?.log.terminalStatus).toBe("complete");

    const snapshotRaw = readFileSync(
      join(projectOSRoot, "agent-runs", `${runId}.run.json`),
      "utf8",
    );
    expect(snapshotRaw).toContain(runId);

    appendLoopbackDurableVerification({
      projectOSRoot,
      runId,
      command: "npm test",
      status: "passed",
      exitCode: 0,
      evidenceId: `ev_${runId}`,
    });
    const afterVerify = loadPersistedAgentRun(projectOSRoot, runId);
    expect(
      afterVerify?.log.events.some((e) => e.type === "verification_result"),
    ).toBe(true);
  });
});
