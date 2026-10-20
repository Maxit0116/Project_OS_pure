import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { createDefaultSettings } from "../../contracts/settings.js";
import { compileIntentGraphHeuristic } from "../loop-graph-compiler.js";
import {
  approveLoopSpec,
  createLoopGraph,
  upsertLoopGraph,
} from "../loop-graph-service.js";
import { ProjectOSLocalApi } from "../project-os-local-api.js";

/** Repo-root sample; path is independent of process cwd. */
const sampleWorkspaceRoot = fileURLToPath(
  new URL("../../../sample-graph-saas", import.meta.url),
);
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function copySampleWorkspace(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "projectos-disk-run-"));
  temporaryRoots.push(tempRoot);
  const workspaceRoot = join(tempRoot, "sample-graph-saas");
  cpSync(sampleWorkspaceRoot, workspaceRoot, { recursive: true });
  rmSync(join(workspaceRoot, ".projectos", "settings.json"), { force: true });
  const project = JSON.parse(
    readFileSync(join(workspaceRoot, ".projectos", "project.json"), "utf8"),
  ) as { projectId: string };
  const settings = createDefaultSettings(project.projectId, false);
  settings.execution.mode = "fixture";
  settings.modelProfiles = [];
  writeFileSync(
    join(workspaceRoot, ".projectos", "settings.json"),
    JSON.stringify(settings, null, 2),
    "utf8",
  );
  return workspaceRoot;
}

describe("agent runs after restart", () => {
  it("reads an interrupted run, returns the existing apply, and pauses its loop", async () => {
    const workspaceRoot = copySampleWorkspace();
    const project = JSON.parse(
      readFileSync(join(workspaceRoot, ".projectos", "project.json"), "utf8"),
    ) as { projectId: string };
    const runsDir = join(workspaceRoot, ".projectos", "agent-runs");
    mkdirSync(runsDir, { recursive: true });
    const runId = "run_disk_applied";
    writeFileSync(join(runsDir, `${runId}.jsonl`), [
      JSON.stringify({
        eventId: "evt_1",
        runId,
        timestamp: "2026-10-20T00:00:00.000Z",
        type: "run_started",
      }),
      JSON.stringify({
        eventId: "evt_2",
        runId,
        timestamp: "2026-10-20T00:00:01.000Z",
        type: "apply_result",
        payload: {
          filesWritten: ["app/login/page.tsx"],
          backupId: "backup-disk",
          outcome: "applied",
        },
      }),
      "{not-json",
      "",
    ].join("\n"), "utf8");
    writeFileSync(join(runsDir, `${runId}.run.json`), `${JSON.stringify({
      runId,
      projectId: project.projectId,
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
      rootRunId: runId,
      startedAt: "2026-10-20T00:00:00.000Z",
    })}\n`, "utf8");

    const pagePath = join(workspaceRoot, "app/login/page.tsx");
    const before = readFileSync(pagePath, "utf8");
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const opened = await api.openWorkspace(workspaceRoot);

    const run = await api.getAgentRun(runId);
    expect(run.status).toBe("interrupted");
    expect(run.projectId).toBe(opened.projectId);
    const events = await api.getAgentRunEvents(runId);
    expect(events.at(-1)?.type).toBe("run_interrupted");
    expect(events.at(-1)).toMatchObject({
      payload: {
        writes: "applied",
        backupId: "backup-disk",
        corruptLines: [3],
      },
    });

    const firstApply = await api.applyDiff(runId);
    const secondApply = await api.applyDiff(runId);
    expect(firstApply).toMatchObject({
      applied: true,
      backupId: "backup-disk",
      outcome: "applied",
    });
    expect(secondApply).toEqual(firstApply);
    expect(readFileSync(pagePath, "utf8")).toBe(before);
    await expect(api.continueAgentRun(runId)).rejects.toMatchObject({
      code: "diff_apply_failed",
    });

    let doc = createLoopGraph(workspaceRoot, opened.projectId, "Disk interrupt");
    doc = upsertLoopGraph(workspaceRoot, {
      ...doc,
      draft: {
        revision: 1,
        graphPrompt: "Implement then verify",
        nodes: [
          {
            id: "n1",
            title: "Implement",
            prompt: "Implement feature",
            role: "implement",
            position: { x: 0, y: 0 },
          },
          {
            id: "n2",
            title: "Verify",
            prompt: "Verify feature",
            role: "verify",
            position: { x: 0, y: 120 },
          },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2", kind: "depends" }],
      },
    });
    const compiled = compileIntentGraphHeuristic(doc.draft);
    doc = approveLoopSpec(workspaceRoot, doc.id, compiled.specDraft);
    const spec = doc.approvedSpecs.at(-1)!;
    const now = "2026-10-20T00:00:02.000Z";
    doc = upsertLoopGraph(workspaceRoot, {
      ...doc,
      instances: [{
        id: "inst_disk",
        specVersion: spec.version,
        status: "running",
        cursorNodeId: "n1",
        round: 0,
        attemptCounts: {},
        activeRunId: runId,
        activeRunNodeId: "n1",
        events: [{
          id: "evt_loop_started",
          at: now,
          type: "started",
        }],
        startedAt: now,
        updatedAt: now,
      }],
    });

    const advanced = await api.advanceLoopInstance(opened.projectId, doc.id, "inst_disk");
    const instance = advanced.instances.find((item) => item.id === "inst_disk");
    expect(instance?.status).toBe("paused");
    expect(instance?.cursorNodeId).toBe("n1");
    expect(instance?.events.some((event) => event.type === "node_completed")).toBe(false);
    expect(readFileSync(pagePath, "utf8")).toBe(before);
  });
});
