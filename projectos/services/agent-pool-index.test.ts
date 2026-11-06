import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { AgentRunEvent } from "../contracts/events.js";
import {
  appendAgentRunIndexEntry,
  createWorkforceAgent,
  ensureAgentPoolRun,
  listAgentRunsByDefinition,
  listWorkforceAgents,
  readAgentDefinition,
  setAgentRunAcceptance,
  updateWorkforceAgent,
  upsertAgentDefinition,
  upsertAgentRunIndexEntry,
  watermarkFromEvents,
} from "./agent-pool-index.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "projectos-pool-"));
  dirs.push(dir);
  return dir;
}

describe("agent-pool-index", () => {
  it("creates independent pool runs and indexes history by definition", () => {
    const root = tempRoot();
    const pool = ensureAgentPoolRun({
      projectOSRoot: root,
      projectId: "proj",
      rootRunId: "run_1",
      sessionId: "sess_1",
      triggerSource: "chat",
    });
    expect(pool.poolRunId.startsWith("pool_")).toBe(true);
    expect(pool.rootRunId).toBe("run_1");

    appendAgentRunIndexEntry(root, {
      runId: "run_1",
      definitionId: "def_root_sess_1",
      poolRunId: pool.poolRunId,
      rootRunId: "run_1",
      sessionId: "sess_1",
      status: "complete",
      attempt: 1,
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:01:00.000Z",
      acceptance: "pending",
      title: "First",
    });
    appendAgentRunIndexEntry(root, {
      runId: "run_2",
      definitionId: "def_root_sess_1",
      poolRunId: pool.poolRunId,
      rootRunId: "run_2",
      sessionId: "sess_1",
      status: "complete",
      attempt: 2,
      startedAt: "2026-01-01T00:02:00.000Z",
      endedAt: "2026-01-01T00:03:00.000Z",
      acceptance: "none",
      title: "Second",
    });

    const listed = listAgentRunsByDefinition(root, "def_root_sess_1");
    expect(listed.map((entry) => entry.runId)).toEqual(["run_2", "run_1"]);

    const accepted = setAgentRunAcceptance(root, "run_1", "accepted");
    expect(accepted?.acceptance).toBe("accepted");
    expect(
      listAgentRunsByDefinition(root, "def_root_sess_1").find(
        (entry) => entry.runId === "run_1",
      )?.acceptance,
    ).toBe("accepted");
  });

  it("upserts index rows without losing prior fields", () => {
    const root = tempRoot();
    upsertAgentRunIndexEntry(root, {
      runId: "run_x",
      definitionId: "def_x",
      poolRunId: "pool_x",
      status: "running",
      startedAt: "2026-01-01T00:00:00.000Z",
      title: "X",
    });
    upsertAgentRunIndexEntry(root, {
      runId: "run_x",
      status: "complete",
      endedAt: "2026-01-01T00:00:10.000Z",
      acceptance: "pending",
    });
    const row = listAgentRunsByDefinition(root, "def_x")[0];
    expect(row?.poolRunId).toBe("pool_x");
    expect(row?.status).toBe("complete");
    expect(row?.acceptance).toBe("pending");
  });

  it("creates and lists workforce agents separately from pool lanes", () => {
    const root = tempRoot();
    upsertAgentDefinition(root, {
      definitionId: "def_root_sess",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      config: { displayName: "Root lane" },
    });
    const created = createWorkforceAgent(root, {
      projectId: "proj",
      draft: {
        displayName: "QA Reviewer",
        roleLabel: "QA",
        instructions: "Review carefully.",
        skillIds: ["skill-a"],
        mcpServerIds: ["mcp-a"],
      },
    });
    expect(created.definitionId.startsWith("agent_")).toBe(true);
    expect(created.config.kind).toBe("workforce");
    expect(listWorkforceAgents(root)).toHaveLength(1);
    expect(readAgentDefinition(root, created.definitionId)?.config.skillIds).toEqual([
      "skill-a",
    ]);

    const updated = updateWorkforceAgent(root, {
      definitionId: created.definitionId,
      draft: {
        displayName: "QA Lead",
        roleLabel: "QA",
        instructions: "Stricter review.",
        skillIds: ["skill-a", "skill-b"],
        mcpServerIds: [],
      },
    });
    expect(updated.config.displayName).toBe("QA Lead");
    expect(updated.config.skillIds).toEqual(["skill-a", "skill-b"]);
  });

  it("computes watermarks from runSequence", () => {
    const events = [
      {
        eventId: "a",
        runId: "r",
        timestamp: "2026-01-01T00:00:00.000Z",
        type: "run_started",
        runSequence: 1,
      },
      {
        eventId: "b",
        runId: "r",
        timestamp: "2026-01-01T00:00:01.000Z",
        type: "run_completed",
        runSequence: 2,
      },
    ] as AgentRunEvent[];
    expect(watermarkFromEvents(events)).toEqual({
      watermark: 2,
      watermarkEventId: "b",
    });
    expect(watermarkFromEvents([])).toEqual({
      watermark: null,
      watermarkEventId: null,
    });
  });
});
