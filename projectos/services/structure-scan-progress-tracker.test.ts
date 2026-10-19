import { describe, expect, it } from "vitest";

import { StructureScanProgressTracker } from "./structure-scan-progress-tracker.js";

describe("StructureScanProgressTracker", () => {
  it("fans out planned → step → completed and keeps a snapshot", () => {
    const tracker = new StructureScanProgressTracker();
    const events: string[] = [];
    const sub = tracker.subscribe("proj_1", (event) => {
      events.push(event.type);
    });

    const { scanId, report } = tracker.begin({
      projectId: "proj_1",
      mode: "regenerate",
    });
    expect(events).toContain("scan_planned");
    expect(tracker.getProgress("proj_1")?.status).toBe("running");

    report({
      type: "step_started",
      scanId,
      projectId: "proj_1",
      timestamp: new Date().toISOString(),
      stepId: "index_repo",
    });
    report({
      type: "step_completed",
      scanId,
      projectId: "proj_1",
      timestamp: new Date().toISOString(),
      stepId: "index_repo",
      detail: "12 files",
    });
    report({
      type: "scan_completed",
      scanId,
      projectId: "proj_1",
      timestamp: new Date().toISOString(),
    });

    const snapshot = tracker.getProgress("proj_1");
    expect(snapshot?.status).toBe("success");
    expect(
      snapshot?.steps.find((step) => step.id === "index_repo")?.detail,
    ).toBe("12 files");
    expect(events.at(-1)).toBe("scan_completed");
    sub.dispose();
  });

  it("replays scan_planned to late subscribers while running", () => {
    const tracker = new StructureScanProgressTracker();
    const { report } = tracker.begin({
      projectId: "proj_2",
      mode: "regenerate",
    });
    report({
      type: "step_started",
      scanId: tracker.getProgress("proj_2")!.scanId,
      projectId: "proj_2",
      timestamp: new Date().toISOString(),
      stepId: "map_context",
    });

    const late: string[] = [];
    tracker.subscribe("proj_2", (event) => {
      late.push(event.type);
    });
    expect(late[0]).toBe("scan_planned");
  });

  it("cancelRunning settles immediately and ignores late step events", () => {
    const tracker = new StructureScanProgressTracker();
    const events: string[] = [];
    tracker.subscribe("proj_3", (event) => {
      events.push(event.type);
    });
    const { scanId, report } = tracker.begin({
      projectId: "proj_3",
      mode: "regenerate",
    });
    expect(tracker.cancelRunning("proj_3")).toBe(true);
    expect(tracker.getProgress("proj_3")?.status).toBe("cancelled");
    report({
      type: "step_started",
      scanId,
      projectId: "proj_3",
      timestamp: new Date().toISOString(),
      stepId: "map_components",
    });
    report({
      type: "scan_completed",
      scanId,
      projectId: "proj_3",
      timestamp: new Date().toISOString(),
    });
    expect(tracker.getProgress("proj_3")?.status).toBe("cancelled");
    expect(events.filter((type) => type === "scan_cancelled")).toHaveLength(1);
  });
});
