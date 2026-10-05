import { describe, expect, it } from "vitest";
import {
  FileTimelineEntrySchema,
  FileTimelineIndexSchema,
  SaveFileWithHistoryResultSchema,
} from "./file-timeline.js";

describe("file-timeline contracts", () => {
  it("parses timeline entries and save results", () => {
    const entry = FileTimelineEntrySchema.parse({
      id: "entry-1",
      filePath: "src/a.ts",
      timestamp: "2026-08-02T00:00:00.000Z",
      kind: "manual_save",
      label: "Manual save",
      snapshot: { snapshotId: "snap-1" },
    });

    expect(FileTimelineIndexSchema.parse({ version: "0.1.0", entries: [entry] })).toBeTruthy();
    expect(
      SaveFileWithHistoryResultSchema.parse({ entry, created: false }),
    ).toMatchObject({ created: false });
  });
});
