import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createDraftSpatialPin } from "../contracts/spatial-pin.js";
import {
  deleteSpatialCaptureSession,
  getSpatialCaptureSession,
  listSpatialCaptureSessions,
  SpatialCaptureSessionError,
  upsertSpatialCaptureSession,
} from "./spatial-capture-session-service.js";
import { upsertSpatialPin } from "./spatial-pin-service.js";
import type { SpatialCaptureSession } from "../contracts/spatial-capture-session.js";

describe("spatial-capture-session-service", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function tempRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "spatial-capture-"));
    roots.push(root);
    return root;
  }

  function sampleSession(
    overrides: Partial<SpatialCaptureSession> = {},
  ): SpatialCaptureSession {
    const now = new Date().toISOString();
    return {
      version: "0.1.0",
      id: "cap_1",
      projectId: "proj",
      createdAt: now,
      updatedAt: now,
      status: "archived",
      location: { surface: "screen", url: "spatial://screen" },
      viewport: { width: 1280, height: 800 },
      regions: [
        {
          id: "region_1",
          captureRect: { x: 10, y: 20, width: 100, height: 80 },
          mode: "change",
          regionPrompt: "",
          drawStrokes: [],
          flowComplete: true,
          showAnchors: false,
          tool: "arrow",
          arrows: [
            {
              id: "arrow_1",
              index: 1,
              color: "#4c7dff",
              anchor: "top",
              head: { x: 0.5, y: 0 },
              tail: { x: 0.5, y: -0.4 },
              composeAttach: "bottom",
              prompt: "Fix this button",
              pinId: "pin_running",
              status: "draft",
            },
          ],
        },
      ],
      ...overrides,
    };
  }

  it("round-trips a capture session on disk", () => {
    const root = tempRoot();
    const saved = upsertSpatialCaptureSession(root, sampleSession());
    expect(getSpatialCaptureSession(root, "cap_1")?.regions).toHaveLength(1);
    expect(listSpatialCaptureSessions(root).map((h) => h.id)).toEqual([
      "cap_1",
    ]);
    expect(listSpatialCaptureSessions(root)[0]?.title).toContain(
      "Fix this button",
    );
    expect(saved.regions[0]?.arrows[0]?.prompt).toBe("Fix this button");
  });

  it("blocks delete while a linked pin is running", () => {
    const root = tempRoot();
    upsertSpatialCaptureSession(root, sampleSession());
    const pin = createDraftSpatialPin({
      id: "pin_running",
      projectId: "proj",
      location: { surface: "screen", url: "spatial://screen" },
    });
    pin.status = "awaiting_review";
    pin.composer.prompt = "Fix this button";
    upsertSpatialPin(root, pin);
    // Link runId so the session treats the arrow as in-flight.
    upsertSpatialCaptureSession(
      root,
      sampleSession({
        regions: [
          {
            id: "region_1",
            captureRect: { x: 10, y: 20, width: 100, height: 80 },
            mode: "change",
            regionPrompt: "",
            drawStrokes: [],
            flowComplete: true,
            showAnchors: false,
            tool: "arrow",
            arrows: [
              {
                id: "arrow_1",
                index: 1,
                color: "#4c7dff",
                anchor: "top",
                head: { x: 0.5, y: 0 },
                tail: { x: 0.5, y: -0.4 },
                composeAttach: "bottom",
                prompt: "Fix this button",
                pinId: "pin_running",
                status: "submitted",
                runId: "run_1",
              },
            ],
          },
        ],
      }),
    );

    expect(() => deleteSpatialCaptureSession(root, "cap_1")).toThrow(
      SpatialCaptureSessionError,
    );
    expect(getSpatialCaptureSession(root, "cap_1")).not.toBeNull();
  });

  it("deletes session and capture assets when idle", () => {
    const root = tempRoot();
    const assetsDir = join(root, ".projectos", "spatial-captures", "assets");
    mkdirSync(assetsDir, { recursive: true });
    const backdropRel = ".projectos/spatial-captures/assets/cap_1-backdrop.png";
    writeFileSync(join(root, backdropRel), Buffer.from([1, 2, 3, 4]));
    upsertSpatialCaptureSession(
      root,
      sampleSession({
        backdropAssetPath: backdropRel,
        regions: [
          {
            id: "region_1",
            captureRect: { x: 10, y: 20, width: 100, height: 80 },
            mode: "change",
            regionPrompt: "",
            drawStrokes: [],
            flowComplete: false,
            showAnchors: true,
            tool: "arrow",
            arrows: [],
          },
        ],
      }),
    );
    expect(deleteSpatialCaptureSession(root, "cap_1")).toBe(true);
    expect(getSpatialCaptureSession(root, "cap_1")).toBeNull();
    expect(listSpatialCaptureSessions(root)).toEqual([]);
  });
});
