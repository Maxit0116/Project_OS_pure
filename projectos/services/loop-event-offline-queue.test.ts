/**
 * PW-8 persistent offline event queue — recover + dedupe; no live webhook.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  drainOfflineLoopEventQueue,
  enqueueOfflineLoopEvent,
  listQueuedOfflineLoopEvents,
  loadOfflineLoopEventQueue,
  recoverOfflineLoopEventQueue,
} from "./loop-event-offline-queue.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe("offline loop event queue", () => {
  it("persists enqueue, dedupes, drains, and recovers across reload", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-eq-"));
    roots.push(root);

    const first = enqueueOfflineLoopEvent(root, {
      loopId: "loop_1",
      eventId: "ev_1",
      eventType: "verification.failed",
      payload: { reason: "flake" },
    });
    expect(first.outcome).toBe("queued");
    expect(listQueuedOfflineLoopEvents(root)).toHaveLength(1);

    const dup = enqueueOfflineLoopEvent(root, {
      loopId: "loop_1",
      eventId: "ev_1",
      eventType: "verification.failed",
    });
    expect(dup.outcome).toBe("dropped_duplicate");
    expect(listQueuedOfflineLoopEvents(root)).toHaveLength(1);

    const started: string[] = [];
    const drained = drainOfflineLoopEventQueue(root, (ev) => {
      started.push(`${ev.eventType}:${ev.eventId}`);
      return { instanceId: "inst_drained" };
    });
    expect(drained.drained).toHaveLength(1);
    expect(drained.failed).toHaveLength(0);
    expect(started).toEqual(["verification.failed:ev_1"]);
    expect(listQueuedOfflineLoopEvents(root)).toHaveLength(0);

    // Reload from disk — drained stays drained; duplicate still dropped.
    const reloaded = loadOfflineLoopEventQueue(root);
    expect(reloaded.entries.some((e) => e.status === "drained")).toBe(true);
    const again = enqueueOfflineLoopEvent(root, {
      loopId: "loop_1",
      eventId: "ev_1",
      eventType: "verification.failed",
    });
    expect(again.outcome).toBe("dropped_duplicate");
  });

  it("keeps failed starts queued with lastError for recover/retry", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-eq-fail-"));
    roots.push(root);
    enqueueOfflineLoopEvent(root, {
      loopId: "loop_1",
      eventId: "ev_fail",
      eventType: "github.issue_opened",
    });
    const firstDrain = drainOfflineLoopEventQueue(root, () => {
      throw new Error("preflight_blocked");
    });
    expect(firstDrain.failed).toHaveLength(1);
    expect(firstDrain.failed[0]?.lastError).toMatch(/preflight_blocked/);
    expect(listQueuedOfflineLoopEvents(root)).toHaveLength(1);

    recoverOfflineLoopEventQueue(root);
    const started: string[] = [];
    const second = drainOfflineLoopEventQueue(root, (ev) => {
      started.push(ev.eventId);
      return { instanceId: "inst_2" };
    });
    expect(started).toEqual(["ev_fail"]);
    expect(second.drained).toHaveLength(1);
    expect(listQueuedOfflineLoopEvents(root)).toHaveLength(0);
  });
});
