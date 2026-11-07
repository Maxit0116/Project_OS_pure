import { describe, expect, it } from "vitest";

import {
  isVisibleCaptureFolder,
  nextCaptureVersionTitle,
  partitionSpatialCaptures,
  type SpatialCaptureFolder,
  type SpatialCaptureSessionHead,
} from "./spatial-capture-session.js";

function head(
  overrides: Partial<SpatialCaptureSessionHead> & { id: string },
): SpatialCaptureSessionHead {
  return {
    projectId: "proj",
    status: "archived",
    updatedAt: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    regionCount: 1,
    runningCount: 0,
    title: overrides.id,
    ...overrides,
  };
}

function folder(
  overrides: Partial<SpatialCaptureFolder> & {
    id: string;
    memberSessionIds: string[];
  },
): SpatialCaptureFolder {
  return {
    name: overrides.id,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("capture folder helpers", () => {
  it("requires at least two members to be visible", () => {
    expect(
      isVisibleCaptureFolder(folder({ id: "f1", memberSessionIds: ["a"] })),
    ).toBe(false);
    expect(
      isVisibleCaptureFolder(
        folder({ id: "f1", memberSessionIds: ["a", "b"] }),
      ),
    ).toBe(true);
  });

  it("partitions singleton folder members into misc", () => {
    const heads = [
      head({ id: "a", folderId: "solo" }),
      head({ id: "b", folderId: "pair" }),
      head({ id: "c", folderId: "pair" }),
      head({ id: "d" }),
    ];
    const folders = [
      folder({ id: "solo", memberSessionIds: ["a"] }),
      folder({ id: "pair", name: "Login", memberSessionIds: ["b", "c"] }),
    ];
    const partitioned = partitionSpatialCaptures(heads, folders);
    expect(partitioned.folders.map((f) => f.id)).toEqual(["pair"]);
    expect(partitioned.misc.map((h) => h.id).sort()).toEqual(["a", "d"]);
  });

  it("suggests next {folder}-{n} title", () => {
    expect(nextCaptureVersionTitle("LoginUX", [])).toBe("LoginUX-1");
    expect(
      nextCaptureVersionTitle("LoginUX", ["LoginUX-1", "LoginUX-3", "other"]),
    ).toBe("LoginUX-4");
  });
});
