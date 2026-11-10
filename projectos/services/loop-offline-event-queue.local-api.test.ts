/**
 * PW-8 product LocalApi path: enqueue → persist → drain (startFromEvent).
 * Loopback only; no live webhook / external push.
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProjectOSLocalApi } from "./project-os-local-api.js";

const sampleWorkspaceRoot = resolve("..", "sample-graph-saas");

describe("LocalApi offline event queue product path", () => {
  const roots: string[] = [];
  const prevAllow = process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK;

  beforeEach(() => {
    process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK = "1";
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
    if (prevAllow === undefined) {
      delete process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK;
    } else {
      process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK = prevAllow;
    }
  });

  function openApi() {
    const sample = mkdtempSync(join(tmpdir(), "loop-eq-api-"));
    roots.push(sample);
    cpSync(sampleWorkspaceRoot, sample, { recursive: true });
    mkdirSync(join(sample, "src"), { recursive: true });
    writeFileSync(join(sample, "src/a.ts"), "export const a = 1\n");
    return new ProjectOSLocalApi({ sampleWorkspaceRoot: sample });
  }

  it("enqueue/dedupe/list/drain through LocalApi", async () => {
    const api = openApi();
    const project = await api.openSampleWorkspace();

    let doc = await api.createLoopGraph(project.projectId);
    doc = await api.upsertLoopGraph(project.projectId, {
      ...doc,
      title: "Offline EQ",
      draft: {
        revision: 1,
        graphPrompt: "eq",
        nodes: [
          {
            id: "n_impl",
            title: "Implement",
            prompt: "do",
            type: "agent",
            agentRole: "coder",
            position: { x: 0, y: 0 },
            timeoutMs: 60_000,
          },
        ],
        edges: [],
      },
    });
    const compiled = await api.compileLoopGraph(project.projectId, doc.id);
    doc = await api.approveLoopSpec(project.projectId, doc.id, {
      ...compiled.specDraft,
      version: "spec_eq_1",
      createdAt: new Date().toISOString(),
    });

    const enq = await api.enqueueOfflineLoopEvent(project.projectId, doc.id, {
      eventId: "ev_api_1",
      eventType: "verification.failed",
      payload: { reason: "flake" },
    });
    expect(enq.outcome).toBe("queued");
    expect(enq.queuedCount).toBe(1);

    const dup = await api.enqueueOfflineLoopEvent(project.projectId, doc.id, {
      eventId: "ev_api_1",
      eventType: "verification.failed",
    });
    expect(dup.outcome).toBe("dropped_duplicate");

    const listed = await api.listOfflineLoopEventQueue(project.projectId);
    expect(
      listed.some((e) => e.status === "queued" && e.eventId === "ev_api_1"),
    ).toBe(true);

    const drained = await api.drainOfflineLoopEventQueue(project.projectId, {
      max: 5,
    });
    // Either starts (drained) or stays queued with lastError (failed) — not silent drop.
    expect(drained.drained + drained.failed).toBeGreaterThanOrEqual(1);
  });
});
