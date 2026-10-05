import { describe, expect, it } from "vitest";

import mapContentFixture from "../client/sample-projectos-fixtures/map-content.json";
import {
  MAP_ARTIFACT_DEFAULT_SIZES,
  MAP_ARTIFACT_MAX_ABSOLUTE_POSITION,
  MAP_ARTIFACT_MAX_SIZE,
  MAP_ARTIFACT_MIN_SIZES,
  ImagePayloadSchema,
  MapArtifactPositionSchema,
  MapArtifactSizeSchema,
  MapArtifactTypeSchema,
  MapContentDocumentSchema,
  NotePayloadSchema,
  PlanPayloadSchema,
  UpdateMapArtifactPatchSchema,
  emptyNoteDocument,
  migrateLegacyNotePayload,
  migrateLegacyPlanPayload,
  parseMapContentDocument,
  plainTextToNoteDocument,
} from "./map-content.js";

describe("MapContentDocumentSchema", () => {
  it("validates the sample map-content fixture", () => {
    const result = MapContentDocumentSchema.safeParse(mapContentFixture);

    expect(
      result.success,
      result.success ? undefined : JSON.stringify(result.error.issues, null, 2),
    ).toBe(true);
  });
});

describe("NotePayloadSchema", () => {
  it("accepts legacy body-only payloads", () => {
    const result = NotePayloadSchema.safeParse({ body: "hello" });
    expect(result.success).toBe(true);
  });

  it("accepts document-only payloads", () => {
    const result = NotePayloadSchema.safeParse({ document: emptyNoteDocument() });
    expect(result.success).toBe(true);
  });

  it("rejects payloads with neither body nor document", () => {
    const result = NotePayloadSchema.safeParse({ title: "Untitled" });
    expect(result.success).toBe(false);
  });

  it("migrates legacy body-only note payloads to document", () => {
    const migrated = migrateLegacyNotePayload({
      title: "Vision",
      body: "Line one\nLine two",
    });
    const result = NotePayloadSchema.safeParse(migrated);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.document).toEqual(plainTextToNoteDocument("Line one\nLine two"));
  });

  it("migrates note artifacts when parsing map content", () => {
    const parsed = parseMapContentDocument({
      version: "0.1.0",
      projectId: "proj_test",
      artifacts: [
        {
          id: "art_note_1",
          type: "note",
          scope: "project",
          position: { x: 0, y: 0 },
          size: { width: 280, height: 160 },
          note: { body: "Legacy note" },
          createdAt: "2026-07-11T00:00:00.000Z",
          updatedAt: "2026-07-11T00:00:00.000Z",
        },
      ],
    });

    const note = parsed.artifacts[0];
    expect(note).toBeDefined();
    if (!note) return;
    expect(note.type).toBe("note");
    if (note.type !== "note") return;

    expect(note.note.document).toEqual(plainTextToNoteDocument("Legacy note"));
  });
});

describe("PlanPayloadSchema", () => {
  it("migrates legacy single-item plan payloads", () => {
    const migrated = migrateLegacyPlanPayload({
      title: "Google OAuth button",
      description: "One-click sign-in on the login page",
      done: false,
    });
    const result = PlanPayloadSchema.safeParse(migrated);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.title).toBe("Google OAuth button");
    expect(result.data.items).toEqual([
      {
        id: "plan_migrated_legacy",
        text: "One-click sign-in on the login page",
        done: false,
      },
    ]);
  });

  it("migrates legacy plan payloads without description to empty items", () => {
    const migrated = migrateLegacyPlanPayload({
      title: "Auth rollout",
      done: true,
    });
    const result = PlanPayloadSchema.safeParse(migrated);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.title).toBe("Auth rollout");
    expect(result.data.items).toEqual([]);
  });
});

describe("MAP_ARTIFACT size constants", () => {
  it("keeps min < default < max for every artifact type", () => {
    for (const type of MapArtifactTypeSchema.options) {
      const min = MAP_ARTIFACT_MIN_SIZES[type];
      const defaults = MAP_ARTIFACT_DEFAULT_SIZES[type];

      expect(min.width).toBeLessThan(defaults.width);
      expect(min.height).toBeLessThan(defaults.height);
      expect(defaults.width).toBeLessThan(MAP_ARTIFACT_MAX_SIZE.width);
      expect(defaults.height).toBeLessThan(MAP_ARTIFACT_MAX_SIZE.height);
    }
  });

  it("rejects non-finite, oversized, and out-of-range geometry", () => {
    expect(MapArtifactSizeSchema.safeParse({
      width: Number.POSITIVE_INFINITY,
      height: 160,
    }).success).toBe(false);
    expect(MapArtifactSizeSchema.safeParse({
      width: MAP_ARTIFACT_MAX_SIZE.width + 1,
      height: 160,
    }).success).toBe(false);
    expect(MapArtifactPositionSchema.safeParse({
      x: Number.NEGATIVE_INFINITY,
      y: 0,
    }).success).toBe(false);
    expect(MapArtifactPositionSchema.safeParse({
      x: MAP_ARTIFACT_MAX_ABSOLUTE_POSITION + 1,
      y: 0,
    }).success).toBe(false);
    expect(MapArtifactPositionSchema.safeParse({ x: 120, y: -80 }).success)
      .toBe(true);
  });
});

describe("TerminalMapArtifact", () => {
  it("validates a terminal artifact with optional payload fields", () => {
    const result = MapContentDocumentSchema.safeParse({
      version: "0.1.0",
      projectId: "proj_test",
      artifacts: [
        {
          id: "art_terminal_1",
          type: "terminal",
          scope: "project",
          position: { x: 100, y: 200 },
          size: { width: 420, height: 280 },
          terminal: { title: "Dev shell" },
          createdAt: "2026-07-11T00:00:00.000Z",
          updatedAt: "2026-07-11T00:00:00.000Z",
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});

describe("ImageMapArtifact", () => {
  it("validates an image artifact with payload fields", () => {
    const result = MapContentDocumentSchema.safeParse({
      version: "0.1.0",
      projectId: "proj_test",
      artifacts: [
        {
          id: "art_image_1",
          type: "image",
          scope: "project",
          position: { x: 100, y: 200 },
          size: { width: 320, height: 240 },
          image: {
            fileName: "wireframe.png",
            assetPath: "map-assets/art_image_1.png",
            mimeType: "image/png",
            width: 1280,
            height: 720,
          },
          createdAt: "2026-07-11T00:00:00.000Z",
          updatedAt: "2026-07-11T00:00:00.000Z",
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("validates an image artifact with optional display title", () => {
    const result = MapContentDocumentSchema.safeParse({
      version: "0.1.0",
      projectId: "proj_test",
      artifacts: [
        {
          id: "art_image_2",
          type: "image",
          scope: "project",
          position: { x: 100, y: 200 },
          size: { width: 320, height: 240 },
          image: {
            title: "Login wireframe",
            fileName: "wireframe.png",
            assetPath: "map-assets/art_image_2.png",
            mimeType: "image/png",
            width: 1280,
            height: 720,
          },
          createdAt: "2026-07-11T00:00:00.000Z",
          updatedAt: "2026-07-11T00:00:00.000Z",
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});

describe("ImagePayloadSchema", () => {
  it("accepts payloads with or without title", () => {
    expect(
      ImagePayloadSchema.safeParse({
        fileName: "wireframe.png",
        assetPath: "map-assets/art_image_1.png",
        mimeType: "image/png",
        width: 1280,
        height: 720,
      }).success,
    ).toBe(true);

    expect(
      ImagePayloadSchema.safeParse({
        title: "Login wireframe",
        fileName: "wireframe.png",
        assetPath: "map-assets/art_image_1.png",
        mimeType: "image/png",
        width: 1280,
        height: 720,
      }).success,
    ).toBe(true);
  });

  it.each([
    "../../evil.png",
    "map-assets/../evil.png",
    "/map-assets/evil.png",
    "\\map-assets\\evil.png",
    "map-assets\\evil.png",
    "map-assets/bad\0name.png",
    "other/evil.png",
  ])("rejects an unsafe map asset path: %s", (assetPath) => {
    expect(
      ImagePayloadSchema.safeParse({
        fileName: "wireframe.png",
        assetPath,
        mimeType: "image/png",
        width: 1280,
        height: 720,
      }).success,
    ).toBe(false);
  });
});

describe("UpdateMapArtifactPatchSchema", () => {
  it("accepts image payload patches", () => {
    const result = UpdateMapArtifactPatchSchema.safeParse({
      image: {
        title: "Updated label",
        fileName: "wireframe.png",
        assetPath: "map-assets/art_image_1.png",
        mimeType: "image/png",
        width: 1280,
        height: 720,
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts stack metadata patches", () => {
    const result = UpdateMapArtifactPatchSchema.safeParse({
      stackId: "stack_1",
      stackOrder: 2,
    });

    expect(result.success).toBe(true);
  });
});
