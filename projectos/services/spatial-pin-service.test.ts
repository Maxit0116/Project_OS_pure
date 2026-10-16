import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createDraftSpatialPin } from "../contracts/spatial-pin.js";
import {
  deleteSpatialPin,
  getSpatialPin,
  listSpatialPinHeads,
  resolveSpatialPins,
  upsertSpatialPin,
} from "./spatial-pin-service.js";

describe("spatial-pin-service", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function tempRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "spatial-pin-"));
    roots.push(root);
    return root;
  }

  it("persists pins under .projectos/spatial-pins", () => {
    const root = tempRoot();
    const draft = createDraftSpatialPin({
      id: "pin_a",
      projectId: "proj",
      location: {
        surface: "projectos-browser",
        url: "http://127.0.0.1:3000/dashboard",
        selector: "[data-testid='cta']",
      },
    });
    draft.composer.prompt = "Make the CTA green";
    const saved = upsertSpatialPin(root, draft);
    expect(getSpatialPin(root, "pin_a")?.composer.prompt).toBe(
      "Make the CTA green",
    );
    expect(listSpatialPinHeads(root).map((h) => h.id)).toEqual(["pin_a"]);
    expect(saved.location.url).toContain("dashboard");
  });

  it("resolves pins by url and selector", () => {
    const root = tempRoot();
    upsertSpatialPin(
      root,
      createDraftSpatialPin({
        id: "pin_exact",
        projectId: "proj",
        location: {
          surface: "chrome",
          url: "http://localhost:3000/settings",
          selector: "#save",
        },
      }),
    );
    upsertSpatialPin(
      root,
      createDraftSpatialPin({
        id: "pin_other",
        projectId: "proj",
        location: {
          surface: "chrome",
          url: "http://localhost:3000/other",
          selector: "#x",
        },
      }),
    );

    const resolved = resolveSpatialPins(root, {
      url: "http://localhost:3000/settings/",
      selector: "#save",
      viewportRect: { x: 1, y: 2, width: 3, height: 4 },
    });
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.pin.id).toBe("pin_exact");
    expect(resolved[0]?.confidence).toBe("exact");
    expect(resolved[0]?.rect).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });

  it("resolves workspace/screen pins by workspace path", () => {
    const root = tempRoot();
    upsertSpatialPin(
      root,
      createDraftSpatialPin({
        id: "pin_ws",
        projectId: "proj",
        location: {
          surface: "workspace",
          url: "spatial://workspace/%2Ftmp%2Fapp",
          workspacePath: "/tmp/app",
        },
      }),
    );
    const resolved = resolveSpatialPins(root, {
      surface: "workspace",
      url: "spatial://workspace/%2Ftmp%2Fapp",
      workspacePath: "/tmp/app",
    });
    expect(resolved.some((item) => item.pin.id === "pin_ws")).toBe(true);
    expect(resolved[0]?.confidence).toBe("approx");
  });

  it("deletes pin files and index heads", () => {
    const root = tempRoot();
    upsertSpatialPin(
      root,
      createDraftSpatialPin({
        id: "pin_del",
        projectId: "proj",
        location: { surface: "chrome", url: "http://localhost:1/" },
      }),
    );
    expect(deleteSpatialPin(root, "pin_del")).toBe(true);
    expect(getSpatialPin(root, "pin_del")).toBeNull();
    expect(listSpatialPinHeads(root)).toEqual([]);
  });
});
