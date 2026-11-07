import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createDraftSpatialPin } from "../contracts/spatial-pin.js";
import {
  deleteSpatialCaptureFolder,
  deleteSpatialCaptureSession,
  getSpatialCaptureFolder,
  getSpatialCaptureSession,
  listSpatialCaptureFolders,
  listSpatialCaptureSessions,
  mergeSpatialCaptureFolders,
  placeSpatialCaptureSession,
  SpatialCaptureSessionError,
  upsertSpatialCaptureSession,
} from "./spatial-capture-session-service.js";
import { upsertSpatialPin } from "./spatial-pin-service.js";
import {
  partitionSpatialCaptures,
  type SpatialCaptureSession,
} from "../contracts/spatial-capture-session.js";

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
          stencils: [],
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
            stencils: [],
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
            stencils: [],
            arrows: [],
          },
        ],
      }),
    );
    expect(deleteSpatialCaptureSession(root, "cap_1")).toBe(true);
    expect(getSpatialCaptureSession(root, "cap_1")).toBeNull();
    expect(listSpatialCaptureSessions(root)).toEqual([]);
  });

  it("keeps a single-member new folder in misc until a second capture joins", () => {
    const root = tempRoot();
    upsertSpatialCaptureSession(root, sampleSession({ id: "cap_1" }));
    placeSpatialCaptureSession(root, "cap_1", {
      mode: "new_folder",
      folderName: "LoginUX",
      title: "LoginUX-1",
    });
    const folders = listSpatialCaptureFolders(root);
    expect(folders).toHaveLength(1);
    expect(folders[0]?.memberSessionIds).toEqual(["cap_1"]);
    const partitioned = partitionSpatialCaptures(
      listSpatialCaptureSessions(root),
      folders,
    );
    expect(partitioned.folders).toHaveLength(0);
    expect(partitioned.misc.map((h) => h.id)).toEqual(["cap_1"]);

    upsertSpatialCaptureSession(root, sampleSession({ id: "cap_2" }));
    placeSpatialCaptureSession(root, "cap_2", {
      mode: "join_folder",
      folderId: folders[0]!.id,
      title: "",
    });
    const after = partitionSpatialCaptures(
      listSpatialCaptureSessions(root),
      listSpatialCaptureFolders(root),
    );
    expect(after.folders).toHaveLength(1);
    expect(after.folders[0]?.name).toBe("LoginUX");
    expect(after.misc).toHaveLength(0);
    expect(getSpatialCaptureSession(root, "cap_2")?.title).toBe("LoginUX-2");
  });

  it("merges two misc captures into a visible folder", () => {
    const root = tempRoot();
    upsertSpatialCaptureSession(
      root,
      sampleSession({ id: "cap_a", title: "A" }),
    );
    upsertSpatialCaptureSession(
      root,
      sampleSession({ id: "cap_b", title: "B" }),
    );
    placeSpatialCaptureSession(root, "cap_b", {
      mode: "merge_misc",
      otherSessionId: "cap_a",
      folderName: "Checkout",
      title: "Checkout-2",
      otherTitle: "Checkout-1",
    });
    const folder = listSpatialCaptureFolders(root)[0];
    expect(folder?.memberSessionIds.sort()).toEqual(["cap_a", "cap_b"]);
    expect(getSpatialCaptureSession(root, "cap_a")?.folderId).toBe(folder?.id);
    expect(getSpatialCaptureSession(root, "cap_b")?.title).toBe("Checkout-2");
  });

  it("dissolves a folder back to misc, or cascade-deletes members", () => {
    const root = tempRoot();
    upsertSpatialCaptureSession(root, sampleSession({ id: "cap_1" }));
    upsertSpatialCaptureSession(root, sampleSession({ id: "cap_2" }));
    placeSpatialCaptureSession(root, "cap_2", {
      mode: "merge_misc",
      otherSessionId: "cap_1",
      folderName: "Pair",
      title: "Pair-2",
      otherTitle: "Pair-1",
    });
    const folderId = listSpatialCaptureFolders(root)[0]!.id;
    expect(deleteSpatialCaptureFolder(root, folderId, { cascade: false })).toBe(
      true,
    );
    expect(getSpatialCaptureFolder(root, folderId)).toBeNull();
    expect(getSpatialCaptureSession(root, "cap_1")?.folderId).toBeUndefined();
    expect(listSpatialCaptureSessions(root)).toHaveLength(2);

    placeSpatialCaptureSession(root, "cap_2", {
      mode: "merge_misc",
      otherSessionId: "cap_1",
      folderName: "Pair",
      title: "Pair-2",
      otherTitle: "Pair-1",
    });
    const again = listSpatialCaptureFolders(root)[0]!.id;
    expect(deleteSpatialCaptureFolder(root, again, { cascade: true })).toBe(
      true,
    );
    expect(listSpatialCaptureSessions(root)).toEqual([]);
    expect(listSpatialCaptureFolders(root)).toEqual([]);
  });

  it("merges one folder into another and keeps capture titles", () => {
    const root = tempRoot();
    upsertSpatialCaptureSession(
      root,
      sampleSession({ id: "a1", title: "Alpha-1" }),
    );
    upsertSpatialCaptureSession(
      root,
      sampleSession({ id: "a2", title: "Alpha-2" }),
    );
    upsertSpatialCaptureSession(
      root,
      sampleSession({ id: "b1", title: "Beta-1" }),
    );
    upsertSpatialCaptureSession(
      root,
      sampleSession({ id: "b2", title: "Beta-2" }),
    );
    placeSpatialCaptureSession(root, "a2", {
      mode: "merge_misc",
      otherSessionId: "a1",
      folderName: "Alpha",
      title: "Alpha-2",
      otherTitle: "Alpha-1",
    });
    placeSpatialCaptureSession(root, "b2", {
      mode: "merge_misc",
      otherSessionId: "b1",
      folderName: "Beta",
      title: "Beta-2",
      otherTitle: "Beta-1",
    });
    const folders = listSpatialCaptureFolders(root);
    const alpha = folders.find((folder) => folder.name === "Alpha")!;
    const beta = folders.find((folder) => folder.name === "Beta")!;
    const merged = mergeSpatialCaptureFolders(root, alpha.id, beta.id, {
      name: "Release",
    });
    expect(merged.name).toBe("Release");
    expect(merged.memberSessionIds.sort()).toEqual(["a1", "a2", "b1", "b2"]);
    expect(getSpatialCaptureFolder(root, alpha.id)).toBeNull();
    expect(getSpatialCaptureSession(root, "a1")?.folderId).toBe(beta.id);
    expect(getSpatialCaptureSession(root, "a1")?.title).toBe("Alpha-1");
    expect(getSpatialCaptureSession(root, "b2")?.title).toBe("Beta-2");
  });
});
